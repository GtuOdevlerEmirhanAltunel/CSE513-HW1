/** Pure scheduling engine used by both the UI and automated tests. */

export const ALGORITHMS = Object.freeze({
  FCFS: "First-Come, First-Served",
  SJF: "Shortest Job First",
  SRTF: "Shortest Remaining Time First",
  RR: "Round Robin",
});

export function validateInput(processes, algorithm, quantum = 2) {
  const errors = [];
  if (!Array.isArray(processes) || processes.length === 0) {
    errors.push("Add at least one process.");
    return errors;
  }
  if (!Object.hasOwn(ALGORITHMS, algorithm)) {
    errors.push("Choose a supported scheduling algorithm.");
  }

  const seen = new Set();
  processes.forEach((process, index) => {
    const label = `Process ${index + 1}`;
    const id = typeof process.id === "string" ? process.id.trim() : "";
    if (!id) errors.push(`${label}: ID is required.`);
    else if (seen.has(id)) errors.push(`${label}: ID “${id}” is not unique.`);
    else seen.add(id);

    if (!Number.isInteger(process.arrival) || process.arrival < 0) {
      errors.push(`${id || label}: arrival time must be a nonnegative integer.`);
    }
    if (!Number.isInteger(process.burst) || process.burst <= 0) {
      errors.push(`${id || label}: CPU burst must be a positive integer.`);
    }
  });

  if (algorithm === "RR" && (!Number.isInteger(quantum) || quantum <= 0)) {
    errors.push("Round-robin quantum must be a positive integer.");
  }
  return errors;
}

function normalize(processes) {
  return processes.map((process, index) => ({
    id: process.id.trim(),
    arrival: process.arrival,
    burst: process.burst,
    remaining: process.burst,
    index,
    firstStart: null,
    completion: null,
  }));
}

function byArrivalThenInput(a, b) {
  return a.arrival - b.arrival || a.index - b.index;
}

function appendInterval(timeline, id, start, end, merge = true) {
  if (end <= start) return;
  const previous = timeline.at(-1);
  if (merge && previous && previous.id === id && previous.end === start) {
    previous.end = end;
    return;
  }
  timeline.push({ id, start, end });
}

function jumpIfIdle(processes, timeline, time) {
  const nextArrival = Math.min(...processes.filter((p) => p.remaining > 0).map((p) => p.arrival));
  if (nextArrival > time) {
    appendInterval(timeline, "IDLE", time, nextArrival);
    return nextArrival;
  }
  return time;
}

function simulateNonPreemptive(processes, shortestFirst) {
  const timeline = [];
  let time = 0;
  let completed = 0;

  while (completed < processes.length) {
    const ready = processes.filter((p) => p.remaining > 0 && p.arrival <= time);
    if (ready.length === 0) {
      time = jumpIfIdle(processes, timeline, time);
      continue;
    }

    ready.sort((a, b) => {
      if (shortestFirst) return a.burst - b.burst || byArrivalThenInput(a, b);
      return byArrivalThenInput(a, b);
    });
    const process = ready[0];
    process.firstStart ??= time;
    appendInterval(timeline, process.id, time, time + process.remaining);
    time += process.remaining;
    process.remaining = 0;
    process.completion = time;
    completed += 1;
  }
  return timeline;
}

function simulateSrtf(processes) {
  const timeline = [];
  let time = 0;
  let completed = 0;
  let running = null;

  while (completed < processes.length) {
    const ready = processes.filter((p) => p.remaining > 0 && p.arrival <= time);
    if (ready.length === 0) {
      running = null;
      time = jumpIfIdle(processes, timeline, time);
      continue;
    }

    if (!running || running.remaining === 0 || running.arrival > time) {
      running = [...ready].sort((a, b) => a.remaining - b.remaining || byArrivalThenInput(a, b))[0];
    } else {
      const strictlyShorter = ready.filter((p) => p.remaining < running.remaining);
      if (strictlyShorter.length > 0) {
        running = strictlyShorter.sort((a, b) => a.remaining - b.remaining || byArrivalThenInput(a, b))[0];
      }
    }

    running.firstStart ??= time;
    appendInterval(timeline, running.id, time, time + 1);
    running.remaining -= 1;
    time += 1;
    if (running.remaining === 0) {
      running.completion = time;
      completed += 1;
      running = null;
    }
  }
  return timeline;
}

function simulateRoundRobin(processes, quantum) {
  const timeline = [];
  const arrivalOrder = [...processes].sort(byArrivalThenInput);
  const queue = [];
  let nextArrivalIndex = 0;
  let completed = 0;
  let time = 0;

  const enqueueArrivalsThrough = (boundary) => {
    while (nextArrivalIndex < arrivalOrder.length && arrivalOrder[nextArrivalIndex].arrival <= boundary) {
      queue.push(arrivalOrder[nextArrivalIndex]);
      nextArrivalIndex += 1;
    }
  };

  while (completed < processes.length) {
    enqueueArrivalsThrough(time);
    if (queue.length === 0) {
      const nextTime = arrivalOrder[nextArrivalIndex].arrival;
      appendInterval(timeline, "IDLE", time, nextTime);
      time = nextTime;
      enqueueArrivalsThrough(time);
    }

    const process = queue.shift();
    process.firstStart ??= time;
    const duration = Math.min(quantum, process.remaining);
    appendInterval(timeline, process.id, time, time + duration, false);
    time += duration;
    process.remaining -= duration;

    // Arrivals at this exact boundary enter before the unfinished process.
    enqueueArrivalsThrough(time);
    if (process.remaining > 0) queue.push(process);
    else {
      process.completion = time;
      completed += 1;
    }
  }
  return timeline;
}

function calculateMetrics(processes) {
  return [...processes]
    .sort((a, b) => a.index - b.index)
    .map((process) => {
      const turnaround = process.completion - process.arrival;
      const waiting = turnaround - process.burst;
      const response = process.firstStart - process.arrival;
      return {
        id: process.id,
        arrival: process.arrival,
        burst: process.burst,
        firstStart: process.firstStart,
        completion: process.completion,
        turnaround,
        waiting,
        response,
      };
    });
}

function average(metrics, key) {
  return metrics.reduce((sum, row) => sum + row[key], 0) / metrics.length;
}

export function verifySchedule(input, timeline, metrics) {
  const failures = [];
  const executed = new Map(input.map((p) => [p.id.trim(), 0]));

  for (let i = 0; i < timeline.length; i += 1) {
    const interval = timeline[i];
    if (interval.end <= interval.start) failures.push(`Invalid interval ${interval.start}–${interval.end}.`);
    if (i > 0 && timeline[i - 1].end !== interval.start) failures.push("Timeline contains a gap or overlap.");
    if (interval.id !== "IDLE") {
      const process = input.find((p) => p.id.trim() === interval.id);
      if (!process) failures.push(`Unknown process ${interval.id} appears in timeline.`);
      else {
        if (interval.start < process.arrival) failures.push(`${interval.id} runs before arrival.`);
        executed.set(interval.id, executed.get(interval.id) + interval.end - interval.start);
      }
    } else {
      const ready = input.some((p) => {
        const doneBefore = timeline
          .filter((x) => x.id === p.id.trim() && x.end <= interval.start)
          .reduce((sum, x) => sum + x.end - x.start, 0);
        return p.arrival <= interval.start && doneBefore < p.burst;
      });
      if (ready) failures.push(`CPU is idle at time ${interval.start} while work is ready.`);
    }
  }

  input.forEach((p) => {
    if (executed.get(p.id.trim()) !== p.burst) failures.push(`${p.id.trim()} receives ${executed.get(p.id.trim())} instead of ${p.burst} units.`);
  });
  metrics.forEach((row) => {
    if (row.waiting < 0 || row.response < 0) failures.push(`${row.id} has a negative metric.`);
  });
  return { passed: failures.length === 0, failures };
}

export function simulate(input, algorithm, quantum = 2) {
  const errors = validateInput(input, algorithm, quantum);
  if (errors.length) throw new Error(errors.join("\n"));

  const processes = normalize(input);
  let timeline;
  if (algorithm === "FCFS") timeline = simulateNonPreemptive(processes, false);
  else if (algorithm === "SJF") timeline = simulateNonPreemptive(processes, true);
  else if (algorithm === "SRTF") timeline = simulateSrtf(processes);
  else timeline = simulateRoundRobin(processes, quantum);

  const metrics = calculateMetrics(processes);
  const averages = {
    turnaround: average(metrics, "turnaround"),
    waiting: average(metrics, "waiting"),
    response: average(metrics, "response"),
  };
  const verification = verifySchedule(input, timeline, metrics);
  return { algorithm, quantum: algorithm === "RR" ? quantum : null, timeline, metrics, averages, verification };
}

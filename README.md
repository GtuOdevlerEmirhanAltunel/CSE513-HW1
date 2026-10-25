# CPU Scheduling Simulator

A browser-based simulator for comparing four CPU scheduling algorithms:

- First-Come, First-Served (FCFS)
- Shortest Job First (SJF)
- Shortest Remaining Time First (SRTF)
- Round Robin (RR)

The simulator displays a Gantt chart, per-process completion, turnaround, waiting,
and response times, and the average values for those metrics. All calculations run
locally in the browser.

## Run locally

### Requirements

- Node.js 18 or newer
- npm (included with Node.js)
- A modern browser with JavaScript modules enabled

The application has no third-party runtime dependencies.

From the project directory, run:

```sh
npm ci
npm run dev
```

Then open <http://127.0.0.1:5173> in a browser. Stop the server with `Ctrl+C`.
The page must be refreshed manually after source files are changed.

The host and port can be changed with environment variables:

```sh
HOST=0.0.0.0 PORT=5174 npm run dev
```

## Using the simulator

1. Add or remove processes and enter a unique ID, arrival time, and CPU burst for
   each one.
2. Select FCFS, SJF, SRTF, or RR. For RR, also enter a time quantum.
3. Select **Run simulation** to update the timeline and metrics.

The included Workload A and Workload B buttons load reproducible examples. A
specific example can also be opened using query parameters, for example:

```text
http://127.0.0.1:5173/?workload=A&algorithm=RR&quantum=2
```

## Other commands

```sh
npm test       # Run the scheduling-engine tests
npm run build  # Copy the deployable static site into dist/
```

Two optional commands require additional system software:

- `npm run screenshots` requires Chromium or Google Chrome.
- `npm run report` requires a LaTeX distribution with `latexmk` and the packages
  imported by `report/report.tex`.

## Scheduling rules

- Arrival times must be nonnegative integers.
- CPU bursts and the RR quantum must be positive integers.
- Process IDs must be nonempty and unique.
- Ties are resolved by arrival time and then by input order.
- SRTF preempts only when a ready process has a strictly shorter remaining time.
- At an RR quantum boundary, new arrivals are queued before the unfinished running
  process is requeued.
- Timeline intervals use `[start, end)` notation.

## Limitations

- The model represents one CPU, one CPU burst per process, and a finite workload.
- It does not model I/O, priorities, multiple CPU cores, context-switch overhead,
  or dynamic process creation.
- SJF and SRTF assume that each process's CPU burst is known in advance.
- Time is modeled in whole units; fractional arrival, burst, and quantum values are
  not supported.
- Simulation data is kept only in the browser and is not saved between page loads.
- SRTF advances one simulated time unit at a time, and the Gantt chart renders each
  interval in the page. Extremely large workloads or burst values may therefore
  be slow or produce a very wide timeline.

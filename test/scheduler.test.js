import test from "node:test";
import assert from "node:assert/strict";
import { simulate, validateInput } from "../src/core.js";

const workloadA = [
  { id: "P1", arrival: 0, burst: 8 },
  { id: "P2", arrival: 1, burst: 4 },
  { id: "P3", arrival: 2, burst: 2 },
  { id: "P4", arrival: 4, burst: 1 },
];

const workloadB = [
  { id: "P1", arrival: 2, burst: 3 },
  { id: "P2", arrival: 2, burst: 1 },
  { id: "P3", arrival: 8, burst: 2 },
  { id: "P4", arrival: 9, burst: 1 },
];

const compact = (result) => result.timeline.map(({ id, start, end }) => `${start}-${end}:${id}`).join("|");

test("Workload A has the exact required timeline for every policy", () => {
  assert.equal(compact(simulate(workloadA, "FCFS")), "0-8:P1|8-12:P2|12-14:P3|14-15:P4");
  assert.equal(compact(simulate(workloadA, "SJF")), "0-8:P1|8-9:P4|9-11:P3|11-15:P2");
  assert.equal(compact(simulate(workloadA, "SRTF")), "0-1:P1|1-2:P2|2-4:P3|4-5:P4|5-8:P2|8-15:P1");
  assert.equal(compact(simulate(workloadA, "RR", 2)), "0-2:P1|2-4:P2|4-6:P3|6-8:P1|8-9:P4|9-11:P2|11-13:P1|13-15:P1");
});

test("Workload A averages are exact", () => {
  assert.deepEqual(simulate(workloadA, "FCFS").averages, { turnaround: 10.5, waiting: 6.75, response: 6.75 });
  assert.deepEqual(simulate(workloadA, "SJF").averages, { turnaround: 9, waiting: 5.25, response: 5.25 });
  assert.deepEqual(simulate(workloadA, "SRTF").averages, { turnaround: 6.25, waiting: 2.5, response: 0 });
  assert.deepEqual(simulate(workloadA, "RR", 2).averages, { turnaround: 8.5, waiting: 4.75, response: 1.75 });
});

test("Workload B shows both initial and middle idle intervals", () => {
  assert.equal(compact(simulate(workloadB, "FCFS")), "0-2:IDLE|2-5:P1|5-6:P2|6-8:IDLE|8-10:P3|10-11:P4");
  assert.equal(compact(simulate(workloadB, "SJF")), "0-2:IDLE|2-3:P2|3-6:P1|6-8:IDLE|8-10:P3|10-11:P4");
  assert.equal(compact(simulate(workloadB, "SRTF")), "0-2:IDLE|2-3:P2|3-6:P1|6-8:IDLE|8-10:P3|10-11:P4");
  assert.equal(compact(simulate(workloadB, "RR", 2)), "0-2:IDLE|2-4:P1|4-5:P2|5-6:P1|6-8:IDLE|8-10:P3|10-11:P4");
});

test("SRTF keeps the running process when a new job only ties its remaining time", () => {
  const workload = [
    { id: "P1", arrival: 0, burst: 7 },
    { id: "P2", arrival: 2, burst: 2 },
    { id: "P3", arrival: 3, burst: 1 },
  ];
  assert.equal(compact(simulate(workload, "SRTF")), "0-2:P1|2-4:P2|4-5:P3|5-10:P1");
});

test("SJF breaks simultaneous equal-burst ties by input order", () => {
  const workload = [
    { id: "First", arrival: 0, burst: 2 },
    { id: "Second", arrival: 0, burst: 2 },
    { id: "Short", arrival: 1, burst: 1 },
  ];
  assert.equal(compact(simulate(workload, "SJF")), "0-2:First|2-3:Short|3-5:Second");
});

test("RR enqueues exact-boundary arrivals before re-enqueuing the runner", () => {
  const workload = [
    { id: "P1", arrival: 0, burst: 4 },
    { id: "P2", arrival: 2, burst: 1 },
  ];
  assert.equal(compact(simulate(workload, "RR", 2)), "0-2:P1|2-3:P2|3-5:P1");
});

test("RR preserves consecutive slices so quantum boundaries remain visible", () => {
  const result = simulate([{ id: "P1", arrival: 0, burst: 5 }], "RR", 2);
  assert.equal(compact(result), "0-2:P1|2-4:P1|4-5:P1");
});

test("all schedules pass the six implementation invariants", () => {
  for (const workload of [workloadA, workloadB]) {
    for (const algorithm of ["FCFS", "SJF", "SRTF", "RR"]) {
      assert.deepEqual(simulate(workload, algorithm, 2).verification, { passed: true, failures: [] });
    }
  }
});

test("invalid fields produce clear, specific explanations", () => {
  const invalid = [
    { id: "P1", arrival: -1, burst: 0 },
    { id: "P1", arrival: 1.5, burst: 2 },
  ];
  const errors = validateInput(invalid, "RR", 0).join(" ");
  assert.match(errors, /not unique/);
  assert.match(errors, /nonnegative integer/);
  assert.match(errors, /positive integer/);
  assert.match(errors, /quantum must be a positive integer/);
});

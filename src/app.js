import { ALGORITHMS, simulate, validateInput } from "./core.js";

const workloads = {
  A: [
    { id: "P1", arrival: 0, burst: 8 },
    { id: "P2", arrival: 1, burst: 4 },
    { id: "P3", arrival: 2, burst: 2 },
    { id: "P4", arrival: 4, burst: 1 },
  ],
  B: [
    { id: "P1", arrival: 2, burst: 3 },
    { id: "P2", arrival: 2, burst: 1 },
    { id: "P3", arrival: 8, burst: 2 },
    { id: "P4", arrival: 9, burst: 1 },
  ],
};

const colors = ["#2457f5", "#e8513c", "#159b8c", "#8754d6", "#d38d13", "#de4fa3", "#3c789e"];
const decisionNotes = {
  FCFS: "FCFS runs the earliest-arriving ready process to completion. It never preempts.",
  SJF: "SJF chooses the ready process with the shortest full CPU burst whenever the CPU becomes free.",
  SRTF: "SRTF reevaluates when work arrives and preempts only for a strictly shorter remaining time. Equal remaining time keeps the current process running.",
  RR: "Round robin uses a FIFO queue. Arrivals at a quantum boundary are enqueued before the unfinished running process.",
};

const processList = document.querySelector("#process-list");
const quantumField = document.querySelector("#quantum-field");
const errorsBox = document.querySelector("#errors");

function addRow(process = { id: `P${processList.children.length + 1}`, arrival: 0, burst: 1 }) {
  const row = document.createElement("div");
  row.className = "process-row";
  row.innerHTML = `
    <label><span class="sr-only">Process ID</span><input class="process-id" type="text" maxlength="20" value="${escapeHtml(process.id)}" /></label>
    <label><span class="sr-only">Arrival time</span><input class="process-arrival" type="number" min="0" step="1" inputmode="numeric" value="${process.arrival}" /></label>
    <label><span class="sr-only">CPU burst</span><input class="process-burst" type="number" min="1" step="1" inputmode="numeric" value="${process.burst}" /></label>
    <button class="remove-button" type="button" aria-label="Remove ${escapeHtml(process.id)}">×</button>`;
  row.querySelector(".remove-button").addEventListener("click", () => row.remove());
  processList.append(row);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function loadWorkload(name) {
  processList.replaceChildren();
  workloads[name].forEach(addRow);
  run();
}

function readProcesses() {
  return [...processList.querySelectorAll(".process-row")].map((row) => ({
    id: row.querySelector(".process-id").value.trim(),
    arrival: row.querySelector(".process-arrival").valueAsNumber,
    burst: row.querySelector(".process-burst").valueAsNumber,
  }));
}

function selectedAlgorithm() {
  return document.querySelector('input[name="algorithm"]:checked').value;
}

function formatAverage(value) {
  return Number.isInteger(value) ? value.toFixed(2) : value.toFixed(2);
}

function render(result) {
  const colorMap = new Map(result.metrics.map((row, index) => [row.id, colors[index % colors.length]]));
  const total = result.timeline.at(-1).end;
  const gantt = document.querySelector("#gantt");
  gantt.replaceChildren();
  result.timeline.forEach((interval) => {
    const block = document.createElement("div");
    block.className = `gantt-block${interval.id === "IDLE" ? " is-idle" : ""}${result.algorithm === "RR" ? " is-slice" : ""}`;
    block.style.flexGrow = interval.end - interval.start;
    block.style.flexBasis = `${Math.max(58, ((interval.end - interval.start) / total) * 800)}px`;
    if (interval.id !== "IDLE") block.style.setProperty("--block-color", colorMap.get(interval.id));
    block.innerHTML = `<span>${escapeHtml(interval.id)}</span><i class="start">${interval.start}</i><i class="end">${interval.end}</i>`;
    block.title = `${interval.id}: ${interval.start}–${interval.end} (${interval.end - interval.start} units)`;
    gantt.append(block);
  });

  document.querySelector("#timeline-text").textContent = result.timeline.map((x) => `${x.start}–${x.end} ${x.id}`).join("  |  ");
  document.querySelector("#legend").innerHTML = [...colorMap].map(([id, color]) => `<span><i style="--legend-color:${color}"></i>${escapeHtml(id)}</span>`).join("");
  document.querySelector("#run-label").textContent = `${ALGORITHMS[result.algorithm]}${result.quantum ? ` · q = ${result.quantum}` : ""}`;
  document.querySelector("#averages").innerHTML = [
    ["Avg. turnaround", result.averages.turnaround],
    ["Avg. waiting", result.averages.waiting],
    ["Avg. response", result.averages.response],
  ].map(([label, value]) => `<div class="average-card"><span>${label}</span><strong>${formatAverage(value)}</strong></div>`).join("");
  document.querySelector("#metrics-body").innerHTML = result.metrics.map((row) => `<tr><td>${escapeHtml(row.id)}</td><td>${row.arrival}</td><td>${row.burst}</td><td>${row.firstStart}</td><td>${row.completion}</td><td>${row.turnaround}</td><td>${row.waiting}</td><td>${row.response}</td></tr>`).join("");
  const badge = document.querySelector("#verification-badge");
  badge.textContent = result.verification.passed ? "✓ Invariants passed" : "Verification failed";
  badge.title = result.verification.failures.join("\n");
  document.querySelector("#decision-note").textContent = decisionNotes[result.algorithm];
}

function run() {
  const processes = readProcesses();
  const algorithm = selectedAlgorithm();
  const quantum = document.querySelector("#quantum").valueAsNumber;
  const errors = validateInput(processes, algorithm, quantum);
  if (errors.length) {
    errorsBox.textContent = errors.join("\n");
    errorsBox.hidden = false;
    return;
  }
  errorsBox.hidden = true;
  render(simulate(processes, algorithm, quantum));
}

document.querySelector("#add-process").addEventListener("click", () => addRow());
document.querySelector("#run-simulation").addEventListener("click", run);
document.querySelectorAll("[data-workload]").forEach((button) => button.addEventListener("click", () => loadWorkload(button.dataset.workload)));
document.querySelectorAll('input[name="algorithm"]').forEach((radio) => radio.addEventListener("change", () => {
  quantumField.hidden = selectedAlgorithm() !== "RR";
}));

// Query parameters make reproducible demos and automated screenshots possible
// without changing the normal interactive workflow.
const parameters = new URLSearchParams(window.location.search);
const requestedWorkload = parameters.get("workload")?.toUpperCase();
const initialWorkload = Object.hasOwn(workloads, requestedWorkload) ? requestedWorkload : "A";
const requestedAlgorithm = parameters.get("algorithm")?.toUpperCase();
const initialAlgorithm = Object.hasOwn(ALGORITHMS, requestedAlgorithm) ? requestedAlgorithm : "FCFS";
const requestedQuantum = Number(parameters.get("quantum"));

document.querySelector(`input[name="algorithm"][value="${initialAlgorithm}"]`).checked = true;
if (Number.isInteger(requestedQuantum) && requestedQuantum > 0) {
  document.querySelector("#quantum").value = requestedQuantum;
}
quantumField.hidden = initialAlgorithm !== "RR";
loadWorkload(initialWorkload);

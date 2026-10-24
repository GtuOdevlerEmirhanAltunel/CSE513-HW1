import { spawn } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const siteDirectory = resolve(projectRoot, "dist");
const outputDirectory = resolve(projectRoot, "report", "screenshots");

const cases = [
  ["A", "FCFS", "a-fcfs.png", "First-Come, First-Served"],
  ["A", "SJF", "a-sjf.png", "Shortest Job First"],
  ["A", "SRTF", "a-srtf.png", "Shortest Remaining Time First"],
  ["A", "RR", "a-rr.png", "Round Robin"],
  ["B", "FCFS", "b-fcfs.png", "First-Come, First-Served"],
  ["B", "SJF", "b-sjf.png", "Shortest Job First"],
  ["B", "SRTF", "b-srtf.png", "Shortest Remaining Time First"],
  ["B", "RR", "b-rr.png", "Round Robin"],
];

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function findChromium() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  return candidates.find(existsSync);
}

function startServer() {
  const server = createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
      const pathname = decodeURIComponent(requestUrl.pathname);
      const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      let filePath = resolve(siteDirectory, relativePath);
      if (filePath !== siteDirectory && !filePath.startsWith(`${siteDirectory}${sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      if (statSync(filePath).isDirectory()) filePath = resolve(filePath, "index.html");
      response.writeHead(200, {
        "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 400).end("Not found");
    }
  });

  return new Promise((finish, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      finish({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

function createCdpClient(browser) {
  const outgoing = browser.stdio[3];
  const incoming = browser.stdio[4];
  const pending = new Map();
  let nextId = 1;
  let buffer = Buffer.alloc(0);

  incoming.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    let delimiter;
    while ((delimiter = buffer.indexOf(0)) !== -1) {
      const raw = buffer.subarray(0, delimiter).toString("utf8");
      buffer = buffer.subarray(delimiter + 1);
      if (!raw) continue;
      const message = JSON.parse(raw);
      if (!message.id || !pending.has(message.id)) continue;
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(`${message.error.message} (${message.error.code})`));
      else request.finish(message.result || {});
    }
  });

  return function call(method, params = {}, sessionId) {
    return new Promise((finish, reject) => {
      const id = nextId++;
      pending.set(id, { finish, reject });
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      outgoing.write(`${JSON.stringify(message)}\0`);
    });
  };
}

async function waitForResult(call, sessionId, expectedLabel) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await call("Runtime.evaluate", {
        expression: `document.readyState === "complete" && document.querySelector("#verification-badge")?.textContent.includes("Invariants passed") && document.querySelector("#run-label")?.textContent.includes(${JSON.stringify(expectedLabel)})`,
        returnByValue: true,
      }, sessionId);
      if (response.result?.value === true) return;
    } catch {
      // Navigation can replace the execution context between polling attempts.
    }
    await new Promise((finish) => setTimeout(finish, 100));
  }
  throw new Error(`Timed out waiting for the ${expectedLabel} result.`);
}

async function main() {
  const chromium = findChromium();
  if (!chromium) {
    throw new Error("Chrome/Chromium was not found. Set CHROME_BIN to its executable path.");
  }

  mkdirSync(outputDirectory, { recursive: true });
  const profileDirectory = mkdtempSync(join(tmpdir(), "cse513-screenshots-"));
  const { server, origin } = await startServer();
  let browser;

  try {
    browser = spawn(chromium, [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-sandbox",
      "--remote-debugging-pipe",
      `--user-data-dir=${profileDirectory}`,
    ], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });

    let browserErrors = "";
    browser.stderr.on("data", (chunk) => { browserErrors += chunk.toString(); });
    const call = createCdpClient(browser);
    await call("Browser.getVersion");
    const { targetId } = await call("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
    await call("Page.enable", {}, sessionId);
    await call("Runtime.enable", {}, sessionId);
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1100,
      deviceScaleFactor: 1.5,
      mobile: false,
    }, sessionId);

    for (const [workload, algorithm, filename, label] of cases) {
      const url = `${origin}/?workload=${workload}&algorithm=${algorithm}&quantum=2#results`;
      await call("Page.navigate", { url }, sessionId);
      await waitForResult(call, sessionId, label);
      await call("Runtime.evaluate", {
        expression: "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
        awaitPromise: true,
      }, sessionId);

      const layout = await call("Runtime.evaluate", {
        expression: `(() => {
          document.querySelector(".site-header").style.display = "none";
          document.querySelector(".rules-card").style.display = "none";
          const results = document.querySelector("#results");
          results.style.paddingTop = "24px";
          results.style.paddingBottom = "28px";
          const rect = results.getBoundingClientRect();
          return { x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height };
        })()`,
        returnByValue: true,
      }, sessionId);
      const rect = layout.result.value;
      const capture = await call("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: true,
        clip: {
          x: Math.floor(rect.x),
          y: Math.floor(rect.y),
          width: Math.ceil(rect.width),
          height: Math.ceil(rect.height),
          scale: 1,
        },
      }, sessionId);
      writeFileSync(resolve(outputDirectory, filename), Buffer.from(capture.data, "base64"));
      console.log(`Created report/screenshots/${filename}`);
    }

    await call("Browser.close");
    if (browser.exitCode && browser.exitCode !== 0) throw new Error(browserErrors.trim());
  } finally {
    server.close();
    if (browser && browser.exitCode === null) browser.kill("SIGTERM");
    if (profileDirectory.startsWith(`${tmpdir()}${sep}`)) {
      rmSync(profileDirectory, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(`Screenshot generation failed: ${error.message}`);
  process.exitCode = 1;
});

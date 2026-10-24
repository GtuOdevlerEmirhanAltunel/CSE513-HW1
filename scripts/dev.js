import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceDirectory = resolve(projectRoot, "src");
const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "5173", 10);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer from 1 to 65535.");
}

const server = createServer((request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || host}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    let filePath = resolve(sourceDirectory, relativePath);

    if (filePath !== sourceDirectory && !filePath.startsWith(`${sourceDirectory}${sep}`)) {
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
    const status = error?.code === "ENOENT" ? 404 : 400;
    response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(status === 404 ? "Not found" : "Bad request");
  }
});

server.listen(port, host, () => {
  console.log(`CPU Scheduling Lab development server: http://${host}:${port}`);
  console.log("Press Ctrl+C to stop. Refresh the browser after editing source files.");
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Try: PORT=5174 npm run dev`);
    process.exitCode = 1;
    return;
  }
  throw error;
});

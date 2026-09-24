import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, normalize } from "node:path";
import { MatchController } from "./match-controller.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const clients = new Set();
const allowedFiles = new Set(["index.html", "styles.css", "app.js", "fen.js"]);
const imageExtensions = new Set([".png", ".svg", ".jpg", ".jpeg", ".webp", ".gif"]);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// A request is served only if it is one of the whitelisted top-level files, or an image file that
// sits directly inside images/. normalize() has already resolved any "." or ".." segments, and any
// path that escaped the project root no longer starts with "images/", so the prefix check is safe.
function isAllowedFile(safe) {
  if (allowedFiles.has(safe)) return true;
  const name = safe.startsWith("images/") ? safe.slice("images/".length) : null;
  return name !== null && !name.includes("/") && imageExtensions.has(extname(name));
}

function publish(state) {
  const event = `data: ${JSON.stringify(state)}\n\n`;
  for (const client of clients) client.write(event);
}

const controller = new MatchController(publish);

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": contentTypes[".json"] });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 32768) throw new Error("Request body is too large.");
  }
  return body ? JSON.parse(body) : {};
}

async function serveFile(response, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const safe = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  if (!isAllowedFile(safe)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const file = await readFile(join(projectRoot, safe)).catch(() => null);
  if (file === null) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": contentTypes[extname(safe)] ?? "application/octet-stream" });
  response.end(file);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  try {
    if (request.method === "GET" && url.pathname === "/api/state") return sendJson(response, 200, controller.snapshot());
    if (request.method === "GET" && url.pathname === "/api/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      response.write(`data: ${JSON.stringify(controller.snapshot())}\n\n`);
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/match/start") {
      try {
        return sendJson(response, 200, await controller.start(await readJson(request)));
      } catch (error) {
        return sendJson(response, 400, { error: error.message, state: controller.snapshot() });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/match/stop") return sendJson(response, 200, await controller.stop());
    if (request.method === "POST" && url.pathname === "/api/match/reset") return sendJson(response, 200, await controller.reset());
    if (request.method === "GET") return await serveFile(response, url.pathname);
    response.writeHead(405);
    response.end("Method not allowed");
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

let port = Number(process.env.PORT) || 4173;
function listen() {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && port < 4183) {
      port += 1;
      listen();
      return;
    }
    throw error;
  });
  server.listen(port, "127.0.0.1", () => console.log(`Chess Engine Arena running at http://127.0.0.1:${port}`));
}
listen();

async function shutdown() {
  await controller.stop(false);
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

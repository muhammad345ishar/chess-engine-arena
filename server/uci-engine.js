import { EventEmitter } from "node:events";
import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import readline from "node:readline";

export async function validateExecutable(executablePath) {
  if (typeof executablePath !== "string" || executablePath.trim() === "") {
    throw new Error("Engine executable path is required.");
  }
  const resolved = executablePath.trim();
  const details = await stat(resolved).catch(() => null);
  if (!details?.isFile()) throw new Error(`Engine executable does not exist: ${resolved}`);
  await access(resolved, constants.X_OK).catch(() => {
    throw new Error(`Engine file is not executable: ${resolved}`);
  });
  return resolved;
}

export function parseInfoLine(line) {
  if (!line.startsWith("info ")) return null;
  const readNumber = (field) => {
    const match = line.match(new RegExp(`\\b${field} (-?\\d+)`));
    return match ? Number(match[1]) : null;
  };
  const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
  const pvMatch = line.match(/\bpv (.+)$/);
  return {
    depth: readNumber("depth"),
    selDepth: readNumber("seldepth"),
    nodes: readNumber("nodes"),
    nps: readNumber("nps"),
    timeMs: readNumber("time"),
    score: scoreMatch ? { type: scoreMatch[1], value: Number(scoreMatch[2]) } : null,
    pv: pvMatch ? pvMatch[1].trim().split(/\s+/) : [],
  };
}

export class UciEngine extends EventEmitter {
  constructor(executablePath, label) {
    super();
    this.executablePath = executablePath;
    this.label = label;
    this.process = null;
    this.lines = null;
    this.name = label;
    this.author = "Unknown";
    this.closed = false;
  }

  async initialize() {
    this.process = spawn(this.executablePath, [], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    this.process.on("error", (error) => this.emit("engine-error", error));
    this.process.on("exit", (code, signal) => {
      this.closed = true;
      this.emit("engine-exit", { code, signal });
    });
    this.lines = readline.createInterface({ input: this.process.stdout });
    this.lines.on("line", (line) => {
      const clean = line.trim();
      if (clean.startsWith("id name ")) this.name = clean.slice(8).trim();
      if (clean.startsWith("id author ")) this.author = clean.slice(10).trim();
      this.emit("line", clean);
    });
    this.process.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) this.emit("stderr", text);
    });

    const uciReady = this.waitFor((line) => line === "uciok", 8000, "UCI handshake");
    this.send("uci");
    await uciReady;
    const ready = this.waitFor((line) => line === "readyok", 8000, "isready");
    this.send("isready");
    await ready;
    return { name: this.name, author: this.author };
  }

  send(command) {
    if (this.closed || !this.process?.stdin?.writable) throw new Error(`${this.label} is not running.`);
    this.process.stdin.write(`${command}\n`);
  }

  waitFor(predicate, timeoutMs, operation) {
    return new Promise((resolve, reject) => {
      const onLine = (line) => {
        if (!predicate(line)) return;
        cleanup();
        resolve(line);
      };
      const onExit = ({ code, signal }) => {
        cleanup();
        reject(new Error(`${this.name} exited during ${operation} (code ${code ?? "none"}, signal ${signal ?? "none"}).`));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`${this.name} timed out during ${operation}.`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.off("line", onLine);
        this.off("engine-exit", onExit);
      };
      this.on("line", onLine);
      this.on("engine-exit", onExit);
    });
  }

  collect(command, endPredicate, timeoutMs, operation) {
    return new Promise((resolve, reject) => {
      const lines = [];
      const onLine = (line) => {
        lines.push(line);
        if (!endPredicate(line)) return;
        cleanup();
        resolve(lines);
      };
      const onExit = ({ code, signal }) => {
        cleanup();
        reject(new Error(`${this.name} exited during ${operation} (code ${code ?? "none"}, signal ${signal ?? "none"}).`));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`${this.name} timed out during ${operation}.`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.off("line", onLine);
        this.off("engine-exit", onExit);
      };
      this.on("line", onLine);
      this.on("engine-exit", onExit);
      this.send(command);
    });
  }

  async search(positionCommand, goCommand, hardTimeoutMs, onInfo) {
    const onLine = (line) => {
      const info = parseInfoLine(line);
      if (info) onInfo(info);
    };
    this.on("line", onLine);
    try {
      this.send(positionCommand);
      const bestMove = this.waitFor((line) => line.startsWith("bestmove "), hardTimeoutMs, "search");
      this.send(goCommand);
      const line = await bestMove;
      const tokens = line.split(/\s+/);
      return { bestMove: tokens[1] ?? "0000", ponder: tokens[3] ?? null };
    } finally {
      this.off("line", onLine);
    }
  }

  stop() {
    if (!this.closed && this.process?.stdin?.writable) this.process.stdin.write("stop\n");
  }

  async close() {
    if (this.closed || !this.process) return;
    this.closed = true;
    try {
      if (this.process.stdin.writable) this.process.stdin.write("quit\n");
    } catch {
      // Process is already exiting.
    }
    await Promise.race([
      new Promise((resolve) => this.process.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 600)),
    ]);
    if (this.process.exitCode === null) this.process.kill("SIGTERM");
    this.lines?.close();
  }
}

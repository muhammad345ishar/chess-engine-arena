import { UciEngine, validateExecutable } from "./uci-engine.js";
import { START_FEN, flipTurn, parsePlacement, validateFen } from "../fen.js";

const DEFAULT_AETHER = "/Users/muhammadishar/Projects/aether-chess/build/aether";
const DEFAULT_STOCKFISH = "/usr/local/bin/stockfish";

function emptyEngine(slot, path) {
  return {
    slot,
    path,
    name: slot === "A" ? "Engine A" : "Engine B",
    author: "",
    color: slot === "A" ? "w" : "b",
    thinking: false,
    depth: 0,
    selDepth: 0,
    nodes: 0,
    nps: 0,
    pv: [],
    moveElapsedMs: 0,
    totalTimeMs: 0,
  };
}

function initialState(startFen = START_FEN) {
  return {
    status: "idle",
    connected: true,
    message: "Configure two local UCI engines and start a match.",
    settings: {
      engineAPath: DEFAULT_AETHER,
      engineBPath: DEFAULT_STOCKFISH,
      refereePath: DEFAULT_STOCKFISH,
      engineAColor: "w",
      limitMode: "time",
      timeMs: 1000,
      depth: 10,
      maxPlies: 300,
      startFen: START_FEN,
    },
    engines: {
      A: emptyEngine("A", DEFAULT_AETHER),
      B: emptyEngine("B", DEFAULT_STOCKFISH),
    },
    game: {
      fen: startFen,
      turn: fenTurn(startFen),
      fullmove: fenFullmove(startFen),
      history: [],
      lastMove: null,
      inCheck: false,
    },
    evaluation: { type: "cp", value: 0 },
    activeSlot: null,
    moveStartedAt: null,
    result: null,
  };
}

function normalizeSettings(input) {
  return {
    engineAPath: String(input.engineAPath ?? "").trim(),
    engineBPath: String(input.engineBPath ?? "").trim(),
    refereePath: String(input.refereePath ?? DEFAULT_STOCKFISH).trim(),
    engineAColor: input.engineAColor === "b" ? "b" : "w",
    limitMode: input.limitMode === "depth" ? "depth" : "time",
    timeMs: Math.min(120000, Math.max(100, Number(input.timeMs) || 1000)),
    depth: Math.min(64, Math.max(1, Number(input.depth) || 10)),
    maxPlies: Math.min(1000, Math.max(2, Number(input.maxPlies) || 300)),
    startFen: String(input.startFen ?? "").trim() || START_FEN,
  };
}

function positionCommand(startFen, moves) {
  const base = startFen === START_FEN ? "position startpos" : `position fen ${startFen}`;
  return moves.length > 0 ? `${base} moves ${moves.join(" ")}` : base;
}

function fenTurn(fen) {
  return fen.split(" ")[1] || "w";
}

function fenFullmove(fen) {
  return Number(fen.split(" ")[5]) || 1;
}

function canonicalFen(fen) {
  return fen.split(" ").slice(0, 4).join(" ");
}

function insufficientMaterial(fen) {
  const board = parsePlacement(fen.split(" ")[0]);
  const pieces = Object.entries(board)
    .filter(([, piece]) => !/[kK]/.test(piece))
    .map(([square, piece]) => ({ type: piece.toLowerCase(), squareColor: (square.charCodeAt(0) - 97 + Number(square[1])) % 2 }));
  if (pieces.length === 0) return true;
  if (pieces.length === 1 && ["b", "n"].includes(pieces[0].type)) return true;
  return pieces.every((piece) => piece.type === "b") && pieces.every((piece) => piece.squareColor === pieces[0].squareColor);
}

class StockfishReferee {
  constructor(path, startFen = START_FEN) {
    this.engine = new UciEngine(path, "Rules referee");
    this.startFen = startFen;
  }

  async initialize() {
    await this.engine.initialize();
  }

  async legalMoves(moves) {
    this.engine.send(positionCommand(this.startFen, moves));
    const lines = await this.engine.collect("go perft 1", (line) => line.startsWith("Nodes searched:"), 10000, "legal move generation");
    return lines
      .map((line) => line.match(/^([a-h][1-8][a-h][1-8][nbrq]?):\s+\d+$/)?.[1])
      .filter(Boolean);
  }

  async inspect(moves) {
    this.engine.send(positionCommand(this.startFen, moves));
    return this.describe();
  }

  async inspectFen(fen) {
    this.engine.send(`position fen ${fen}`);
    return this.describe();
  }

  async describe() {
    const lines = await this.engine.collect("d", (line) => line.startsWith("Checkers:"), 5000, "position inspection");
    const fen = lines.find((line) => line.startsWith("Fen: "))?.slice(5).trim();
    const checkers = lines.find((line) => line.startsWith("Checkers:"))?.slice(9).trim() ?? "";
    if (!fen) throw new Error("The referee did not return a FEN position.");
    return { fen, inCheck: checkers.length > 0 };
  }

  async close() {
    await this.engine.close();
  }
}

// Confirms the referee accepts the position, adopts its normalized FEN (Stockfish drops castling
// rights and en passant squares that the placement cannot support), and rejects positions that
// cannot occur because the side that just moved left its own king attacked.
async function resolveStartPosition(referee, requestedFen) {
  if (requestedFen === START_FEN) return { fen: START_FEN, inCheck: false };
  const inspected = await referee.inspectFen(requestedFen);
  const [placement, turn] = inspected.fen.split(" ");
  const [wantedPlacement, wantedTurn] = requestedFen.split(" ");
  if (placement !== wantedPlacement || turn !== wantedTurn) {
    throw new Error("The rules referee rejected the custom start position.");
  }
  const opponent = await referee.inspectFen(flipTurn(requestedFen));
  if (opponent.inCheck) {
    throw new Error("Custom start position is invalid: the side not to move is in check.");
  }
  return inspected;
}

export class MatchController {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.state = initialState();
    this.uciMoves = [];
    this.startFen = START_FEN;
    this.processes = { A: null, B: null };
    this.referee = null;
    this.runToken = 0;
    this.lastBroadcastAt = 0;
    this.repetitions = new Map([[canonicalFen(START_FEN), 1]]);
  }

  snapshot() {
    return structuredClone(this.state);
  }

  broadcast(force = true) {
    const now = Date.now();
    if (!force && now - this.lastBroadcastAt < 55) return;
    this.lastBroadcastAt = now;
    this.onUpdate(this.snapshot());
  }

  async start(input) {
    await this.stop(false);
    const settings = normalizeSettings(input);
    settings.engineAPath = await validateExecutable(settings.engineAPath);
    settings.engineBPath = await validateExecutable(settings.engineBPath);
    settings.refereePath = await validateExecutable(settings.refereePath);
    const requested = validateFen(settings.startFen);
    if (!requested.ok) throw new Error(`Custom start position is invalid: ${requested.error}`);
    settings.startFen = requested.fen;
    this.runToken += 1;
    const token = this.runToken;
    this.uciMoves = [];
    this.startFen = settings.startFen;
    this.repetitions = new Map([[canonicalFen(this.startFen), 1]]);
    this.state = initialState(this.startFen);
    this.state.status = "starting";
    this.state.message = "Initializing UCI engines and referee...";
    this.state.settings = settings;
    this.state.engines.A = emptyEngine("A", settings.engineAPath);
    this.state.engines.B = emptyEngine("B", settings.engineBPath);
    this.state.engines.A.color = settings.engineAColor;
    this.state.engines.B.color = settings.engineAColor === "w" ? "b" : "w";
    this.broadcast();

    const engineA = new UciEngine(settings.engineAPath, "Engine A");
    const engineB = new UciEngine(settings.engineBPath, "Engine B");
    const referee = new StockfishReferee(settings.refereePath, this.startFen);
    this.processes = { A: engineA, B: engineB };
    this.referee = referee;
    try {
      const [identityA, identityB] = await Promise.all([engineA.initialize(), engineB.initialize(), referee.initialize()]);
      if (token !== this.runToken) return this.snapshot();
      const resolved = await resolveStartPosition(referee, this.startFen);
      if (token !== this.runToken) return this.snapshot();
      this.startFen = resolved.fen;
      referee.startFen = resolved.fen;
      settings.startFen = resolved.fen;
      this.repetitions = new Map([[canonicalFen(resolved.fen), 1]]);
      Object.assign(this.state.game, {
        fen: resolved.fen,
        turn: fenTurn(resolved.fen),
        fullmove: fenFullmove(resolved.fen),
        inCheck: resolved.inCheck,
      });
      Object.assign(this.state.engines.A, identityA);
      Object.assign(this.state.engines.B, identityB);
      this.state.status = "running";
      this.state.message = "Match in progress";
      this.broadcast();
      void this.run(token);
      return this.snapshot();
    } catch (error) {
      await this.closeProcesses();
      this.state.status = "error";
      this.state.message = error.message;
      this.broadcast();
      throw error;
    }
  }

  async run(token) {
    try {
      while (token === this.runToken && this.state.status === "running") {
        const terminal = await this.terminalResult();
        if (terminal) return this.finish(terminal);
        if (this.uciMoves.length >= this.state.settings.maxPlies) return this.finish({ code: "1/2-1/2", reason: "Maximum move limit reached" });
        await this.playOneMove(token);
      }
    } catch (error) {
      if (token !== this.runToken) return;
      this.state.status = "error";
      this.state.message = error.message;
      this.state.activeSlot = null;
      this.state.moveStartedAt = null;
      for (const engine of Object.values(this.state.engines)) engine.thinking = false;
      this.broadcast();
      await this.closeProcesses();
    }
  }

  async terminalResult() {
    const legalMoves = await this.referee.legalMoves(this.uciMoves);
    if (legalMoves.length === 0) {
      const inspected = await this.referee.inspect(this.uciMoves);
      if (inspected.inCheck) return { code: fenTurn(inspected.fen) === "w" ? "0-1" : "1-0", reason: "Checkmate" };
      return { code: "1/2-1/2", reason: "Stalemate" };
    }
    const fen = this.state.game.fen;
    if (Number(fen.split(" ")[4]) >= 100) return { code: "1/2-1/2", reason: "Fifty-move rule" };
    if ((this.repetitions.get(canonicalFen(fen)) ?? 0) >= 3) return { code: "1/2-1/2", reason: "Threefold repetition" };
    if (insufficientMaterial(fen)) return { code: "1/2-1/2", reason: "Insufficient material" };
    return null;
  }

  async playOneMove(token) {
    const turn = this.state.game.turn;
    const moveNumber = this.state.game.fullmove;
    const legalMoves = await this.referee.legalMoves(this.uciMoves);
    const slot = this.state.engines.A.color === turn ? "A" : "B";
    const engineState = this.state.engines[slot];
    const engine = this.processes[slot];
    const startedAt = Date.now();
    this.state.activeSlot = slot;
    this.state.moveStartedAt = startedAt;
    engineState.thinking = true;
    Object.assign(engineState, { depth: 0, selDepth: 0, nodes: 0, nps: 0, pv: [], moveElapsedMs: 0 });
    this.state.message = `${engineState.name} is thinking`;
    this.broadcast();

    const goCommand = this.state.settings.limitMode === "time"
      ? `go movetime ${this.state.settings.timeMs}`
      : `go depth ${this.state.settings.depth}`;
    const hardTimeout = this.state.settings.limitMode === "time" ? this.state.settings.timeMs + 2500 : 10 * 60 * 1000;
    let latestScore = null;
    const response = await engine.search(positionCommand(this.startFen, this.uciMoves), goCommand, hardTimeout, (info) => {
      if (token !== this.runToken) return;
      if (info.depth !== null) engineState.depth = info.depth;
      if (info.selDepth !== null) engineState.selDepth = info.selDepth;
      if (info.nodes !== null) engineState.nodes = info.nodes;
      if (info.nps !== null) engineState.nps = info.nps;
      if (info.timeMs !== null) engineState.moveElapsedMs = info.timeMs;
      if (info.pv.length > 0) engineState.pv = info.pv.slice(0, 8);
      if (info.score) {
        latestScore = info.score;
        this.state.evaluation = { type: info.score.type, value: turn === "w" ? info.score.value : -info.score.value };
      }
      this.broadcast(false);
    });
    if (token !== this.runToken) return;

    const elapsedMs = Date.now() - startedAt;
    Object.assign(engineState, { thinking: false, moveElapsedMs: elapsedMs, totalTimeMs: engineState.totalTimeMs + elapsedMs });
    this.state.activeSlot = null;
    this.state.moveStartedAt = null;
    if (!legalMoves.includes(response.bestMove)) throw new Error(`${engineState.name} returned an illegal move: ${response.bestMove}`);
    this.uciMoves.push(response.bestMove);
    const inspected = await this.referee.inspect(this.uciMoves);
    const canonical = canonicalFen(inspected.fen);
    this.repetitions.set(canonical, (this.repetitions.get(canonical) ?? 0) + 1);
    const record = {
      ply: this.uciMoves.length,
      moveNumber,
      color: turn,
      uci: response.bestMove,
      from: response.bestMove.slice(0, 2),
      to: response.bestMove.slice(2, 4),
      engine: engineState.name,
      elapsedMs,
      depth: engineState.depth,
      score: latestScore ? { type: latestScore.type, value: turn === "w" ? latestScore.value : -latestScore.value } : null,
    };
    this.state.game = {
      fen: inspected.fen,
      turn: fenTurn(inspected.fen),
      fullmove: fenFullmove(inspected.fen),
      history: [...this.state.game.history, record],
      lastMove: { from: record.from, to: record.to, uci: record.uci },
      inCheck: inspected.inCheck,
    };
    this.state.message = `${engineState.name} played ${response.bestMove}`;
    this.broadcast();
  }

  finish(result) {
    this.state.status = "finished";
    this.state.result = result;
    this.state.message = `${result.code} - ${result.reason}`;
    this.state.activeSlot = null;
    this.state.moveStartedAt = null;
    for (const engine of Object.values(this.state.engines)) engine.thinking = false;
    this.broadcast();
    void this.closeProcesses();
  }

  async stop(markStopped = true) {
    this.runToken += 1;
    for (const engine of Object.values(this.processes)) engine?.stop();
    await this.closeProcesses();
    if (markStopped && ["running", "starting"].includes(this.state.status)) {
      this.state.status = "stopped";
      this.state.message = "Match stopped";
      this.state.activeSlot = null;
      this.state.moveStartedAt = null;
      for (const engine of Object.values(this.state.engines)) engine.thinking = false;
      this.broadcast();
    }
    return this.snapshot();
  }

  async reset() {
    await this.stop(false);
    const settings = this.state.settings;
    this.uciMoves = [];
    this.startFen = validateFen(settings.startFen).ok ? settings.startFen : START_FEN;
    this.repetitions = new Map([[canonicalFen(this.startFen), 1]]);
    this.state = initialState(this.startFen);
    this.state.settings = settings;
    this.state.engines.A.path = settings.engineAPath;
    this.state.engines.B.path = settings.engineBPath;
    this.state.engines.A.color = settings.engineAColor;
    this.state.engines.B.color = settings.engineAColor === "w" ? "b" : "w";
    this.broadcast();
    return this.snapshot();
  }

  async closeProcesses() {
    const engines = Object.values(this.processes).filter(Boolean);
    if (this.referee) engines.push(this.referee);
    this.processes = { A: null, B: null };
    this.referee = null;
    await Promise.allSettled(engines.map((engine) => engine.close()));
  }
}

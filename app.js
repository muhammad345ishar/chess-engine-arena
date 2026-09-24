import { EMPTY_FEN, START_FEN, parsePlacement, serializeFen, validateFen } from "./fen.js";

const PIECE_NAMES = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
const PALETTE = ["K", "Q", "R", "B", "N", "P", "k", "q", "r", "b", "n", "p"];

// Piece art lives in images/, named <color><type>.png, e.g. wn.png for a white knight.
function pieceImage(code) {
  return `images/${code === code.toUpperCase() ? "w" : "b"}${code.toLowerCase()}.png`;
}
const CASTLING_RIGHTS = [
  { right: "K", label: "White kingside" },
  { right: "Q", label: "White queenside" },
  { right: "k", label: "Black kingside" },
  { right: "q", label: "Black queenside" },
];

const ICONS = {
  play: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 3 14 9-14 9V3z"/></svg>',
  stop: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
  reset: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  swap: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>',
  flip: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m17 3 4 4-4 4"/><path d="M3 7h18"/><path d="m7 21-4-4 4-4"/><path d="M21 17H3"/></svg>',
  copy: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
};

const ids = [
  "connectionDot", "connectionText", "statusBadge", "engineAPath", "engineBPath", "refereePath",
  "colorBadgeA", "colorBadgeB", "startButton", "stopButton", "resetButton", "swapButton",
  "timeMode", "depthMode", "timeField", "depthField", "timeMs", "depth", "maxPlies",
  "messageBar", "enginePanelA", "enginePanelB", "turnIndicator", "resultDisplay", "flipButton",
  "whiteEval", "evalScore", "evalLabelTop", "evalLabelBottom", "chessboard", "moveCount",
  "moveTableBody", "activeEngineLabel", "pvLine", "fenText", "copyFenButton", "toast",
  "standardPosition", "customPosition", "positionEditor", "editorValidity", "piecePalette",
  "editorWhiteToMove", "editorBlackToMove", "castlingChips", "editorEp", "editorHalfmove",
  "editorFullmove", "startFen", "editorStandardButton", "editorClearButton", "editorUseGameButton",
];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
document.querySelectorAll("[data-icon]").forEach((node) => { node.innerHTML = ICONS[node.dataset.icon] ?? ""; });

let state = null;
let engineAColor = "w";
let limitMode = "time";
let flipped = false;
let settingsInitialized = false;
let toastTimer = null;
let positionMode = "standard";
let editor = validateFen(START_FEN).position;
let brush = "P";
let dragFrom = null;
let dragPiece = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 3200);
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en", { notation: value >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function formatTime(milliseconds) {
  const value = Math.max(0, milliseconds || 0);
  if (value < 10000) return `${(value / 1000).toFixed(2)}s`;
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatEval(score) {
  if (!score) return "--";
  if (score.type === "mate") return `${score.value >= 0 ? "+" : "-"}M${Math.abs(score.value)}`;
  const pawns = score.value / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function pieceLabel(code) {
  return `${code === code.toUpperCase() ? "White" : "Black"} ${PIECE_NAMES[code.toLowerCase()]}`;
}

function matchLocked() {
  return ["running", "starting"].includes(state?.status);
}

function editingActive() {
  return positionMode === "custom" && !matchLocked();
}

function editorFen() {
  return serializeFen(editor);
}

function displayFen() {
  return editingActive() ? editorFen() : state.game.fen;
}

function readBoard(fen) {
  try {
    return parsePlacement(fen.split(" ")[0]);
  } catch {
    return {};
  }
}

function renderBoard() {
  const editing = editingActive();
  const board = readBoard(displayFen());
  const files = flipped ? ["h", "g", "f", "e", "d", "c", "b", "a"] : ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const last = editing ? null : state.game.lastMove;
  const checkedKing = !editing && state.game.inCheck ? (state.game.turn === "w" ? "K" : "k") : null;
  const fragment = document.createDocumentFragment();
  for (const rank of ranks) {
    for (const file of files) {
      const name = `${file}${rank}`;
      const square = document.createElement("div");
      const light = (file.charCodeAt(0) - 97 + rank) % 2 === 0;
      square.className = `square ${light ? "light" : "dark"}`;
      if (last && [last.from, last.to].includes(name)) square.classList.add("last");
      const pieceCode = board[name];
      if (pieceCode === checkedKing) square.classList.add("check");
      if (editing) {
        square.dataset.square = name;
        square.tabIndex = 0;
        square.setAttribute("role", "button");
        square.setAttribute("aria-label", pieceCode ? `${name}, ${pieceLabel(pieceCode)}` : `${name}, empty`);
      }
      if (pieceCode) {
        const piece = document.createElement("img");
        piece.className = "piece";
        piece.src = pieceImage(pieceCode);
        piece.alt = pieceLabel(pieceCode);
        piece.draggable = editing;
        square.append(piece);
      }
      if (file === files[0]) {
        const coordinate = document.createElement("span");
        coordinate.className = "coordinate rank";
        coordinate.textContent = rank;
        square.append(coordinate);
      }
      if (rank === ranks[ranks.length - 1]) {
        const coordinate = document.createElement("span");
        coordinate.className = "coordinate file";
        coordinate.textContent = file;
        square.append(coordinate);
      }
      fragment.append(square);
    }
  }
  elements.chessboard.classList.toggle("editing", editing);
  elements.chessboard.setAttribute("role", editing ? "group" : "img");
  elements.chessboard.setAttribute("aria-label", editing ? "Editable chess position" : "Chess position");
  elements.chessboard.replaceChildren(fragment);
}

function evaluationPercent(evaluation) {
  if (evaluation.type === "mate") return evaluation.value > 0 ? 100 : evaluation.value < 0 ? 0 : 50;
  return 100 / (1 + Math.exp(-evaluation.value / 350));
}

function renderEvaluation() {
  if (editingActive()) {
    elements.whiteEval.style.height = "50%";
    elements.evalScore.textContent = "--";
  } else {
    const percent = evaluationPercent(state.evaluation);
    elements.whiteEval.style.height = `${Math.min(100, Math.max(0, percent))}%`;
    elements.evalScore.textContent = formatEval(state.evaluation);
  }
  elements.evalLabelTop.textContent = flipped ? "White" : "Black";
  elements.evalLabelBottom.textContent = flipped ? "Black" : "White";
}

function renderTurnIndicator() {
  if (editingActive()) {
    elements.turnIndicator.textContent = `${editor.turn === "w" ? "White" : "Black"} to move - editing start position`;
    return;
  }
  elements.turnIndicator.textContent = `${state.game.turn === "w" ? "White" : "Black"} to move${state.game.inCheck ? " - check" : ""}`;
}

function currentMoveElapsed(engine) {
  if (!engine.thinking || !state.moveStartedAt) return engine.moveElapsedMs;
  return Math.max(engine.moveElapsedMs, Date.now() - state.moveStartedAt);
}

function enginePanel(engine) {
  const elapsed = currentMoveElapsed(engine);
  const limit = state.settings.limitMode === "time" ? state.settings.timeMs : null;
  const progress = limit ? Math.min(100, elapsed * 100 / limit) : 0;
  return `
    <div class="engine-panel-header">
      <div class="engine-identity">
        <span class="engine-color-icon ${engine.color === "w" ? "white" : "black"}" aria-hidden="true"></span>
        <div class="engine-title-wrap">
          <h2 class="engine-name" title="${escapeHtml(engine.name)}">${escapeHtml(engine.name)}</h2>
          <div class="engine-author" title="${escapeHtml(engine.author || engine.path)}">${escapeHtml(engine.author || engine.path)}</div>
        </div>
        ${engine.thinking ? '<span class="thinking-label">THINKING</span>' : ""}
      </div>
    </div>
    <div class="engine-clock">
      <div class="clock-line"><span class="clock-value">${formatTime(elapsed)}</span><span class="clock-caption">current move</span></div>
      <div class="clock-track"><div class="clock-progress" style="width:${progress}%"></div></div>
    </div>
    <div class="engine-stats">
      <div class="stat-line"><span class="stat-key">Depth</span><span class="stat-value">${engine.depth || 0}${engine.selDepth ? ` / ${engine.selDepth}` : ""}</span></div>
      <div class="stat-line"><span class="stat-key">Nodes</span><span class="stat-value">${formatNumber(engine.nodes)}</span></div>
      <div class="stat-line"><span class="stat-key">NPS</span><span class="stat-value">${formatNumber(engine.nps)}</span></div>
      <div class="stat-line"><span class="stat-key">Total time</span><span class="stat-value">${formatTime(engine.totalTimeMs)}</span></div>
    </div>`;
}

function renderEngines() {
  elements.enginePanelA.innerHTML = enginePanel(state.engines.A);
  elements.enginePanelB.innerHTML = enginePanel(state.engines.B);
  elements.enginePanelA.classList.toggle("active", state.engines.A.thinking);
  elements.enginePanelB.classList.toggle("active", state.engines.B.thinking);
}

function renderMoves() {
  const rows = new Map();
  for (const record of state.game.history) {
    const number = record.moveNumber ?? Math.floor((record.ply - 1) / 2) + 1;
    if (!rows.has(number)) rows.set(number, { number, white: null, black: null });
    rows.get(number)[record.color === "w" ? "white" : "black"] = record;
  }
  elements.moveTableBody.innerHTML = [...rows.values()].map((pair) => {
    const finalRecord = pair.black || pair.white;
    return `<tr>
      <td>${pair.number}</td>
      <td class="move-cell" title="${escapeHtml(pair.white?.engine || "")}">${escapeHtml(pair.white?.uci || "")}</td>
      <td class="move-cell" title="${escapeHtml(pair.black?.engine || "")}">${escapeHtml(pair.black?.uci || "")}</td>
      <td>${formatEval(finalRecord?.score)}</td>
    </tr>`;
  }).join("");
  elements.moveCount.textContent = `${state.game.history.length} ${state.game.history.length === 1 ? "ply" : "plies"}`;
  const scroller = elements.moveTableBody.closest(".move-table-wrap");
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
}

function renderLiveAnalysis() {
  const active = state.activeSlot ? state.engines[state.activeSlot] : null;
  elements.activeEngineLabel.textContent = active ? active.name : "Waiting";
  elements.pvLine.textContent = active?.pv?.length ? active.pv.join("  ") : "No principal variation";
  elements.fenText.textContent = displayFen();
}

function renderSettingsState() {
  const locked = matchLocked();
  const controls = [elements.engineAPath, elements.engineBPath, elements.refereePath, elements.timeMs, elements.depth,
    elements.maxPlies, elements.timeMode, elements.depthMode, elements.swapButton, elements.standardPosition,
    elements.customPosition, elements.startFen, elements.editorEp, elements.editorHalfmove, elements.editorFullmove,
    elements.editorWhiteToMove, elements.editorBlackToMove, elements.editorStandardButton, elements.editorClearButton,
    elements.editorUseGameButton];
  controls.forEach((control) => { control.disabled = locked; });
  elements.positionEditor.querySelectorAll(".palette-piece, .castling-chip").forEach((button) => { button.disabled = locked; });
  elements.positionEditor.classList.toggle("hidden", positionMode !== "custom" || locked);
  elements.startButton.disabled = locked;
  elements.stopButton.disabled = !locked;
  elements.resetButton.disabled = state.status === "starting";
}

function renderPositionViews() {
  renderBoard();
  renderEvaluation();
  renderTurnIndicator();
  renderLiveAnalysis();
}

function render() {
  if (!state) return;
  elements.connectionDot.classList.add("online");
  elements.connectionText.textContent = "Local server";
  elements.statusBadge.textContent = state.status;
  elements.messageBar.textContent = state.message;
  elements.messageBar.className = `message-bar ${state.status === "error" ? "error" : state.status === "running" ? "running" : ""}`;
  elements.resultDisplay.textContent = state.result ? `${state.result.code}  ${state.result.reason}` : "";
  renderSettingsState();
  renderPositionViews();
  renderEngines();
  renderMoves();
}

function buildPalette() {
  const fragment = document.createDocumentFragment();
  for (const code of PALETTE) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `palette-piece ${code === code.toUpperCase() ? "white" : "black"}`;
    button.dataset.piece = code;
    button.draggable = true;
    const image = document.createElement("img");
    image.src = pieceImage(code);
    image.alt = "";
    image.draggable = false;
    button.append(image);
    button.title = pieceLabel(code);
    button.setAttribute("aria-label", pieceLabel(code));
    fragment.append(button);
  }
  const eraser = document.createElement("button");
  eraser.type = "button";
  eraser.className = "palette-piece eraser";
  eraser.dataset.piece = "";
  eraser.textContent = "⌫";
  eraser.title = "Erase";
  eraser.setAttribute("aria-label", "Erase squares");
  fragment.append(eraser);
  elements.piecePalette.replaceChildren(fragment);

  const chips = document.createDocumentFragment();
  for (const { right, label } of CASTLING_RIGHTS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "castling-chip";
    chip.dataset.right = right;
    chip.textContent = right;
    chip.title = label;
    chip.setAttribute("aria-label", label);
    chips.append(chip);
  }
  elements.castlingChips.replaceChildren(chips);
  updatePaletteSelection();
}

function updatePaletteSelection() {
  elements.piecePalette.querySelectorAll(".palette-piece").forEach((button) => {
    const selected = (button.dataset.piece || null) === brush;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function refreshEditorValidity() {
  const result = validateFen(elements.startFen.value);
  const message = result.ok
    ? `${result.position.turn === "w" ? "White" : "Black"} to move, move ${result.position.fullmove}`
    : result.error;
  elements.editorValidity.textContent = message;
  elements.editorValidity.classList.toggle("invalid", !result.ok);
  elements.startFen.classList.toggle("invalid", !result.ok);
  return result;
}

function syncEditorControls() {
  elements.editorWhiteToMove.classList.toggle("active", editor.turn === "w");
  elements.editorBlackToMove.classList.toggle("active", editor.turn === "b");
  elements.castlingChips.querySelectorAll(".castling-chip").forEach((chip) => {
    const enabled = editor.castling.includes(chip.dataset.right);
    chip.classList.toggle("active", enabled);
    chip.setAttribute("aria-pressed", String(enabled));
  });
  elements.editorEp.value = editor.ep === "-" ? "" : editor.ep;
  elements.editorHalfmove.value = editor.halfmove;
  elements.editorFullmove.value = editor.fullmove;
}

function commitEditor() {
  elements.startFen.value = editorFen();
  syncEditorControls();
  refreshEditorValidity();
  renderPositionViews();
}

function loadEditorFen(fen) {
  const result = validateFen(fen);
  if (!result.ok) { showToast(result.error); return; }
  editor = result.position;
  commitEditor();
}

function setSquare(name, piece) {
  if (piece) editor.board[name] = piece;
  else delete editor.board[name];
  commitEditor();
}

function stampSquare(name) {
  setSquare(name, editor.board[name] === brush ? null : brush);
}

function applyPositionMode() {
  elements.standardPosition.classList.toggle("active", positionMode === "standard");
  elements.customPosition.classList.toggle("active", positionMode === "custom");
  elements.positionEditor.classList.toggle("hidden", positionMode !== "custom" || matchLocked());
}

function setPositionMode(mode) {
  if (positionMode === mode) return;
  positionMode = mode;
  applyPositionMode();
  if (mode === "custom") elements.startFen.value = editorFen();
  refreshEditorValidity();
  render();
}

function initializeSettings(settings) {
  if (settingsInitialized) return;
  elements.engineAPath.value = settings.engineAPath;
  elements.engineBPath.value = settings.engineBPath;
  elements.refereePath.value = settings.refereePath;
  elements.timeMs.value = settings.timeMs;
  elements.depth.value = settings.depth;
  elements.maxPlies.value = settings.maxPlies;
  engineAColor = settings.engineAColor;
  limitMode = settings.limitMode;
  const stored = validateFen(settings.startFen ?? START_FEN);
  if (stored.ok) {
    editor = stored.position;
    positionMode = stored.fen === START_FEN ? "standard" : "custom";
  }
  buildPalette();
  elements.startFen.value = editorFen();
  syncEditorControls();
  refreshEditorValidity();
  applyPositionMode();
  updateColorBadges();
  updateLimitMode();
  settingsInitialized = true;
}

function updateColorBadges() {
  const aWhite = engineAColor === "w";
  elements.colorBadgeA.textContent = aWhite ? "White" : "Black";
  elements.colorBadgeB.textContent = aWhite ? "Black" : "White";
  elements.colorBadgeA.className = `color-badge ${aWhite ? "white" : "black"}`;
  elements.colorBadgeB.className = `color-badge ${aWhite ? "black" : "white"}`;
}

function updateLimitMode() {
  elements.timeMode.classList.toggle("active", limitMode === "time");
  elements.depthMode.classList.toggle("active", limitMode === "depth");
  elements.timeField.classList.toggle("hidden", limitMode !== "time");
  elements.depthField.classList.toggle("hidden", limitMode !== "depth");
}

async function post(path, body = {}) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}

elements.startButton.addEventListener("click", async () => {
  let startFen = START_FEN;
  if (positionMode === "custom") {
    const result = refreshEditorValidity();
    if (!result.ok) { showToast(result.error); return; }
    startFen = result.fen;
    elements.startFen.value = startFen;
  }
  const settings = {
    engineAPath: elements.engineAPath.value,
    engineBPath: elements.engineBPath.value,
    refereePath: elements.refereePath.value,
    engineAColor,
    limitMode,
    timeMs: Number(elements.timeMs.value),
    depth: Number(elements.depth.value),
    maxPlies: Number(elements.maxPlies.value),
    startFen,
  };
  elements.startButton.disabled = true;
  try { state = await post("/api/match/start", settings); render(); }
  catch (error) { showToast(error.message); elements.startButton.disabled = false; }
});

elements.stopButton.addEventListener("click", async () => {
  try { state = await post("/api/match/stop"); render(); }
  catch (error) { showToast(error.message); }
});

elements.resetButton.addEventListener("click", async () => {
  try { state = await post("/api/match/reset"); render(); }
  catch (error) { showToast(error.message); }
});

elements.swapButton.addEventListener("click", () => { engineAColor = engineAColor === "w" ? "b" : "w"; updateColorBadges(); });
elements.timeMode.addEventListener("click", () => { limitMode = "time"; updateLimitMode(); });
elements.depthMode.addEventListener("click", () => { limitMode = "depth"; updateLimitMode(); });
elements.flipButton.addEventListener("click", () => { flipped = !flipped; renderBoard(); renderEvaluation(); });
elements.copyFenButton.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(displayFen()); showToast("FEN copied"); }
  catch { showToast("Could not copy FEN"); }
});

elements.standardPosition.addEventListener("click", () => setPositionMode("standard"));
elements.customPosition.addEventListener("click", () => setPositionMode("custom"));
elements.editorStandardButton.addEventListener("click", () => loadEditorFen(START_FEN));
elements.editorClearButton.addEventListener("click", () => loadEditorFen(EMPTY_FEN));
elements.editorUseGameButton.addEventListener("click", () => loadEditorFen(state?.game?.fen ?? START_FEN));
elements.editorWhiteToMove.addEventListener("click", () => { editor.turn = "w"; commitEditor(); });
elements.editorBlackToMove.addEventListener("click", () => { editor.turn = "b"; commitEditor(); });
elements.editorEp.addEventListener("change", () => {
  editor.ep = elements.editorEp.value.trim().toLowerCase() || "-";
  commitEditor();
  elements.editorEp.classList.toggle("invalid", editor.ep !== "-" && !/^[a-h][36]$/.test(editor.ep));
});
elements.editorHalfmove.addEventListener("change", () => { editor.halfmove = Math.max(0, Number(elements.editorHalfmove.value) || 0); commitEditor(); });
elements.editorFullmove.addEventListener("change", () => { editor.fullmove = Math.max(1, Number(elements.editorFullmove.value) || 1); commitEditor(); });

elements.piecePalette.addEventListener("click", (event) => {
  const button = event.target.closest(".palette-piece");
  if (!button) return;
  brush = button.dataset.piece || null;
  updatePaletteSelection();
});

elements.piecePalette.addEventListener("dragstart", (event) => {
  const button = event.target.closest(".palette-piece");
  if (!button?.dataset.piece) return;
  dragFrom = null;
  dragPiece = button.dataset.piece;
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("text/plain", dragPiece);
});

elements.castlingChips.addEventListener("click", (event) => {
  const chip = event.target.closest(".castling-chip");
  if (!chip) return;
  const rights = new Set(editor.castling === "-" ? [] : editor.castling.split(""));
  if (rights.has(chip.dataset.right)) rights.delete(chip.dataset.right);
  else rights.add(chip.dataset.right);
  editor.castling = [..."KQkq"].filter((letter) => rights.has(letter)).join("") || "-";
  commitEditor();
});

elements.startFen.addEventListener("input", () => {
  const result = refreshEditorValidity();
  if (!result.ok) return;
  editor = result.position;
  syncEditorControls();
  renderPositionViews();
});

elements.startFen.addEventListener("change", () => {
  const result = validateFen(elements.startFen.value);
  if (!result.ok) return;
  editor = result.position;
  commitEditor();
});

elements.chessboard.addEventListener("click", (event) => {
  const square = editingActive() ? event.target.closest(".square") : null;
  if (square) stampSquare(square.dataset.square);
});

elements.chessboard.addEventListener("keydown", (event) => {
  if (!editingActive() || !["Enter", " "].includes(event.key)) return;
  const square = event.target.closest(".square");
  if (!square) return;
  event.preventDefault();
  stampSquare(square.dataset.square);
});

elements.chessboard.addEventListener("contextmenu", (event) => {
  const square = editingActive() ? event.target.closest(".square") : null;
  if (!square) return;
  event.preventDefault();
  setSquare(square.dataset.square, null);
});

elements.chessboard.addEventListener("dragstart", (event) => {
  const square = editingActive() ? event.target.closest(".square") : null;
  if (!square || !editor.board[square.dataset.square]) return;
  dragPiece = null;
  dragFrom = square.dataset.square;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", dragFrom);
});

elements.chessboard.addEventListener("dragover", (event) => {
  if (!editingActive() || (!dragFrom && !dragPiece)) return;
  const square = event.target.closest(".square");
  if (!square) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = dragFrom ? "move" : "copy";
});

elements.chessboard.addEventListener("drop", (event) => {
  const square = editingActive() ? event.target.closest(".square") : null;
  if (!square) return;
  event.preventDefault();
  const target = square.dataset.square;
  if (dragFrom && dragFrom !== target) {
    const piece = editor.board[dragFrom];
    delete editor.board[dragFrom];
    setSquare(target, piece);
  } else if (dragPiece) {
    setSquare(target, dragPiece);
  }
  dragFrom = null;
  dragPiece = null;
});

elements.chessboard.addEventListener("dragend", () => { dragFrom = null; dragPiece = null; });

fetch("/api/state")
  .then((response) => response.json())
  .then((initial) => { state = initial; initializeSettings(initial.settings); render(); })
  .catch((error) => showToast(error.message));

const events = new EventSource("/api/events");
events.onmessage = (event) => { state = JSON.parse(event.data); initializeSettings(state.settings); render(); };
events.onerror = () => { elements.connectionDot.classList.remove("online"); elements.connectionText.textContent = "Disconnected"; };

setInterval(() => { if (state && state.activeSlot) renderEngines(); }, 100);

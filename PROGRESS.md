# Chess Engine Arena Progress

Last updated: 2026-09-23 (Asia/Karachi)

## Objective

Create a local GUI where any two UCI chess engines can play each other with configurable time-per-move or depth-per-move limits, color assignment, live engine statistics, move history, and a position evaluation bar. Matches can start from the standard opening position or from any custom position.

## Current Checkpoint

- Project uses a dependency-free browser UI and Node.js standard-library server after package installation was blocked by the environment approval service.
- Backend UCI process wrapper implemented without shell execution.
- Match controller supports arbitrary executable paths, color swapping, time/depth modes, live `info` parsing, legal move validation, and game-end detection.
- Stockfish 18 runs as an independent rules referee, providing legal moves, FEN, check, mate, and stalemate state.
- SSE endpoint streams match state to the browser.
- `server/uci-engine.js`, `server/match-controller.js`, and `server/index.js` are implemented.
- Dependency-free frontend: `index.html`, `styles.css`, and `app.js` provide the board, evaluation bar, engine settings, match controls, clocks, live statistics, move ledger, PV display, and responsive layouts.
- Same-engine matches are supported by launching two independent instances of the selected executable.
- Custom start positions are implemented: a FEN field plus a click-to-place board editor, with shared validation in `fen.js`.
- Work is committed on `main`; the initial commit is `307fb7f`.
- Exact resume point: the feature set is complete and verified for local use. Keep this file updated if additional engines or features are added.

## Architecture

- Competitors: any two distinct local UCI executable paths.
- Referee: a separate Stockfish process, configurable in Advanced settings.
- Rules flow: referee `go perft 1` supplies legal moves; referee `d` supplies FEN and check state.
- Match limits: fixed milliseconds per move or fixed depth per move.
- Live data: UCI `info` lines feed evaluation, PV, depth, nodes, NPS, and clocks over SSE.
- Runtime dependencies: Node.js standard library and browser APIs only; no package download is required.

## Custom Start Positions

- `fen.js` sits at the project root and is imported by both `server/match-controller.js` and `app.js`, so the server and the browser share one definition of a legal position. `server/index.js` serves it as a static file.
- Input is bidirectional: typing a FEN redraws the board editor, and editing the board rewrites the FEN field.
- Editor interactions: palette click-to-select then click-to-place, palette drag, square-to-square drag, right-click erase, eraser brush, and keyboard placement with Enter or Space.
- Metadata controls: side to move, four castling chips, en passant target, halfmove clock, fullmove number. Shortcuts: `Standard`, `Clear`, and `Use game` for branching from a live game.
- Validation runs in two layers. `fen.js` checks structure locally before any process starts. `resolveStartPosition` in `server/match-controller.js` then asks the referee, adopts the referee's normalized FEN, and rejects positions that cannot legally occur.
- Backward compatibility is structural: `positionCommand` emits `position startpos` whenever the start FEN equals the standard opening, and only switches to `position fen <FEN>` for a custom position.
- Move numbering comes from the FEN. `playOneMove` captures `fullmove` before the move and stamps it on the history record, so a Black-to-move start renders an empty White cell on its opening row.

## Visual Design (updated 2026-09-24)

- `styles.css` was rewritten as a warm-neutral dark design system that frames the board art (`images/200.png`) as the hero. Depth comes from elevation (layered surfaces + shadows + a top inset highlight) rather than hairline borders; all numeric data uses a monospace stack with `tabular-nums` to stop jitter.
- Tokens live in `:root`: surface ramp (`--bg`/`--panel`/`--panel-2`/`--panel-3`/`--inset`), text ramp, a green primary accent (`--accent`) that echoes the board, gold and danger accents, an 8px spacing scale (`--sp-*`), radii, elevation, and motion vars. `--board-size` keeps the responsive board sizing.
- The change is CSS-only except one `index.html` edit: the brandmark `♞` glyph became an inline SVG checker motif in a rounded gold badge, and `theme-color` was warmed to `#15170f`. No JS hooks were touched — the four load-bearing selectors (`move-table-wrap`, `palette-piece`, `castling-chip`, `square`) and all ids/classes `app.js` drives are unchanged.
- Verified live in the preview at 1440x900 and 375x812: styles.css and all assets load 200, no console/network errors, no horizontal overflow (mobile scrollWidth == innerWidth), board renders at 594px (desktop) / 307px (mobile), engine panels show live telemetry, and the setup/arena/analysis regions keep their grid behavior.

## Verification

- `node --check` passes for `server/index.js`, `server/match-controller.js`, `server/uci-engine.js`, `app.js`, and `fen.js`.
- `npm test` runs `server/fen.test.js`; it reports `fen.js: all checks passed`.
- Standard matches, protocol level: a `tee` wrapper on Engine A's stdin captured `position startpos` and `position startpos moves b1c3 d7d5`, identical to the behavior before custom positions existed. Custom matches captured `position fen <FEN>`.
- Custom match plays to a real result: from `6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 12`, Aether 0.2 played `a1a8`, the referee scored it, and the server reported `finished` with `1-0 - Checkmate`.
- Black to move: from `6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 12`, the move table opened on row 12 with an empty White cell and Black `g7g5`, then continued on row 13 with White `f2f4` and Black `g5f4`.
- Branching: a standard match was played to `rnbqkb1r/ppp1pppp/5n2/3p4/8/2N2N2/PPPPPPPP/R1BQKB1R w KQkq - 2 3`, `Use game` loaded that exact FEN including castling rights, and a new match from it opened the move table on row 3 and played legal continuations.
- Rejections return HTTP 400 with specific messages and leave the board on the last valid position: `4k3/4R3/8/8/8/8/8/4K3 w - - 0 1` and `8/8/8/3kK3/8/8/8/8 w - - 0 1` both give "the side not to move is in check"; a missing king gives "A position needs exactly one white king and one black king"; a malformed rank gives "Rank 1 does not describe 8 squares".
- SSE streaming confirmed live: a probe `EventSource` received the full ordered sequence `idle`, `starting`, `running`, thinking, move played, `finished`, and the DOM matched the server snapshot at the end.
- Responsive: 1440x1000 and 375x900 with the editor open. At 375x900 horizontal overflow is 0 px, no element extends past the viewport, and the turn indicator and result text clear each other by 10 px.
- UI interaction: color swap, board flip, Time/Depth segmented control, Standard/Custom segmented control, FEN copy, and live settings lock verified.
- `package-lock.json` retained after inspection; it contains no dependencies and matches the dependency-free package manifest.

## Known Gaps

- `start()` initializes both competitor engines and the referee together, so a position the referee rejects is caught after the engines have spawned. The catch closes every process, so nothing leaks, but the engines start and stop for a position that was never playable. Initializing the referee first would avoid the wasted spawn.

## Default Engines

- Aether: `../aether-chess/build/aether`
- Stockfish 18: `/usr/local/bin/stockfish`

## Resume

```sh
cd chess-engine-arena
npm run dev
```

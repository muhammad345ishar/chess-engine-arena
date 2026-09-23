# Chess Engine Arena Progress

Last updated: 2026-09-02 (Asia/Karachi)

## Objective

Create a local GUI where any two UCI chess engines can play each other with configurable time-per-move or depth-per-move limits, color assignment, live engine statistics, move history, and a position evaluation bar.

## Current Checkpoint

- Project uses a dependency-free browser UI and Node.js standard-library server after package installation was blocked by the environment approval service.
- Backend UCI process wrapper implemented without shell execution.
- Match controller supports arbitrary executable paths, color swapping, time/depth modes, live `info` parsing, legal move validation, and game-end detection.
- Stockfish 18 runs as an independent rules referee, providing legal moves, FEN, check, mate, and stalemate state.
- SSE endpoint streams match state to the browser.
- `server/uci-engine.js`, `server/match-controller.js`, and `server/index.js` are implemented.
- Dependency-free frontend restored: `index.html`, `styles.css`, and `app.js` now provide the board, evaluation bar, engine settings, match controls, clocks, live statistics, move ledger, PV display, and responsive layouts.
- JavaScript syntax checks pass for all server files and the browser app.
- The minimal `package-lock.json` was inspected and retained; it contains no dependencies and accurately matches `package.json`.
- Same-engine matches are supported by launching two independent instances of the selected executable.
- README usage instructions added in `README.md`.
- Browser verification completed at 1440x1000 and 375x900: board and evaluation bar render, controls respond, and there is no horizontal overflow at either size.
- Exact resume point: project is ready for local use; keep this file updated if additional engines or features are added.

## Architecture

- Competitors: any two distinct local UCI executable paths.
- Referee: a separate Stockfish process, configurable in Advanced settings.
- Rules flow: referee `go perft 1` supplies legal moves; referee `d` supplies FEN and check state.
- Match limits: fixed milliseconds per move or fixed depth per move.
- Live data: UCI `info` lines feed evaluation, PV, depth, nodes, NPS, and clocks over SSE.
- Runtime dependencies: Node.js standard library and browser APIs only; no package download is required.

## Verification

- `node --check server/index.js` passed.
- `node --check server/match-controller.js` passed.
- `node --check server/uci-engine.js` passed.
- `node --check app.js` passed.
- Time mode: Aether vs Stockfish, 150 ms per move, four plies completed; result was a controlled draw at the configured maximum.
- Depth mode: Stockfish (White) vs Aether (Black), depth 3, four plies completed; result was a controlled draw at the configured maximum.
- UI interaction: color swap, board flip, Time/Depth segmented control, FEN copy control, and live settings lock verified.
- FEN copy verified through the browser clipboard; no page console errors were reported.
- Live state confirmed engine identities, Aether author `Muhammad Ishar`, legal UCI moves, FEN updates, evaluation, PV, depth, nodes, NPS, clocks, and move ledger.
- `package-lock.json` retained after inspection; it contains no dependencies and matches the dependency-free package manifest.

## Default Engines

- Aether: `/Users/muhammadishar/Projects/aether-chess/build/aether`
- Stockfish 18: `/usr/local/bin/stockfish`

## Resume

```sh
cd /Users/muhammadishar/Projects/chess-engine-arena
npm run dev
```

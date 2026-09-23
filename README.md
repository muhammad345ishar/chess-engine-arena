# Chess Engine Arena

Chess Engine Arena is a local, dependency-free GUI for running two UCI chess engines against each other. It supports per-move time or depth limits, color swapping, live evaluation, engine telemetry, move history, principal variation, FEN copy, and a Stockfish-backed rules referee.

## Requirements

- Node.js 18 or newer
- Two executable UCI engines
- A UCI engine to use as the rules referee. Stockfish is recommended.

The default paths are:

- Engine A: `/Users/muhammadishar/Projects/aether-chess/build/aether`
- Engine B: `/usr/local/bin/stockfish`
- Rules referee: `/usr/local/bin/stockfish`

Change these paths in the Advanced section or directly in the Engine A/B fields.

## Run

```sh
cd /Users/muhammadishar/Projects/chess-engine-arena
npm run dev
```

Open <http://127.0.0.1:4173/>. If that port is busy, the server automatically tries the next available port through `4183` and prints the selected URL.

## Use

1. Confirm the two engine executable paths and the referee path.
2. Choose `Time` and enter milliseconds per move, or choose `Depth` and enter search depth.
3. Use the swap button to assign Engine A to Black, then press Start.
4. Use Stop to interrupt a live match, Reset to return to the starting position, and Flip board to change the board orientation.

The board evaluation is normalized to White's perspective. Engine names and authors come from each engine's UCI handshake. The arena accepts two instances of the same executable, which is useful for self-play tests.

## API

- `GET /api/state` returns the current match snapshot.
- `GET /api/events` streams state updates with Server-Sent Events.
- `POST /api/match/start` starts a match from JSON settings.
- `POST /api/match/stop` stops the active match.
- `POST /api/match/reset` resets the position and telemetry.

No npm packages are required; the server uses Node.js built-ins and the browser uses standard DOM APIs.

# Chess Engine Arena

Chess Engine Arena is a local, dependency-free GUI for running two UCI chess engines against each other. It supports per-move time or depth limits, color swapping, live evaluation, engine telemetry, move history, principal variation, FEN copy, and a Stockfish-backed rules referee.

## Requirements

- Node.js 18 or newer
- Two executable UCI engines
- A UCI engine to use as the rules referee. Stockfish is recommended.

The default paths are:

- Engine A: `../aether-chess/build/aether`
- Engine B: `/usr/local/bin/stockfish`
- Rules referee: `/usr/local/bin/stockfish`

Change these paths in the Advanced section or directly in the Engine A/B fields.

## Run

```sh
cd chess-engine-arena
npm run dev
```

Open <http://127.0.0.1:4173/>. If that port is busy, the server automatically tries the next available port through `4183` and prints the selected URL.

## Use

1. Confirm the two engine executable paths and the referee path.
2. Choose `Time` and enter milliseconds per move, or choose `Depth` and enter search depth.
3. Use the swap button to assign Engine A to Black, then press Start.
4. Use Stop to interrupt a live match, Reset to return to the starting position, and Flip board to change the board orientation.

The board evaluation is normalized to White's perspective. Engine names and authors come from each engine's UCI handshake. The arena accepts two instances of the same executable, which is useful for self-play tests.

## Custom starting position

The `Start position` control switches between `Standard` and `Custom`. Choosing `Custom` opens an editor below the board with a FEN field and a piece palette.

Two ways to set a position, kept in sync in both directions:

- **Type or paste a FEN** into the FEN field. The board, side to move, castling rights and clocks update as you type. Four-field FENs are accepted and the clocks default to `0 1`.
- **Edit on the board.** Click a palette piece to pick it up, then click a square to place it. Click the same palette piece again to deselect it. You can also drag a piece from the palette onto a square, drag a piece from square to square, and right-click a square to clear it. The eraser brush clears squares by clicking. Squares are keyboard reachable: Tab to a square and press Enter or Space to stamp the current brush.

Alongside the board are controls for side to move, the four castling rights, the en passant target square, and the halfmove and fullmove counters. Three shortcuts fill the editor: `Standard` loads the opening position, `Clear` loads a bare board with both kings, and `Use game` loads the position currently on the board, which is how you branch a new match from a game in progress.

A line under the FEN field reports either the side to move and move number, or the reason the position is rejected. Positions are checked twice:

- Locally, before anything is launched: eight ranks of eight squares, exactly one king per side, no pawn on rank 1 or 8, and well-formed castling, en passant and clock fields.
- By the rules referee, once it is running: it rejects positions that cannot legally occur, such as one where the side that is not to move is left in check, or where the kings are adjacent.

A rejected position fails the start with a specific message and leaves the board showing the last valid position.

Move numbering follows the FEN. A match started from a Black-to-move position at move 12 opens the move table on row 12 with an empty White cell.

Standard matches are unaffected: when the start position is the opening position the engines receive `position startpos`, exactly as before. Only a custom position switches them to `position fen <FEN>`, so an engine that does not implement `position fen` still plays standard matches normally.

## API

- `GET /api/state` returns the current match snapshot.
- `GET /api/events` streams state updates with Server-Sent Events.
- `POST /api/match/start` starts a match from JSON settings. The optional `startFen` field sets a custom start position; omit it or send the opening FEN for a standard match. An invalid position returns `400` with an `error` message.
- `POST /api/match/stop` stops the active match.
- `POST /api/match/reset` resets the position and telemetry.

FEN parsing and validation live in `fen.js` at the project root, which is imported by both the server and the browser so the two cannot disagree about what a legal position is.

## Test

```sh
npm test
```

This runs `server/fen.test.js`, which covers FEN round-tripping and the local validation rules. It needs no engines and no network.

No npm packages are required; the server uses Node.js built-ins and the browser uses standard DOM APIs.

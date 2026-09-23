import assert from "node:assert/strict";
import { START_FEN, EMPTY_FEN, flipTurn, parseFen, serializeFen, validateFen } from "../fen.js";

const roundTrips = [
  START_FEN,
  EMPTY_FEN,
  "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
  "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
  "4k3/8/8/2Pp4/8/8/8/4K3 w - d6 0 42",
];
for (const fen of roundTrips) {
  assert.equal(serializeFen(parseFen(fen)), fen, `round trip failed: ${fen}`);
  assert.equal(validateFen(fen).ok, true, `should be valid: ${fen}`);
}

// A 4-field FEN is accepted and the clocks default to 0 1.
assert.equal(validateFen("4k3/8/8/8/8/8/8/4K3 w - -").fen, "4k3/8/8/8/8/8/8/4K3 w - - 0 1");
// Whitespace is tolerated.
assert.equal(validateFen(`  ${START_FEN}  `).fen, START_FEN);

const rejections = [
  ["4k3/8/8/8/8/8/8/4K2K w - - 0 1", /exactly one white king/],
  ["8/8/8/8/8/8/8/4K3 w - - 0 1", /exactly one white king/],
  ["P3k3/8/8/8/8/8/8/4K3 w - - 0 1", /pawn cannot stand on a8/],
  ["4k3/8/8/8/8/8/8/4K2P w - - 0 1", /pawn cannot stand on h1/],
  ["4k3/8/8/8/8/8/8/4K4 w - - 0 1", /Rank 1 does not describe 8 squares/],
  ["4k3/8/8/8/8/8/4K3 w - - 0 1", /exactly 8 ranks/],
  ["4k3/8/8/8/8/8/8/4K3 x - - 0 1", /side to move/],
  ["4k3/8/8/8/8/8/8/4K3 w XY - 0 1", /Castling rights/],
  ["4k3/8/8/8/8/8/8/4K3 w - e4 0 1", /en passant square/],
  ["4k3/8/8/8/8/8/8/4K3 w - - x 1", /halfmove clock/],
  ["4k3/8/8/8/8/8/8/4K3 w - - 0 0", /move number/],
  ["4k3/8/8/8/8/8/8/4Kz3 w - - 0 1", /unknown symbol/],
  ["", /needs 6 fields/],
  ["4k3/8/8/8/8/8/8/4K3 w -", /needs 6 fields/],
];
for (const [fen, pattern] of rejections) {
  const result = validateFen(fen);
  assert.equal(result.ok, false, `should be rejected: ${fen}`);
  assert.match(result.error, pattern, `wrong message for ${fen}: ${result.error}`);
}

assert.equal(flipTurn("4k3/8/8/2Pp4/8/8/8/4K3 w - d6 0 42"), "4k3/8/8/2Pp4/8/8/8/4K3 b - - 0 42");
assert.equal(parseFen(START_FEN).board.e1, "K");
assert.equal(parseFen(START_FEN).board.d8, "q");
assert.equal(parseFen(START_FEN).board.e4, undefined);

console.log("fen.js: all checks passed");

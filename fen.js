export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const EMPTY_FEN = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";

const PIECE_LETTERS = "pnbrqkPNBRQK";
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function squareName(fileIndex, rank) {
  return `${FILES[fileIndex]}${rank}`;
}

export function parsePlacement(field) {
  const board = {};
  const ranks = String(field).split("/");
  if (ranks.length !== 8) throw new Error("A FEN board must describe exactly 8 ranks.");
  ranks.forEach((row, index) => {
    const rank = 8 - index;
    let file = 0;
    for (const char of row) {
      if (/[1-8]/.test(char)) { file += Number(char); continue; }
      if (!PIECE_LETTERS.includes(char)) throw new Error(`Rank ${rank} contains an unknown symbol: ${char}`);
      if (file > 7) throw new Error(`Rank ${rank} does not describe 8 squares.`);
      board[squareName(file, rank)] = char;
      file += 1;
    }
    if (file !== 8) throw new Error(`Rank ${rank} does not describe 8 squares.`);
  });
  return board;
}

export function serializePlacement(board) {
  const rows = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let row = "";
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = board[squareName(file, rank)];
      if (!piece) { empty += 1; continue; }
      if (empty > 0) { row += empty; empty = 0; }
      row += piece;
    }
    if (empty > 0) row += empty;
    rows.push(row);
  }
  return rows.join("/");
}

export function parseFen(fen) {
  const fields = String(fen ?? "").trim().split(/\s+/);
  if (fields.length !== 4 && fields.length !== 6) {
    throw new Error("A FEN needs 6 fields: board, side to move, castling, en passant, and two clocks.");
  }
  const [placement, turn, castling, ep, halfmove = "0", fullmove = "1"] = fields;
  const board = parsePlacement(placement);
  const kings = Object.values(board).filter((piece) => piece === "K").length;
  const blackKings = Object.values(board).filter((piece) => piece === "k").length;
  if (kings !== 1 || blackKings !== 1) throw new Error("A position needs exactly one white king and one black king.");
  for (const [square, piece] of Object.entries(board)) {
    if (piece.toLowerCase() === "p" && (square[1] === "1" || square[1] === "8")) {
      throw new Error(`A pawn cannot stand on ${square}.`);
    }
  }
  if (turn !== "w" && turn !== "b") throw new Error('The side to move must be "w" or "b".');
  if (castling !== "-" && !/^K?Q?k?q?$/.test(castling)) throw new Error('Castling rights must be "-" or a combination of KQkq.');
  if (ep !== "-" && !/^[a-h][36]$/.test(ep)) throw new Error('The en passant square must be "-" or a square on rank 3 or 6.');
  if (!/^\d+$/.test(halfmove)) throw new Error("The halfmove clock must be a whole number.");
  if (!/^\d+$/.test(fullmove) || Number(fullmove) < 1) throw new Error("The move number must be 1 or greater.");
  return {
    board,
    turn,
    castling: castling === "" ? "-" : castling,
    ep,
    halfmove: Number(halfmove),
    fullmove: Number(fullmove),
  };
}

export function serializeFen(position) {
  const castling = position.castling && position.castling !== "" ? position.castling : "-";
  return [
    serializePlacement(position.board),
    position.turn,
    castling,
    position.ep || "-",
    Math.max(0, Number(position.halfmove) || 0),
    Math.max(1, Number(position.fullmove) || 1),
  ].join(" ");
}

export function validateFen(fen) {
  try {
    const position = parseFen(fen);
    return { ok: true, fen: serializeFen(position), position };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function flipTurn(fen) {
  const fields = String(fen).trim().split(/\s+/);
  fields[1] = fields[1] === "w" ? "b" : "w";
  fields[3] = "-";
  return fields.join(" ");
}

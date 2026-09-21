import { Chess } from "chess.js";

/** SAN list as numbered pairs: ["e4","e5","Nf3"] -> "1. e4 e5 2. Nf3" */
function pgn(history: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < history.length; i += 2) {
    out.push(`${i / 2 + 1}. ${history[i]}${history[i + 1] ? ` ${history[i + 1]}` : ""}`);
  }
  return out.join(" ");
}

const RULES = `Chess rules recap:
- White moves first; players alternate. Moves are given in SAN.
- Pawns move forward one (or two from their start rank) and capture diagonally; they promote on the last rank (=Q).
- Knights move in an L (2+1) and jump over pieces. Bishops move diagonally, rooks along ranks/files, the queen both, the king one square.
- Castling (O-O / O-O-O) moves king two squares toward a rook, only if neither has moved, no pieces between, and the king is not in, through, or into check.
- "x" is a capture, "+" is check, "#" is checkmate. En passant captures a pawn that just advanced two squares.
- Material worth: queen 9, rook 5, bishop/knight 3, pawn 1. Prefer moves that win material, give check or mate, develop pieces, control the centre (d4/e4/d5/e5), and keep your king safe. Avoid leaving a piece where the opponent can capture it for free.`;

export type JevPick = {
  move: string;
  confidence: number;
  probabilities: Record<string, number>;
  ms: number;
};

/**
 * `history` is the game's moves in SAN. It cannot be recovered from a FEN, so the
 * caller has to supply it — a board built from a FEN has an empty history.
 */
export async function pickMove(
  fen: string,
  withRules: boolean,
  history: string[] = [],
): Promise<JevPick> {
  const game = new Chess(fen);
  const moves = game.moves();
  if (!moves.length) throw new Error("no legal moves");

  // criteria: one entry per legal move. Description is the move itself plus what it does.
  const criteria: Record<string, string> = {};
  for (const san of moves) {
    const probe = new Chess(fen);
    const m = probe.move(san)!;
    const bits = [`${m.piece.toUpperCase()} ${m.from}->${m.to}`];
    if (m.captured) bits.push(`captures ${m.captured.toUpperCase()}`);
    if (probe.isCheckmate()) bits.push("CHECKMATE");
    else if (probe.isCheck()) bits.push("check");
    if (m.promotion) bits.push(`promotes to ${m.promotion.toUpperCase()}`);
    criteria[san] = bits.join(", ");
  }

  const turn = game.turn() === "w" ? "White" : "Black";
  const state = [
    withRules ? RULES : null,
    `Position (FEN): ${fen}`,
    `Board:\n${game.ascii()}`,
    `Moves so far: ${pgn(history) || "(none, this is the opening move)"}`,
    `It is ${turn}'s turn.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const t0 = Date.now();
  // AI Gateway's evaluation endpoint. We read the distribution directly rather than
  // going through the SDK's evaluate(): it rejects any answer whose `choice` is not the
  // strict argmax, and across 30+ near-equal chess moves Jev legitimately returns ties.
  const res = await fetch("https://ai-gateway.vercel.sh/v1/evaluate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "typesafe-ai/jev",
      state,
      questions: {
        move: {
          type: "choice",
          instructions: `Pick the strongest move for ${turn} in this chess position.`,
          criteria,
        },
      },
    }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) throw new Error(`jev ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const probabilities: Record<string, number> = data.answers?.move?.probabilities ?? {};

  // argmax over legal moves only, ties broken by chess.js move order so runs are repeatable
  let move = data.answers?.move?.choice as string | undefined;
  if (!move || !moves.includes(move)) move = undefined;
  let best = move ? (probabilities[move] ?? -1) : -1;
  for (const san of moves) {
    const p = probabilities[san] ?? 0;
    if (p > best) {
      best = p;
      move = san;
    }
  }
  if (!move) throw new Error(`jev returned no usable move from ${moves.length} options`);
  const confidence = probabilities[move] ?? 0;

  return { move, confidence, probabilities, ms };
}

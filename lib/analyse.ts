import { Chess } from "chess.js";
import { engine, type Eval } from "./engine.ts";
import type { Ply } from "./types";

const DEPTH = Number(process.env.ANALYSIS_DEPTH ?? 14);

// Mate scores collapse to a large finite number so arithmetic stays simple.
export type Label =
  | "Brilliant"
  | "Great"
  | "Best"
  | "Good"
  | "Inaccuracy"
  | "Mistake"
  | "Blunder";

export type Judged = Ply & {
  /** eval before the move, from the mover's point of view, in centipawns */
  before: number;
  /** eval after the move, still from the mover's point of view */
  after: number;
  /** how much the move gave away, in centipawns; 0 = played the engine's choice */
  loss: number;
  bestMove: string;
  playedBest: boolean;
  label: Label;
};

// Mate scores collapse to a large finite number so arithmetic stays simple.
const MATE = 10000;
const toCp = (e: Eval) => (e.mate !== null ? Math.sign(e.mate) * (MATE - Math.abs(e.mate)) : (e.cp ?? 0));

// Win probability from centipawns; the standard logistic Lichess uses. Classifying on
// raw centipawn loss over-punishes swings in already-won positions, this doesn't.
const winProb = (cp: number) => 1 / (1 + Math.exp(-0.00368208 * cp));

function classify(
  loss: number,
  wpDrop: number,
  playedBest: boolean,
  sacrifice: boolean,
  stillWinning: boolean,
): Label {
  if (playedBest && sacrifice && stillWinning) return "Brilliant";
  if (playedBest && wpDrop <= 0.02) return "Best";
  if (wpDrop <= 0.02) return "Great";
  if (wpDrop <= 0.05) return "Good";
  if (wpDrop <= 0.1) return "Inaccuracy";
  if (wpDrop <= 0.2) return "Mistake";
  return "Blunder";
}

/** Did this move hang material that the engine still likes? (cheap brilliancy proxy) */
function isSacrifice(fenBefore: string, san: string): boolean {
  const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const g = new Chess(fenBefore);
  const m = g.move(san);
  if (!m) return false;
  const gained = m.captured ? VAL[m.captured] : 0;
  // can the opponent immediately win more than we just took?
  const best = Math.max(0, ...g.moves({ verbose: true }).map((r) => (r.captured ? VAL[r.captured] : 0)));
  return best - gained >= 2;
}

export async function analyse(plies: Ply[]) {
  const e = engine();
  await e.ready();
  try {
    const out: Judged[] = [];
    // eval each position once: the "after" eval of ply n is the "before" of ply n+1
    const evals: Eval[] = [];
    for (const p of plies) {
      e.newGame();
      evals.push(await e.go(p.fenBefore, `depth ${DEPTH}`));
    }
    e.newGame();
    const final = await e.go(plies.at(-1)!.fenAfter, `depth ${DEPTH}`);

    for (let i = 0; i < plies.length; i++) {
      const p = plies[i];
      // engine scores are from the side-to-move's view, which at fenBefore IS the mover
      const before = toCp(evals[i]);
      const nextEval = evals[i + 1] ?? final;
      // at fenAfter the opponent is to move, so negate to keep the mover's point of view
      const after = -toCp(nextEval);
      const loss = Math.max(0, before - after);
      const wpDrop = Math.max(0, winProb(before) - winProb(after));

      const bestUci = evals[i].best;
      const probe = new Chess(p.fenBefore);
      const bestMove = probe.moves({ verbose: true }).find((m) => m.lan === bestUci)?.san ?? bestUci;
      const playedBest = bestMove === p.move;

      out.push({
        ...p,
        before,
        after,
        loss,
        bestMove,
        playedBest,
        label: classify(loss, wpDrop, playedBest, isSacrifice(p.fenBefore, p.move), after > 100),
      });
    }

    // accuracy: mean per-move win-probability retention, expressed as a percentage
    const acc = (c: "w" | "b") => {
      const ms = out.filter((p) => p.color === c);
      if (!ms.length) return 0;
      // before/after are already mover-POV, so the drop is directly this player's loss
      const scores = ms.map((p) => 100 * Math.exp(-4 * Math.max(0, winProb(p.before) - winProb(p.after))));
      return scores.reduce((a, b) => a + b, 0) / scores.length;
    };
    const acpl = (c: "w" | "b") => {
      const ms = out.filter((p) => p.color === c);
      return ms.length ? ms.reduce((a, p) => a + Math.min(p.loss, 1000), 0) / ms.length : 0;
    };
    // Rough Elo from average centipawn loss. Anchored on the usual rules of thumb
    // (ACPL ~20 is master strength, ~60 is club, ~100 is beginner), not a rated result.
    const elo = (c: "w" | "b") => Math.round(Math.min(3000, Math.max(400, 3000 * Math.exp(-0.01 * acpl(c)))));
    return {
      plies: out,
      accuracy: { w: acc("w"), b: acc("b") },
      acpl: { w: acpl("w"), b: acpl("b") },
      elo: { w: elo("w"), b: elo("b") },
    };
  } finally {
    e.close();
  }
}

// Measure Jev's playing strength by matching it against Stockfish at calibrated ratings.
// Run: npm run ladder -- [gamesPerRung] [rungs...]
//   node --env-file=.env.local --experimental-strip-types ladder.mjs 4 1320 1600 1900
import { writeFile } from "node:fs/promises";
import { Chess } from "chess.js";
import { engine } from "./lib/engine.ts";
import { pickMove } from "./lib/jev.ts";

const GAMES = Number(process.argv[2] ?? 4);
// A rung is either a calibrated Elo ("1320") or an uncalibrated Skill Level ("s0").
// UCI_Elo bottoms out at 1320, so Skill Level is the only way to probe below it.
const parseRung = (a) =>
  a.startsWith("s") ? { skill: Number(a.slice(1)), label: `skill ${a.slice(1)}` } : { elo: Number(a), label: `Elo ${a}` };
const RUNGS = process.argv.slice(3).map(parseRung);
const LEVELS = RUNGS.length ? RUNGS : [{ elo: 1320, label: "Elo 1320" }];
const MOVETIME = Number(process.env.LADDER_MOVETIME ?? 100);
const MAX_PLIES = 200; // a stalled game is a draw, not an infinite loop
const RULES = process.env.LADDER_RULES !== "0";

/** One game. `jevColor` is "w" or "b". Returns Jev's score: 1 win, 0.5 draw, 0 loss. */
async function playGame(e, rung, jevColor) {
  const g = new Chess();
  e.newGame();
  await e.setStrength(rung);

  while (!g.isGameOver() && g.history().length < MAX_PLIES) {
    if (g.turn() === jevColor) {
      let played = false;
      for (let attempt = 0; attempt < 3 && !played; attempt++) {
        try {
          const { move } = await pickMove(g.fen(), RULES, g.history());
          g.move(move);
          played = true;
        } catch (err) {
          console.error(`  jev error (attempt ${attempt + 1}):`, String(err).slice(0, 140));
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
      // An API failure is not a chess result. Void the game rather than score it
      // as a loss, which would silently drag the measured rating down.
      if (!played) return { score: null, plies: g.history().length, reason: "void: jev error" };
    } else {
      const { best } = await e.go(g.fen(), `movetime ${MOVETIME}`);
      if (!best || best === "(none)") break;
      g.move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] });
    }
  }

  const plies = g.history().length;
  if (!g.isCheckmate()) return { score: 0.5, plies, reason: g.isDraw() ? "draw" : "adjudicated" };
  // the side to move is the one that got mated
  const loser = g.turn();
  return { score: loser === jevColor ? 0 : 1, plies, reason: "checkmate" };
}

/** Expected score for a player rated `r` against one rated `opp`. */
const expected = (r, opp) => 1 / (1 + 10 ** ((opp - r) / 400));

/**
 * Maximum-likelihood rating: find the rating whose expected score across every
 * rung best matches what Jev actually scored. Bisection on the score residual,
 * which is monotonic in rating.
 */
function fitElo(all) {
  // Skill-Level rungs have no published Elo, so they cannot enter the fit.
  const results = all.filter((r) => r.elo !== undefined);
  if (!results.length) return { elo: null, note: "no calibrated (UCI_Elo) rungs were played" };
  const total = results.reduce((a, r) => a + r.score, 0);
  const n = results.reduce((a, r) => a + r.games, 0);
  if (n === 0) return { elo: null, note: "no games completed" };
  if (total === 0) return { elo: null, note: `lost every game (0/${n})` };
  if (total === n) return { elo: null, note: `won every game (${n}/${n})` };
  let lo = 0, hi = 4000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const exp = results.reduce((a, r) => a + r.games * expected(mid, r.elo), 0);
    if (exp < total) lo = mid;
    else hi = mid;
  }
  return { elo: Math.round((lo + hi) / 2), note: null };
}

const e = engine();
await e.ready();
const results = [];

try {
  for (const rung of LEVELS) {
    let score = 0;
    let played = 0;
    let voided = 0;
    const games = [];
    for (let i = 0; i < GAMES; i++) {
      // alternate colours so the white advantage cancels out
      const jevColor = i % 2 === 0 ? "w" : "b";
      const t0 = Date.now();
      const r = await playGame(e, rung, jevColor);
      if (r.score === null) voided++;
      else {
        score += r.score;
        played++;
      }
      games.push({ ...r, jevColor, seconds: Math.round((Date.now() - t0) / 1000) });
      console.log(
        `SF ${rung.label}  game ${i + 1}/${GAMES}  jev=${jevColor}  ${r.score}  ${r.reason}  ${r.plies} plies  ${games.at(-1).seconds}s`,
      );
    }
    const pct = played ? (100 * score) / played : 0;
    results.push({ ...rung, games: played, score, pct, voided, detail: games });
    console.log(
      `SF ${rung.label}: Jev scored ${score}/${played} (${pct.toFixed(0)}%)${voided ? ` — ${voided} voided` : ""}\n`,
    );
    await writeFile("data/ladder.json", JSON.stringify({ results, rules: RULES }, null, 2));
  }
} finally {
  e.close();
}

const fit = fitElo(results);
const out = { ranAt: new Date().toISOString(), rules: RULES, movetime: MOVETIME, results, fit };
await writeFile("data/ladder.json", JSON.stringify(out, null, 2));

console.log("=== Jev strength");
for (const r of results)
  console.log(
    `  vs SF ${r.label}: ${r.score}/${r.games} (${r.pct.toFixed(0)}%)${r.voided ? ` [${r.voided} voided]` : ""}`,
  );
console.log(fit.elo ? `  estimated Elo: ${fit.elo}` : `  no estimate: ${fit.note}`);

// Self-check: run with `node --experimental-strip-types test-analyse.mjs`
import assert from "node:assert";
import { Chess } from "chess.js";
import { analyse } from "./lib/analyse.ts";

// Build plies from a PGN-ish move list, filling the fields analyse() needs.
function plies(sans) {
  const g = new Chess();
  return sans.map((san, i) => {
    const fenBefore = g.fen();
    const color = g.turn();
    g.move(san);
    return { n: i + 1, color, move: san, withRules: true, confidence: 1, ms: 0, top: [], fenBefore, fenAfter: g.fen() };
  });
}

// 1. A sound opening then White hangs its queen: that move must be the worst one.
const blunder = plies(["e4", "e5", "Qh5", "Nc6", "Qxe5+"]);
const { plies: j, accuracy } = await analyse(blunder);

const qxe5 = j.at(-1);
assert.equal(qxe5.move, "Qxe5+");
assert.equal(qxe5.color, "w");
assert.ok(qxe5.loss > 300, `hanging the queen should lose >300cp, got ${qxe5.loss}`);
assert.equal(qxe5.label, "Blunder", `expected Blunder, got ${qxe5.label}`);

// 2. Sign convention: e4 is a normal opening move, it must not read as a loss.
assert.ok(j[0].loss < 60, `e4 should be near-best, lost ${j[0].loss}`);
assert.ok(j[0].before > -100 && j[0].before < 200, `e4 before-eval out of range: ${j[0].before}`);

// 3. Blundering the queen must drag White's accuracy below Black's.
assert.ok(accuracy.w < accuracy.b, `W ${accuracy.w.toFixed(1)} should be < B ${accuracy.b.toFixed(1)}`);
assert.ok(accuracy.b > 50 && accuracy.b <= 100, `B accuracy out of range: ${accuracy.b}`);

console.log("labels:", j.map((p) => `${p.move}=${p.label}(${p.loss})`).join(" "));
console.log(`accuracy W ${accuracy.w.toFixed(1)}%  B ${accuracy.b.toFixed(1)}%`);
console.log("OK");

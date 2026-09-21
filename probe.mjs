import { Chess } from "chess.js";
import { pickMove } from "./lib/jev.ts";

// Play a real game so history is genuine, then capture what actually goes over the wire.
const g = new Chess();
for (const m of ["e4","e5","Nf3","Nc6","Bb5","a6","Ba4","Nf6","O-O","Be7","Re1","b5"]) g.move(m);

const real = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  console.log("=== state sent to Jev ===");
  console.log(body.state);
  console.log("=== end state ===");
  console.log("legal options offered:", Object.keys(body.questions.move.criteria).length);
  return real(url, init);
};

await pickMove(g.fen(), true, g.history());

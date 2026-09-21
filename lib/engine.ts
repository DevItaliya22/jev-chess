import { spawn } from "node:child_process";

const BIN = process.env.STOCKFISH_PATH ?? "stockfish";

export type Eval = { cp: number | null; mate: number | null; best: string };

/** A long-lived Stockfish process. UCI is line-oriented over stdio. */
export function engine() {
  const p = spawn(BIN, [], { stdio: ["pipe", "pipe", "ignore"] });
  let buf = "";
  const waiters: { match: RegExp; resolve: (lines: string[]) => void; lines: string[] }[] = [];

  p.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop()!;
    for (const line of lines) {
      const w = waiters[0];
      if (!w) continue;
      w.lines.push(line);
      if (w.match.test(line)) waiters.shift()!.resolve(w.lines);
    }
  });

  const send = (cmd: string) => p.stdin.write(cmd + "\n");
  const until = (match: RegExp) =>
    new Promise<string[]>((resolve) => waiters.push({ match, resolve, lines: [] }));

  return {
    async ready() {
      send("uci");
      await until(/^uciok/);
      send("isready");
      await until(/^readyok/);
    },
    /** Cap playing strength. `elo` is Stockfish's own calibration (1320–3190). */
    async setStrength({ elo, skill }: { elo?: number; skill?: number }) {
      if (elo !== undefined) {
        send("setoption name UCI_LimitStrength value true");
        send(`setoption name UCI_Elo value ${elo}`);
      } else {
        send("setoption name UCI_LimitStrength value false");
        send(`setoption name Skill Level value ${skill ?? 20}`);
      }
      send("isready");
      await until(/^readyok/);
    },
    async go(fen: string, limit: string): Promise<Eval> {
      send(`position fen ${fen}`);
      send(`go ${limit}`);
      const lines = await until(/^bestmove/);
      const best = lines.at(-1)!.split(" ")[1];
      const info = lines.filter((l) => l.includes(" score ")).at(-1) ?? "";
      const cp = /score cp (-?\d+)/.exec(info);
      const mate = /score mate (-?\d+)/.exec(info);
      return { cp: cp ? +cp[1] : null, mate: mate ? +mate[1] : null, best };
    },
    newGame() {
      send("ucinewgame");
    },
    close: () => p.kill(),
  };
}

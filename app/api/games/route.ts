import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

// ponytail: flat JSON files on disk. Swap for a real store if this ever leaves localhost.
const DIR = path.join(process.cwd(), "data", "games");

export async function POST(req: Request) {
  const game = await req.json();
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, `${game.id}.json`), JSON.stringify(game, null, 2));
  return Response.json({ ok: true });
}

export async function GET() {
  await mkdir(DIR, { recursive: true });
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".json"));
  const games = await Promise.all(
    files.map(async (f) => JSON.parse(await readFile(path.join(DIR, f), "utf8"))),
  );
  return Response.json(games.sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
}

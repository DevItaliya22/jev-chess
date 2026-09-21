import { analyse } from "@/lib/analyse";
import type { Game } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: Request) {
  const game: Game = await req.json();
  try {
    const analysis = await analyse(game.plies);
    // persist it so the game list can show Elo without re-running the engine
    await fetch(new URL("/api/games", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...game, analysis }),
    });
    return Response.json(analysis);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

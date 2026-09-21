import { pickMove } from "@/lib/jev";

export async function POST(req: Request) {
  const { fen, withRules, history } = await req.json();
  try {
    return Response.json(await pickMove(fen, !!withRules, history ?? []));
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

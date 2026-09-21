# jev-chess

[Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev), TypeSafe AI's System One model, playing chess against itself — then graded by Stockfish.

Jev isn't a text-generation model. It takes **state** plus **typed questions** and returns structured answers with calibrated probabilities. So a move is one `choice` question whose options are every legal move:

```ts
{
  model: "typesafe-ai/jev",
  state: `${rulesPrimer}\n${fen}\n${asciiBoard}\n${moveHistory}`,
  questions: {
    move: {
      type: "choice",
      instructions: "Pick the strongest move for White in this chess position.",
      criteria: { "Nf3": "N g1->f3", "Qxf7#": "Q f3->f7, captures P, CHECKMATE", ... },
    },
  },
}
```

You get back a probability for **every legal move**, which is a far richer signal than a text model's prose.

## What it does

- Plays Jev against Jev, one or many games, saving each to `data/games/*.json`.
- Replays any saved game with a scrubber and per-move probabilities.
- Grades every move with Stockfish: `Brilliant / Great / Best / Good / Inaccuracy / Mistake / Blunder`, plus accuracy and average centipawn loss.
- Charts the results, comparing games played **with** and **without** a chess rules primer in the state.
- Measures playing strength against Stockfish at calibrated ratings (`npm run ladder`).

## Setup

Requires Node 22+ and Stockfish (`brew install stockfish`).

```bash
npm install
echo 'AI_GATEWAY_API_KEY=your_key' > .env.local   # https://vercel.com/ai-gateway
npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | the app |
| `npm test` | self-check on the Stockfish grading (a hung queen must read as a Blunder) |
| `npm run ladder -- 6 1320` | 6 games vs Stockfish at 1320 Elo; `s0` for Skill Level 0 |
| `npm run probe` | print the exact state sent to Jev for one position |

## Findings so far

Jev lost **12 straight games** to Stockfish — 0/6 at its weakest calibrated rating (1320 Elo) and 0/6 at Skill Level 0, every one by checkmate, playing both colours. So its strength is **below 1320**, which is as precise as Stockfish can say: `UCI_Elo` floors there, and `Skill Level` has no published Elo mapping.

Per-game Elo estimated from centipawn loss is in the UI, but treat it as unreliable — across games of the same model it ranges 400–1475, which no real rating does. Accuracy and acpl are measured directly and are the numbers to trust.

Whether the rules primer helps is **not yet answered**: the current sample is 5 games with it against 2 without, nowhere near enough to separate.

## Notes

- Calls AI Gateway's `/v1/evaluate` endpoint directly rather than the AI SDK's `experimental_evaluate`, which rejects any answer whose `choice` isn't the strict argmax — across 30+ near-equal chess moves Jev legitimately returns ties.
- Jev cannot be fine-tuned; the same weights serve every account. You shape it through the request.

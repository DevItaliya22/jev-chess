import type { Game } from "@/lib/types";

const LABELS = [
  "Brilliant",
  "Great",
  "Best",
  "Good",
  "Inaccuracy",
  "Mistake",
  "Blunder",
] as const;
const CONDITIONS = [
  { key: true, name: "With rules", cls: "fill-[var(--s1)]" },
  { key: false, name: "No rules", cls: "fill-[var(--s2)]" },
] as const;

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

/** One horizontal grouped bar chart. `rows` are the categories; each has two values. */
function GroupedBars({
  title,
  unit,
  rows,
  format = (v: number) => v.toFixed(1),
}: {
  title: string;
  unit: string;
  rows: { label: string; values: [number, number]; counts: [number, number] }[];
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => r.values));
  const BAR = 11;
  const GAP = 2; // 2px surface gap between adjacent bars
  const ROW = BAR * 2 + GAP + 16;
  const LABEL_W = 74;
  const W = 300;
  const plot = W - LABEL_W - 44;

  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-xs font-medium text-neutral-700 dark:text-neutral-300">
        {title}
        <span className="ml-1 font-normal text-neutral-500">({unit})</span>
      </figcaption>
      <svg width="100%" viewBox={`0 0 ${W} ${rows.length * ROW}`} role="img">
        {rows.map((r, i) => (
          <g key={r.label} transform={`translate(0 ${i * ROW})`}>
            <text
              x={LABEL_W - 6}
              y={BAR + 3}
              textAnchor="end"
              className="fill-neutral-500 text-[9px]"
            >
              {r.label}
            </text>
            {CONDITIONS.map((c, k) => {
              const w = (r.values[k] / max) * plot;
              return (
                <g key={c.name}>
                  <rect
                    x={LABEL_W}
                    y={k * (BAR + GAP)}
                    width={Math.max(r.counts[k] ? 1.5 : 0, w)}
                    height={BAR}
                    rx={3}
                    className={c.cls}
                  >
                    <title>
                      {r.label} · {c.name}: {format(r.values[k])} {unit}
                      {r.counts[k] ? ` (${r.counts[k]} games)` : " (no games)"}
                    </title>
                  </rect>
                  <text
                    x={LABEL_W + Math.max(r.counts[k] ? 1.5 : 0, w) + 4}
                    y={k * (BAR + GAP) + BAR - 2}
                    className="fill-neutral-500 text-[9px] tabular-nums"
                  >
                    {r.counts[k] ? format(r.values[k]) : "–"}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    </figure>
  );
}

export default function Charts({ games }: { games: Game[] }) {
  const analysed = games.filter((g) => g.analysis);
  // split by condition: the primer is applied to both seats, so rules.w describes the game
  const byCond = CONDITIONS.map((c) =>
    analysed.filter((g) => g.rules.w === c.key),
  );
  const counts: [number, number] = [byCond[0].length, byCond[1].length];

  const lengthRows = [
    {
      label: "Game length",
      values: byCond.map((gs) => mean(gs.map((g) => g.plies.length))) as [
        number,
        number,
      ],
      counts,
    },
  ];

  const qualityRows = LABELS.map((l) => ({
    label: l,
    // Share of all moves, not count per game: no-rules games run longer, so raw
    // counts would grow for reasons that have nothing to do with move quality.
    values: byCond.map((gs) => {
      const all = gs.flatMap((g) => g.analysis!.plies);
      return all.length
        ? (100 * all.filter((p) => p.label === l).length) / all.length
        : 0;
    }) as [number, number],
    counts,
  })).filter((r) => r.values[0] > 0 || r.values[1] > 0);

  const strengthRows = [
    {
      label: "Accuracy %",
      values: byCond.map((gs) =>
        mean(
          gs.flatMap((g) => [g.analysis!.accuracy.w, g.analysis!.accuracy.b]),
        ),
      ) as [number, number],
      counts,
    },
    {
      label: "Avg cp loss",
      values: byCond.map((gs) =>
        mean(gs.flatMap((g) => [g.analysis!.acpl.w, g.analysis!.acpl.b])),
      ) as [number, number],
      counts,
    },
  ];

  if (!analysed.length)
    return (
      <p className="text-sm text-neutral-500">
        No analysed games yet. Play a game, or hit Analyse on one below.
      </p>
    );

  return (
    <div className="flex flex-col gap-6 [--s1:#2a78d6] [--s2:#eb6834] dark:[--s1:#3987e5] dark:[--s2:#d95926]">
      <div className="flex flex-wrap gap-3 text-xs">
        {CONDITIONS.map((c, k) => (
          <span
            key={c.name}
            className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400"
          >
            <svg width="10" height="10" aria-hidden>
              <rect width="10" height="10" rx="2" className={c.cls} />
            </svg>
            {c.name} ({counts[k]} {counts[k] === 1 ? "game" : "games"})
          </span>
        ))}
      </div>

      <GroupedBars
        title="Average game length"
        unit="plies"
        rows={lengthRows}
        format={(v) => v.toFixed(0)}
      />
      <GroupedBars
        title="Move quality"
        unit="% of moves"
        rows={qualityRows}
      />
      <GroupedBars
        title="Strength"
        unit="per side"
        rows={strengthRows}
        format={(v) => v.toFixed(0)}
      />

      <details className="text-xs text-neutral-500">
        <summary className="cursor-pointer">Table view</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th className="pr-2 font-normal">Metric</th>
              {CONDITIONS.map((c) => (
                <th key={c.name} className="pr-2 font-normal">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {[...lengthRows, ...strengthRows, ...qualityRows].map((r) => (
              <tr key={r.label}>
                <td className="pr-2">{r.label}</td>
                {r.values.map((v, k) => (
                  <td key={k} className="pr-2">
                    {r.counts[k] ? v.toFixed(1) : "–"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

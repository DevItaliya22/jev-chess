import { useEffect, useRef } from "react";
import type { Judged } from "@/lib/analyse";
import { NAMES, type Ply } from "@/lib/types";

export const LABEL_STYLE: Record<string, string> = {
  Brilliant: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  Great: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  Best: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  Good: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  Inaccuracy: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  Mistake: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  Blunder: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export default function MoveList({
  plies,
  judged,
  current,
  onSelect,
}: {
  plies: Ply[];
  judged?: Judged[];
  /** 1-based ply to highlight; follow the newest move when undefined */
  current?: number;
  onSelect?: (n: number) => void;
}) {
  const ref = useRef<HTMLOListElement>(null);
  const follow = current ?? plies.length;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (current === undefined) el.scrollTop = el.scrollHeight;
    else el.children[current - 1]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [follow, current]);

  return (
    <ol ref={ref} className="max-h-[34rem] flex-1 overflow-auto text-sm">
      {plies.map((p) => {
        const j = judged?.[p.n - 1];
        return (
          <li
            key={p.n}
            onClick={() => onSelect?.(p.n)}
            className={`border-b border-neutral-200 py-2 dark:border-neutral-800 ${
              onSelect ? "cursor-pointer" : ""
            } ${p.n === current ? "bg-amber-100 dark:bg-amber-950" : ""}`}
          >
            <div className="flex justify-between gap-2 font-mono">
              <span>
                {p.n}. {NAMES[p.color]} <strong>{p.move}</strong>
              </span>
              <span className="shrink-0 text-neutral-500">
                {(p.confidence * 100).toFixed(0)}% · {p.ms}ms
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              {j && (
                <span className={`rounded px-1.5 py-0.5 font-medium ${LABEL_STYLE[j.label]}`}>
                  {j.label}
                  {!j.playedBest && ` · best ${j.bestMove}`}
                  {j.loss > 0 && ` · −${(j.loss / 100).toFixed(1)}`}
                </span>
              )}
              <span>{p.top.map(([m, v]) => `${m} ${(v * 100).toFixed(0)}%`).join("  ")}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

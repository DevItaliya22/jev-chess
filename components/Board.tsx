import { Chess } from "chess.js";

// Solid glyphs for both colours, tinted with CSS. The outline glyphs (♔♕♖)
// render inconsistently across fonts; the filled set is uniform.
const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

export default function Board({
  fen,
  bar,
}: {
  fen: string;
  // vertical gauge beside the board: 0..1 plus a caption
  bar?: { value: number; label: string; color: "w" | "b" };
}) {
  const board = new Chess(fen).board();
  return (
    <div className="flex w-full max-w-[min(92vw,34rem)] gap-2">
      <div className="flex w-8 shrink-0 flex-col items-center">
        <div className="relative w-3 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          {bar && (
            <div
              className={`absolute inset-x-0 bottom-0 transition-[height] duration-300 ${
                bar.color === "w" ? "bg-neutral-100" : "bg-neutral-900 dark:bg-neutral-500"
              }`}
              style={{ height: `${Math.round(bar.value * 100)}%` }}
            />
          )}
        </div>
        <span className="mt-1 text-[10px] tabular-nums text-neutral-500">
          {bar ? `${Math.round(bar.value * 100)}%` : "–"}
        </span>
        <span className="text-[10px] text-neutral-400">{bar?.label ?? ""}</span>
      </div>

      <div className="grid flex-1 grid-cols-8 overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700">
        {board.flat().map((sq, i) => (
          <div
            key={i}
            // aspect-square on every cell, so empty ranks keep their height
            className={`flex aspect-square items-center justify-center text-[clamp(1.3rem,5.5vw,2.2rem)] leading-none ${
              ((i >> 3) + i) % 2 === 1 ? "bg-[#b58863]" : "bg-[#f0d9b5]"
            }`}
            style={
              sq
                ? {
                    // filled glyph + contrasting stroke reads cleanly on both square colours
                    color: sq.color === "w" ? "#fff" : "#111",
                    WebkitTextStroke: `1px ${sq.color === "w" ? "#111" : "#000"}`,
                  }
                : undefined
            }
          >
            {sq ? GLYPH[sq.type] : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { Chess } from "chess.js";
import { useCallback, useEffect, useRef, useState } from "react";
import Board from "@/components/Board";
import Charts from "@/components/Charts";
import MoveList, { LABEL_STYLE } from "@/components/MoveList";
import { NAMES, type Analysis, type Game, type Ply } from "@/lib/types";

const START = new Chess().fen();

export default function Page() {
  // live game
  const [fen, setFen] = useState(START);
  const [plies, setPlies] = useState<Ply[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [rulesOn, setRulesOn] = useState(true);
  const [count, setCount] = useState(1);
  const live = useRef(false);

  // saved games + review
  const [games, setGames] = useState<Game[]>([]);
  const [review, setReview] = useState<Game | null>(null);
  const [i, setI] = useState(0); // 0 = start position, n = after ply n
  const [auto, setAuto] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  // per-row analysis in flight; Stockfish takes ~a minute, so the row must say so
  const [pending, setPending] = useState<string[]>([]);

  const loadGames = useCallback(
    () =>
      fetch("/api/games")
        .then((r) => r.json())
        .then(setGames),
    [],
  );
  useEffect(() => {
    loadGames();
  }, [loadGames]);

  // autoplay the review scrubber
  useEffect(() => {
    if (!auto || !review) return;
    if (i >= review.plies.length) return setAuto(false);
    const t = setTimeout(() => setI((x) => x + 1), 600);
    return () => clearTimeout(t);
  }, [auto, i, review]);

  async function playGame(gameRules: {
    w: boolean;
    b: boolean;
  }): Promise<Game | null> {
    const game = new Chess();
    const acc: Ply[] = [];
    setPlies([]);
    setFen(game.fen());

    while (live.current && !game.isGameOver()) {
      const color = game.turn() as "w" | "b";
      const fenBefore = game.fen();
      const res = await fetch("/api/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen: fenBefore,
          withRules: gameRules[color],
          history: game.history(),
        }),
      });
      const d = await res.json();
      if (d.error) {
        setError(d.error);
        return null;
      }
      game.move(d.move);
      acc.push({
        n: acc.length + 1,
        color,
        move: d.move,
        withRules: gameRules[color],
        confidence: d.confidence,
        ms: d.ms,
        top: Object.entries(d.probabilities as Record<string, number>)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4),
        fenBefore,
        fenAfter: game.fen(),
      });
      setPlies([...acc]);
      setFen(game.fen());
    }
    if (!game.isGameOver()) return null; // stopped early, don't save a partial

    const record: Game = {
      id: `${Date.now()}`,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      rules: gameRules,
      result: game.isCheckmate()
        ? `${NAMES[game.turn() === "w" ? "b" : "w"]} wins by checkmate`
        : game.isDraw()
          ? "Draw"
          : "Game over",
      pgn: game.pgn(),
      plies: acc,
    };
    await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    await loadGames();
    void analyse(record, true).catch(() => {});
    return record;
  }

  async function run() {
    if (live.current) return void (live.current = false);
    setReview(null);
    live.current = true;
    setRunning(true);
    setError("");
    const r = { w: rulesOn, b: rulesOn };
    for (let n = 0; n < count && live.current; n++) {
      setStatus(
        `Game ${n + 1} of ${count} — rules primer ${rulesOn ? "on" : "off"}`,
      );
      const done = await playGame(r);
      if (!done) break;
      setStatus(`Game ${n + 1} of ${count} — ${done.result}`);
    }
    live.current = false;
    setRunning(false);
  }

  async function analyse(g: Game, quiet = false) {
    if (!quiet) setAnalysing(true);
    setPending((p) => [...p, g.id]);
    const r: Analysis & { error?: string } = await fetch("/api/analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(g),
    })
      .then((r) => r.json())
      .catch((err) => ({ error: String(err) }));
    if (!quiet) setAnalysing(false);
    setPending((p) => p.filter((id) => id !== g.id));
    if (r.error) return quiet ? undefined : setError(r.error);
    // only swap the board into review if the user asked for this analysis
    if (!quiet) setReview({ ...g, analysis: r });
    await loadGames();
  }

  const shown = review;
  const ply = shown && i > 0 ? shown.plies[i - 1] : null;
  const boardFen = shown ? (ply ? ply.fenAfter : START) : fen;
  const lastLive = plies[plies.length - 1];
  const barPly = shown ? ply : lastLive;
  const a = shown?.analysis;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold">
          {NAMES.w} vs {NAMES.b}
        </h1>
        <p className="text-sm text-neutral-500">
          Both seats played by <code>typesafe-ai/jev</code> via AI Gateway — one
          Choice question over the legal moves. Graded by Stockfish.
        </p>
      </header>

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          <section className="flex flex-col gap-6 md:flex-row">
            <div className="w-full max-w-[34rem] shrink-0">
              <Board
                fen={boardFen}
                bar={
                  barPly
                    ? {
                        value: barPly.confidence,
                        label: barPly.move,
                        color: barPly.color,
                      }
                    : undefined
                }
              />

              {shown ? (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <button
                      onClick={() => setReview(null)}
                      className="rounded border border-neutral-400 px-3 py-1"
                    >
                      ← Live
                    </button>
                    <button
                      onClick={() => setI(0)}
                      className="rounded border border-neutral-400 px-3 py-1"
                    >
                      ⏮
                    </button>
                    <button
                      onClick={() => setI((x) => Math.max(0, x - 1))}
                      className="rounded border border-neutral-400 px-3 py-1"
                    >
                      ◀
                    </button>
                    <button
                      onClick={() => setAuto((x) => !x)}
                      className="rounded bg-neutral-900 px-3 py-1 text-white dark:bg-white dark:text-neutral-900"
                    >
                      {auto ? "Pause" : "Play"}
                    </button>
                    <button
                      onClick={() =>
                        setI((x) => Math.min(shown.plies.length, x + 1))
                      }
                      className="rounded border border-neutral-400 px-3 py-1"
                    >
                      ▶
                    </button>
                    <span className="tabular-nums text-neutral-500">
                      {i} / {shown.plies.length}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={shown.plies.length}
                    value={i}
                    onChange={(e) => {
                      setAuto(false);
                      setI(+e.target.value);
                    }}
                    className="w-full"
                  />
                  <p className="text-sm font-medium">
                    {shown.result} ·{" "}
                    {shown.rules.w ? "with rules primer" : "no rules primer"}
                  </p>

                  {!a && (
                    <button
                      onClick={() => analyse(shown)}
                      disabled={analysing}
                      className="self-start rounded border border-neutral-400 px-3 py-1 text-sm disabled:opacity-50"
                    >
                      {analysing ? "Analysing…" : "Analyse with Stockfish"}
                    </button>
                  )}

                  {a && (
                    <div className="flex flex-col gap-2 text-sm">
                      {(["w", "b"] as const).map((c) => (
                        <div key={c} className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-baseline gap-3">
                            <strong>{NAMES[c]}</strong>
                            <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs text-white dark:bg-white dark:text-neutral-900">
                              {a.elo[c]} Elo
                            </span>
                            <span className="text-neutral-500">
                              {a.accuracy[c].toFixed(1)}% accuracy ·{" "}
                              {a.acpl[c].toFixed(0)} acpl
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 text-xs">
                            {Object.keys(LABEL_STYLE).map((l) => {
                              const n = a.plies.filter(
                                (p) => p.color === c && p.label === l,
                              ).length;
                              return n ? (
                                <span
                                  key={l}
                                  className={`rounded px-1.5 py-0.5 ${LABEL_STYLE[l]}`}
                                >
                                  {l} {n}
                                </span>
                              ) : null;
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-3 text-sm">
                  <div className="flex gap-2">
                    {[true, false].map((on) => (
                      <button
                        key={String(on)}
                        disabled={running}
                        onClick={() => setRulesOn(on)}
                        className={`rounded border px-3 py-1 ${
                          rulesOn === on
                            ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                            : "border-neutral-400"
                        }`}
                      >
                        {on ? "With rules primer" : "No rules primer"}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2">
                    Games
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={count}
                      disabled={running}
                      onChange={(e) => setCount(Math.max(1, +e.target.value))}
                      className="w-16 rounded border border-neutral-400 px-2 py-1"
                    />
                  </label>
                  <button
                    onClick={run}
                    className="self-start rounded bg-neutral-900 px-4 py-2 text-white dark:bg-white dark:text-neutral-900"
                  >
                    {running
                      ? "Stop"
                      : `Play ${count} game${count > 1 ? "s" : ""}`}
                  </button>
                  {status && <p className="font-medium">{status}</p>}
                </div>
              )}

              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            </div>

            {shown ? (
              <MoveList
                plies={shown.plies}
                judged={a?.plies}
                current={i}
                onSelect={(n) => {
                  setAuto(false);
                  setI(n);
                }}
              />
            ) : (
              <MoveList plies={plies} />
            )}
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Previous games</h2>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-neutral-500">
                <tr>
                  <th className="py-1 pr-3">Result</th>
                  <th className="py-1 pr-3">Plies</th>
                  <th className="py-1 pr-3">Primer</th>
                  <th className="py-1 pr-3">{NAMES.w} est.</th>
                  <th className="py-1 pr-3">{NAMES.b} est.</th>
                  <th className="py-1 pr-3" />
                  <th className="py-1">When</th>
                </tr>
              </thead>
              <tbody>
                {games.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-2 text-neutral-500">
                      No games yet.
                    </td>
                  </tr>
                )}
                {games.map((g) => (
                  <tr
                    key={g.id}
                    onClick={() => {
                      setReview(g);
                      setI(0);
                      setAuto(false);
                    }}
                    className={`cursor-pointer border-t border-neutral-200 hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-900 ${
                      review?.id === g.id
                        ? "bg-amber-100 dark:bg-amber-950"
                        : ""
                    }`}
                  >
                    <td className="py-2 pr-3">{g.result}</td>
                    <td className="py-2 pr-3 tabular-nums">{g.plies.length}</td>
                    <td className="py-2 pr-3">
                      {g.rules.w ? "rules" : "none"}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {g.analysis?.elo.w ?? "—"}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {g.analysis?.elo.b ?? "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {pending.includes(g.id) ? (
                        <span className="text-xs text-neutral-500">
                          Analysing…
                        </span>
                      ) : (
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            analyse(g, true);
                          }}
                          className="rounded border border-neutral-400 px-2 py-0.5 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        >
                          {g.analysis ? "Re-analyse" : "Analyse"}
                        </button>
                      )}
                    </td>
                    <td className="py-2 text-neutral-500">
                      {new Date(g.startedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="w-full shrink-0 lg:w-[20rem]">
          <h2 className="mb-3 text-lg font-semibold">Charts</h2>
          <Charts games={games} />
        </aside>
      </div>
    </main>
  );
}

import type { Judged } from "./analyse";

/** The two seats at the board. Same model, different chair. */
export const NAMES = { w: "Jev Ivory", b: "Jev Onyx" } as const;

export type Ply = {
  n: number;
  color: "w" | "b";
  move: string;
  withRules: boolean;
  confidence: number;
  ms: number;
  top: [string, number][];
  fenBefore: string;
  fenAfter: string;
};

export type Analysis = {
  accuracy: { w: number; b: number };
  elo: { w: number; b: number };
  acpl: { w: number; b: number };
  plies: Judged[];
};

export type Game = {
  id: string;
  startedAt: string;
  endedAt: string;
  rules: { w: boolean; b: boolean };
  result: string;
  pgn: string;
  plies: Ply[];
  analysis?: Analysis;
};

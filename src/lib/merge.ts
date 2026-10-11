// Mergezy rules, tile sequence and scoring. Pure functions only, so the same
// code drives the board, the daily puzzle and the balance simulation.
//
// Rules:
// - Place the current tile on any empty square.
// - If it joins 3 or more orthogonally connected tiles of the same colour
//   and number, they merge into one tile, one higher, on the square you
//   just played. The new tile can merge again straight away (a combo).
// - A star tile copies whichever neighbour it would merge best with.
// - Reaching the top number makes the tile burst, clearing it and its
//   neighbours.
// - The game ends when the board is full.
import { makeRng } from "./rng.ts";

export const SIZE = 5;
export const CELLS = SIZE * SIZE;
export const COLORS = 3;
/** Merging three of these bursts instead of making a bigger tile. */
export const TOP_VALUE = 6;
/** Daily tries; the best one counts. */
export const DAILY_TRIES = 3;

/** c: colour 0–3, or -1 for a star (wild) tile that hasn't been placed yet. */
export interface Tile {
  c: number;
  v: number;
}
export type Board = (Tile | null)[];

export interface Game {
  board: Board;
  /** Index into the tile sequence of the tile being placed now. */
  turn: number;
  score: number;
  /** Highest number made this game. */
  best: number;
  /** Longest chain of merges from one placement. */
  maxCombo: number;
  over: boolean;
}

export interface MergeStep {
  /** Colour and number of the group that merged. */
  color: number;
  value: number;
  /** Squares that slid into `at`. */
  from: number[];
  at: number;
  /** The tile left at `at` (null when it burst). */
  tile: Tile | null;
  points: number;
  combo: number;
  /** Squares cleared by a burst. */
  burst?: number[];
}

export function newGame(): Game {
  return { board: Array(CELLS).fill(null), turn: 0, score: 0, best: 1, maxCombo: 0, over: false };
}

// ---------------------------------------------------------------------------
// Tile sequence
// ---------------------------------------------------------------------------

/** Tile number `i` of the sequence named `seed`. Each tile has its own RNG,
 *  so any tile can be looked up without generating the ones before it. */
export function tileAt(seed: string, i: number): Tile {
  const rng = makeRng(`${seed}#${i}`);
  // A gentle start of plain 1s, then 2s and later 3s turn up more and more
  // often, so the board keeps climbing the longer you survive.
  const r = rng();
  if (i >= 8 && r < 0.05) return { c: -1, v: 1 };
  const p2 = i < 10 ? 0 : Math.min(0.3, 0.08 + (i - 10) / 160);
  const p3 = i < 40 ? 0 : Math.min(0.12, 0.03 + (i - 40) / 450);
  const roll = rng();
  const v = roll < p3 ? 3 : roll < p3 + p2 ? 2 : 1;
  return { c: Math.floor(rng() * COLORS), v };
}

// ---------------------------------------------------------------------------
// Board helpers
// ---------------------------------------------------------------------------

export function neighbours(i: number): number[] {
  const r = Math.floor(i / SIZE), c = i % SIZE;
  const out: number[] = [];
  if (r > 0) out.push(i - SIZE);
  if (r < SIZE - 1) out.push(i + SIZE);
  if (c > 0) out.push(i - 1);
  if (c < SIZE - 1) out.push(i + 1);
  return out;
}

/** Squares connected to `start` holding the same colour and number. */
export function groupAt(board: Board, start: number): number[] {
  const t = board[start];
  if (!t) return [];
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    for (const n of neighbours(i)) {
      const u = board[n];
      if (!seen.has(n) && u && u.c === t.c && u.v === t.v) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return [...seen];
}

export function emptySquares(board: Board): number[] {
  const out: number[] = [];
  board.forEach((t, i) => t === null && out.push(i));
  return out;
}

/** What a star tile becomes on square `at`: the neighbour it would make the
 *  biggest group with (higher numbers win ties), or `fallback` alone. */
export function resolveStar(board: Board, at: number, fallback: Tile): Tile {
  let best: Tile | null = null;
  let bestSize = 0;
  for (const n of neighbours(at)) {
    const u = board[n];
    if (!u) continue;
    const trial = board.slice();
    trial[at] = { c: u.c, v: u.v };
    const size = groupAt(trial, at).length;
    if (size > bestSize || (size === bestSize && best && u.v > best.v)) {
      best = { c: u.c, v: u.v };
      bestSize = size;
    }
  }
  return best ?? { c: fallback.c === -1 ? 0 : fallback.c, v: 1 };
}

/** Points for one merge: bigger numbers and bigger groups score more, and
 *  each link in a combo multiplies it. */
export function mergePoints(value: number, groupSize: number, combo: number): number {
  return value * groupSize * 10 * combo;
}

// ---------------------------------------------------------------------------
// Playing a tile
// ---------------------------------------------------------------------------

/** Plays the current tile of `seed` on square `at`. Returns the new game and
 *  the merges it caused, in order, for the board to animate. */
export function place(game: Game, seed: string, at: number): { game: Game; steps: MergeStep[] } {
  if (game.over || game.board[at] !== null) return { game, steps: [] };
  const board = game.board.slice();
  let tile = tileAt(seed, game.turn);
  if (tile.c === -1) tile = resolveStar(board, at, tileAt(seed, game.turn + 1));
  board[at] = tile;

  const steps: MergeStep[] = [];
  let score = game.score;
  let best = Math.max(game.best, tile.v);
  let combo = 0;
  for (;;) {
    const here: Tile | null = board[at];
    if (!here) break;
    const group = groupAt(board, at);
    if (group.length < 3) break;
    combo += 1;
    const points = mergePoints(here.v, group.length, combo);
    score += points;
    const from = group.filter((i) => i !== at);
    for (const i of from) board[i] = null;
    if (here.v + 1 >= TOP_VALUE) {
      // Burst: the top tile clears itself and everything around it.
      const burst = [at, ...neighbours(at).filter((n) => board[n] !== null)];
      for (const i of burst) board[i] = null;
      const bonus = 100 * TOP_VALUE * combo;
      score += bonus;
      best = Math.max(best, TOP_VALUE);
      steps.push({ color: here.c, value: here.v, from, at, tile: null, points: points + bonus, combo, burst });
      break;
    }
    const grown: Tile = { c: here.c, v: here.v + 1 };
    board[at] = grown;
    best = Math.max(best, grown.v);
    steps.push({ color: here.c, value: here.v, from, at, tile: grown, points, combo });
  }

  const over = board.every((t) => t !== null);
  return {
    game: { board, turn: game.turn + 1, score, best, maxCombo: Math.max(game.maxCombo, combo), over },
    steps,
  };
}

/** Rebuilds a game from the squares played so far. */
export function replay(seed: string, moves: number[]): Game {
  let g = newGame();
  for (const m of moves) g = place(g, seed, m).game;
  return g;
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dailySeed(date: string): string {
  return `mergezy:daily:${date}`;
}

export function msUntilNextPuzzle(now: number = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
}

/** Daily puzzle number: 1 on launch day. */
export const LAUNCH_DATE = "2026-10-11";
export function puzzleNumber(date: string): number {
  return Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(LAUNCH_DATE + "T00:00:00Z")) / 86400000) + 1;
}

// ---------------------------------------------------------------------------
// Hint
// ---------------------------------------------------------------------------

/** A sensible square for the current tile: the one that scores most now,
 *  else the one next to the most matching tiles. Used by the hint button. */
export function suggest(game: Game, seed: string): number | null {
  const empty = emptySquares(game.board);
  if (game.over || empty.length === 0) return null;
  let bestSq = empty[0];
  let bestVal = -Infinity;
  const tile = tileAt(seed, game.turn);
  for (const sq of empty) {
    const { game: after } = place(game, seed, sq);
    let val = (after.score - game.score) * 10 + emptySquares(after.board).length;
    if (after.score === game.score) {
      const t = tile.c === -1 ? resolveStar(game.board, sq, tileAt(seed, game.turn + 1)) : tile;
      for (const n of neighbours(sq)) {
        const u = game.board[n];
        if (u && u.c === t.c && u.v === t.v) val += 5;
        else if (u && u.c === t.c) val += 1;
      }
      // Keep the middle open early on.
      const r = Math.floor(sq / SIZE), c = sq % SIZE;
      if (r === 0 || c === 0 || r === SIZE - 1 || c === SIZE - 1) val += 1;
    }
    if (val > bestVal) {
      bestVal = val;
      bestSq = sq;
    }
  }
  return bestSq;
}

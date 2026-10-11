// Local save for what's inherently per-device: today's tries, the free-play
// game in progress, streaks and the stats achievements are computed from.
// Identity and leaderboard standing live in Supabase (lib/supabase.ts
// ensureSession + lib/leaderboard.ts).
import { DAILY_TRIES } from "./merge.ts";

const KEY = "mergezy.save.v1";

export interface TryResult {
  score: number;
  /** Highest number made. */
  best: number;
  /** Tiles placed. */
  turns: number;
}

/** Today's daily: finished tries plus the one in progress, if any. Kept in
 *  storage so a reload mid-game doesn't lose the board. */
export interface DailyProgress {
  date: string;
  tries: TryResult[];
  /** Squares played so far in the current try (null between tries). */
  moves: number[] | null;
}

export interface SaveData {
  lastPlayedDate: string | null;
  streak: number;
  maxStreak: number;
  /** Days with at least one finished try. */
  daysPlayed: number;
  bestDailyScore: number;
  bestFreeScore: number;
  highestTile: number;
  maxCombo: number;
  gamesPlayed: number;
  /** Free play (stub until payments exist). */
  unlockedFree: boolean;
  displayName: string | null;
  unlockedAchievements: string[];
  daily: DailyProgress | null;
  /** Free-play game in progress. */
  free: { seed: string; moves: number[] } | null;
}

const DEFAULTS: SaveData = {
  lastPlayedDate: null,
  streak: 0,
  maxStreak: 0,
  daysPlayed: 0,
  bestDailyScore: 0,
  bestFreeScore: 0,
  highestTile: 1,
  maxCombo: 0,
  gamesPlayed: 0,
  unlockedFree: false,
  displayName: null,
  unlockedAchievements: [],
  daily: null,
  free: null,
};

function read(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode, etc.) */
  }
}

/** Today's progress, or a fresh one if the saved day is old. */
export function dailyFor(save: SaveData, date: string): DailyProgress {
  return save.daily && save.daily.date === date ? save.daily : { date, tries: [], moves: null };
}

export function bestTry(p: DailyProgress): TryResult | null {
  return p.tries.reduce<TryResult | null>((b, t) => (!b || t.score > b.score ? t : b), null);
}

export function triesLeft(p: DailyProgress): number {
  return DAILY_TRIES - p.tries.length - (p.moves ? 1 : 0);
}

function recordGameStats(data: SaveData, result: TryResult, combo: number) {
  data.gamesPlayed += 1;
  data.highestTile = Math.max(data.highestTile, result.best);
  data.maxCombo = Math.max(data.maxCombo, combo);
}

export const localSave = {
  get: read,

  /** Starts the next daily try (no-op if one is already running or none are left). */
  startTry(date: string): SaveData {
    const data = read();
    const p = dailyFor(data, date);
    if (p.moves === null && p.tries.length < DAILY_TRIES) p.moves = [];
    data.daily = p;
    write(data);
    return data;
  },

  setDailyMoves(date: string, moves: number[]): SaveData {
    const data = read();
    const p = dailyFor(data, date);
    p.moves = moves;
    data.daily = p;
    write(data);
    return data;
  },

  /** Records a finished daily try; the first finished try of a day keeps the streak going. */
  finishTry(date: string, result: TryResult, combo: number): SaveData {
    const data = read();
    const p = dailyFor(data, date);
    p.tries = [...p.tries, result].slice(0, DAILY_TRIES);
    p.moves = null;
    data.daily = p;
    recordGameStats(data, result, combo);
    data.bestDailyScore = Math.max(data.bestDailyScore, result.score);
    if (data.lastPlayedDate !== date) {
      const yesterday = new Date(Date.parse(date + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
      data.streak = data.lastPlayedDate === yesterday ? data.streak + 1 : 1;
      data.lastPlayedDate = date;
      data.maxStreak = Math.max(data.maxStreak, data.streak);
      data.daysPlayed += 1;
    }
    write(data);
    return data;
  },

  startFree(seed: string): SaveData {
    const data = read();
    data.free = { seed, moves: [] };
    write(data);
    return data;
  },

  setFreeMoves(moves: number[]): SaveData {
    const data = read();
    if (data.free) data.free.moves = moves;
    write(data);
    return data;
  },

  finishFree(result: TryResult, combo: number): SaveData {
    const data = read();
    recordGameStats(data, result, combo);
    data.bestFreeScore = Math.max(data.bestFreeScore, result.score);
    data.free = null;
    write(data);
    return data;
  },

  setUnlockedAchievements(ids: string[]): SaveData {
    const data = read();
    data.unlockedAchievements = ids;
    write(data);
    return data;
  },

  /** Placeholder until a real payment processor is wired up — never call
   *  this from anywhere except a confirmed, server-verified purchase. */
  setUnlocked(value: boolean): SaveData {
    const data = read();
    data.unlockedFree = value;
    write(data);
    return data;
  },
};

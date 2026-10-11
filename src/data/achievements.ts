// Achievement definitions — computed from the per-device SaveData, so
// unlocking one doesn't require an account.
import type { SaveData } from "../lib/localSave.ts";

export interface Achievement {
  id: string;
  title: string;
  description: string;
  /** lucide-react icon name, resolved by the component that renders these. */
  icon: "Star" | "Flame" | "Zap" | "Gauge" | "Target" | "Trophy";
  isUnlocked: (save: SaveData) => boolean;
  /** Shown under a locked achievement, e.g. "Best streak: 2". */
  progress?: (save: SaveData) => string;
}

const best = (s: SaveData) => Math.max(s.bestDailyScore, s.bestFreeScore);

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_game",
    title: "First Merge",
    description: "Finish your first game.",
    icon: "Star",
    isUnlocked: (s) => s.gamesPlayed >= 1,
  },
  {
    id: "tile_4",
    title: "Four Up",
    description: "Make a 4 tile.",
    icon: "Target",
    isUnlocked: (s) => s.highestTile >= 4,
    progress: (s) => `Best tile: ${s.highestTile}`,
  },
  {
    id: "tile_5",
    title: "High Five",
    description: "Make a 5 tile.",
    icon: "Target",
    isUnlocked: (s) => s.highestTile >= 5,
    progress: (s) => `Best tile: ${s.highestTile}`,
  },
  {
    id: "combo_2",
    title: "Chain Reaction",
    description: "Set off a combo: one merge straight into another.",
    icon: "Zap",
    isUnlocked: (s) => s.maxCombo >= 2,
  },
  {
    id: "score_1000",
    title: "Four Figures",
    description: "Score 1,000 points in one game.",
    icon: "Gauge",
    isUnlocked: (s) => best(s) >= 1000,
    progress: (s) => `Best: ${best(s).toLocaleString("en-GB")}`,
  },
  {
    id: "score_2500",
    title: "Tile Tycoon",
    description: "Score 2,500 points in one game.",
    icon: "Gauge",
    isUnlocked: (s) => best(s) >= 2500,
    progress: (s) => `Best: ${best(s).toLocaleString("en-GB")}`,
  },
  {
    id: "streak_3",
    title: "On a Roll",
    description: "Play the daily 3 days in a row.",
    icon: "Flame",
    isUnlocked: (s) => s.maxStreak >= 3,
    progress: (s) => `Best streak: ${s.maxStreak}`,
  },
  {
    id: "streak_7",
    title: "Week Streak",
    description: "Play the daily 7 days in a row.",
    icon: "Flame",
    isUnlocked: (s) => s.maxStreak >= 7,
    progress: (s) => `Best streak: ${s.maxStreak}`,
  },
  {
    id: "dedicated_25",
    title: "Dedicated",
    description: "Play 25 daily puzzles.",
    icon: "Trophy",
    isUnlocked: (s) => s.daysPlayed >= 25,
    progress: (s) => `${s.daysPlayed} / 25`,
  },
];

/** Ids of achievements newly true in `save` that weren't already unlocked. */
export function diffNewlyUnlocked(save: SaveData, prevUnlockedIds: string[]): string[] {
  const prev = new Set(prevUnlockedIds);
  return ACHIEVEMENTS.filter((a) => !prev.has(a.id) && a.isUnlocked(save)).map((a) => a.id);
}

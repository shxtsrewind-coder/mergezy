// Daily leaderboard — backed by Supabase (the project shared with the other
// bgameworld games; see supabase/migrations for the mergezy_* tables). Writes
// go through a SECURITY DEFINER RPC that reads the player's identity and
// display name from the session itself, never from client-supplied values.
import { supabase } from "./supabase.ts";

export interface LeaderboardEntry {
  playerId: string;
  displayName: string;
  score: number;
  best: number;
  tries: number;
  isYou: boolean;
}

/** Records finished daily try number `tryNo` (1–3). The server stores each
 *  try once, so sending the same try again is harmless; a player's best try
 *  is their score for the day. */
export async function submitScore(opts: { puzzleDate: string; tryNo: number; score: number; best: number; turns: number }): Promise<void> {
  const { error } = await supabase.rpc("submit_mergezy_score", {
    p_puzzle_date: opts.puzzleDate,
    p_try_no: opts.tryNo,
    p_score: Math.max(0, Math.round(opts.score)),
    p_best: opts.best,
    p_turns: opts.turns,
  });
  if (error) throw error;
}

/** Returns this game's display name for the signed-in player, copying it
 *  over from another bgameworld game the first time an existing account
 *  plays. Null for guests who haven't picked a name. */
export async function ensureProfile(): Promise<string | null> {
  const { data, error } = await supabase.rpc("mergezy_ensure_profile");
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Highest score first. */
export async function getDailyLeaderboard(puzzleDate: string, currentPlayerId: string | null, limit = 10): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("mergezy_daily_leaderboard", { p_puzzle_date: puzzleDate, p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((row: { player_id: string; display_name: string; score: number; best: number; tries: number }) => ({
    playerId: row.player_id,
    displayName: row.display_name,
    score: row.score,
    best: row.best,
    tries: row.tries,
    isYou: row.player_id === currentPlayerId,
  }));
}

export interface DailyStats {
  players: number;
  average: number;
  best: number;
}

/** "312 players today · average 840 · best 2,410". Null when unreachable. */
export async function getDailyStats(puzzleDate: string): Promise<DailyStats | null> {
  const { data, error } = await supabase.rpc("mergezy_daily_stats", { p_puzzle_date: puzzleDate });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { players: Number(row.players) || 0, average: Math.round(Number(row.average) || 0), best: Number(row.best) || 0 };
}

export interface AllTimeLeaderboardEntry {
  playerId: string;
  displayName: string;
  days: number;
  topScore: number;
  isYou: boolean;
}

/** All-time standings: most days played, then highest single score. */
export async function getAllTimeLeaderboard(currentPlayerId: string | null, limit = 10): Promise<AllTimeLeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("mergezy_alltime_leaderboard", { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((row: { player_id: string; display_name: string; days: number; top_score: number }) => ({
    playerId: row.player_id,
    displayName: row.display_name,
    days: Number(row.days),
    topScore: Number(row.top_score),
    isYou: row.player_id === currentPlayerId,
  }));
}

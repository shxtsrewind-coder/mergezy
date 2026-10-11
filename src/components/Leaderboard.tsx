import React, { useEffect, useState } from "react";
import { Trophy, CalendarDays } from "lucide-react";
import {
  getDailyLeaderboard,
  getAllTimeLeaderboard,
  type LeaderboardEntry,
  type AllTimeLeaderboardEntry,
} from "../lib/leaderboard.ts";

type Tab = "today" | "alltime";

const fmt = (n: number) => n.toLocaleString("en-GB");

export const Leaderboard: React.FC<{
  date: string;
  currentPlayerId: string | null;
  refreshKey: number;
}> = ({ date, currentPlayerId, refreshKey }) => {
  const [tab, setTab] = useState<Tab>("today");
  const [dailyEntries, setDailyEntries] = useState<LeaderboardEntry[] | null>(null);
  const [allTimeEntries, setAllTimeEntries] = useState<AllTimeLeaderboardEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setDailyEntries(null);
    getDailyLeaderboard(date, currentPlayerId)
      .then((rows) => { if (!cancelled) setDailyEntries(rows); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [date, currentPlayerId, refreshKey]);

  useEffect(() => {
    if (tab !== "alltime" || allTimeEntries !== null) return;
    let cancelled = false;
    getAllTimeLeaderboard(currentPlayerId)
      .then((rows) => { if (!cancelled) setAllTimeEntries(rows); })
      .catch(() => { /* all-time stays empty — today's tab still works */ });
    return () => { cancelled = true; };
  }, [tab, currentPlayerId, allTimeEntries]);

  // A new score just landed — the all-time standings are stale.
  useEffect(() => {
    setAllTimeEntries(null);
  }, [refreshKey]);

  if (failed) return null; // no backend reachable — leaderboard quietly stays hidden

  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
      active ? "bg-correct-soft text-correct" : "text-muted hover:text-paper"
    }`;
  const rowClass = (you: boolean) =>
    `flex items-center justify-between text-sm font-mono px-2 py-1 rounded-md ${you ? "bg-correct-soft text-correct" : "text-paper/80"}`;

  return (
    <div className="w-full bg-surface border border-rule rounded-xl p-4">
      <div className="flex items-center gap-1 mb-3">
        <button type="button" onClick={() => setTab("today")} className={tabClass(tab === "today")}>
          <Trophy className="w-3.5 h-3.5" />
          Today
        </button>
        <button type="button" onClick={() => setTab("alltime")} className={tabClass(tab === "alltime")}>
          <CalendarDays className="w-3.5 h-3.5" />
          All-Time
        </button>
        <span className="ml-auto text-[11px] font-mono text-muted">{tab === "today" ? "best of 3 tries" : "days played"}</span>
      </div>

      {tab === "today" ? (
        dailyEntries === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : dailyEntries.length === 0 ? (
          <p className="text-sm text-muted">No scores yet today — be the first.</p>
        ) : (
          <ol className="space-y-1">
            {dailyEntries.map((entry, i) => (
              <li key={entry.playerId} className={rowClass(entry.isYou)}>
                <span className="truncate pr-2">
                  {i + 1}. {entry.displayName}
                  {entry.isYou ? " (you)" : ""}
                </span>
                <span className="shrink-0 text-right">
                  {fmt(entry.score)}
                  <span className="text-muted"> · tile {entry.best}</span>
                </span>
              </li>
            ))}
          </ol>
        )
      ) : allTimeEntries === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : allTimeEntries.length === 0 ? (
        <p className="text-sm text-muted">No scores recorded yet — be the first.</p>
      ) : (
        <ol className="space-y-1">
          {allTimeEntries.map((entry, i) => (
            <li key={entry.playerId} className={rowClass(entry.isYou)}>
              <span className="truncate pr-2">
                {i + 1}. {entry.displayName}
                {entry.isYou ? " (you)" : ""}
              </span>
              <span className="text-right shrink-0">
                {entry.days} day{entry.days === 1 ? "" : "s"}
                <span className="text-muted"> · best {fmt(entry.topScore)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

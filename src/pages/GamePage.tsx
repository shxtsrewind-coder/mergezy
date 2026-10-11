import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Lock, Sparkles, Flame, WifiOff, Award, Play, Share2, Check, RotateCcw, Users, CircleHelp, X, Infinity as InfinityIcon } from "lucide-react";
import { MergeBoard, TileQueue, TileFace } from "../components/MergeBoard.tsx";
import { Leaderboard } from "../components/Leaderboard.tsx";
import { AuthModal } from "../components/AuthModal.tsx";
import { Confetti } from "../components/Confetti.tsx";
import { AchievementToastStack } from "../components/AchievementToast.tsx";
import { AchievementsModal } from "../components/AchievementsModal.tsx";
import {
  dailySeed,
  msUntilNextPuzzle,
  place,
  puzzleNumber,
  replay,
  tileAt,
  todayUtc,
  DAILY_TRIES,
  TOP_VALUE,
  type Game,
  type MergeStep,
} from "../lib/merge.ts";
import { localSave, dailyFor, bestTry, triesLeft, type TryResult, type SaveData } from "../lib/localSave.ts";
import { submitScore, ensureProfile, getDailyStats, type DailyStats } from "../lib/leaderboard.ts";
import { supabase, ensureSession, currentUser, withTimeout, BOOT_STEP_MS } from "../lib/supabase.ts";
import { formatCountdown } from "../hooks/useTimer.ts";
import { ACHIEVEMENTS, diffNewlyUnlocked, type Achievement } from "../data/achievements.ts";
import { buildShareText, shareResult } from "../lib/share.ts";

type Mode = "daily" | "free";
type Phase = "auth_checking" | "choice" | "ready";

const PLAY_CHOICE_KEY = "mergezy.playChoice";

const OTHER_GAMES = [
  { name: "Wordezy", url: "https://wordezy.bgameworld.com/" },
  { name: "Wordezy Search", url: "https://wordezysearch.bgameworld.com/" },
  { name: "Wordezy Scramble", url: "https://wordezyscramble.bgameworld.com/" },
  { name: "Wordezy Ladder", url: "https://wordezyladder.bgameworld.com/" },
  { name: "Sortezy", url: "https://sortezy.bgameworld.com/" },
  { name: "Linkezy", url: "https://linkezy.bgameworld.com/" },
  { name: "Lingoezy", url: "https://lingoezy.bgameworld.com/" },
  { name: "When & Where", url: "https://whenandwhere.bgameworld.com/" },
];

const fmt = (n: number) => n.toLocaleString("en-GB");

/** Four little tiles in the game's colours. */
const Wordmark: React.FC = () => (
  <span className="grid grid-cols-2 gap-[3px] w-7 h-7 shrink-0" aria-hidden="true">
    {[
      { c: 0, v: 1 },
      { c: 1, v: 2 },
      { c: 2, v: 1 },
      { c: 0, v: 3 },
    ].map((t, i) => (
      <TileFace key={i} tile={t} size="sm" blank />
    ))}
  </span>
);

/** One game in progress: the board plus the last placement's animation. */
function useGame(seed: string | null, moves: number[] | null) {
  const game = useMemo(() => (seed && moves ? replay(seed, moves) : null), [seed, moves]);
  const [anim, setAnim] = useState<{ steps: MergeStep[]; placed: number | null; version: number }>({ steps: [], placed: null, version: 0 });
  const play = (sq: number): { game: Game; steps: MergeStep[] } | null => {
    if (!seed || !game || game.over || game.board[sq] !== null) return null;
    const res = place(game, seed, sq);
    setAnim((a) => ({ steps: res.steps, placed: sq, version: a.version + 1 }));
    return res;
  };
  const reset = () => setAnim((a) => ({ steps: [], placed: null, version: a.version + 1 }));
  return { game, anim, play, reset };
}

export const GamePage: React.FC = () => {
  const [phase, setPhase] = useState<Phase>("auth_checking");
  // Sign-in couldn't be reached: the game plays, the leaderboard waits.
  const [offline, setOffline] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Player");
  const [hasProfile, setHasProfile] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  const [mode, setMode] = useState<Mode>("daily");
  const [save, setSave] = useState(() => localSave.get());
  const [today] = useState(() => todayUtc());
  const seed = dailySeed(today);
  const progress = dailyFor(save, today);
  const daily = useGame(seed, progress.moves);
  const free = useGame(save.free?.seed ?? null, save.free?.moves ?? null);

  /** The board of the try that just ended, kept on screen under the result. */
  const [endedDaily, setEndedDaily] = useState<Game | null>(null);
  const [endedFree, setEndedFree] = useState<{ game: Game; result: TryResult } | null>(null);

  const [stats, setStats] = useState<DailyStats | null>(null);
  const [leaderboardKey, setLeaderboardKey] = useState(0);
  const [scoreStatus, setScoreStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [showAchievements, setShowAchievements] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[] | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "shared" | "copied" | "failed">("idle");

  const refreshStats = useCallback(() => {
    getDailyStats(today).then(setStats).catch(() => setStats(null));
  }, [today]);

  const unlockAchievements = useCallback((updated: SaveData) => {
    const prev = updated.unlockedAchievements;
    const newIds = diffNewlyUnlocked(updated, prev);
    if (newIds.length === 0) return updated;
    setNewlyUnlocked(ACHIEVEMENTS.filter((a) => newIds.includes(a.id)));
    return localSave.setUnlockedAchievements([...prev, ...newIds]);
  }, []);

  const submitTry = useCallback(
    (result: TryResult, tryNo: number) => {
      setScoreStatus("saving");
      submitScore({ puzzleDate: today, tryNo, score: result.score, best: result.best, turns: result.turns })
        .then(() => {
          setScoreStatus("saved");
          setLeaderboardKey((k) => k + 1);
          refreshStats();
        })
        .catch(() => setScoreStatus("failed"));
    },
    [today, refreshStats]
  );

  /** Sends every finished try of today (tries already stored are ignored). */
  const resubmitToday = useCallback(() => {
    const p = dailyFor(localSave.get(), todayUtc());
    p.tries.forEach((t, i) => submitTry(t, i + 1));
  }, [submitTry]);

  /** `quiet` retries in the background (the Retry link, coming back online)
   *  without swapping the game out for the loading screen. */
  const bootAuth = useCallback(async (quiet = false) => {
    if (!quiet) setPhase("auth_checking");
    try {
      const session = await ensureSession();
      if (!session.ok) {
        // Offline, blocked or down. The puzzle doesn't need the server, so
        // play locally; scores sync once a later retry gets through.
        setOffline(true);
        setPhase("ready");
        return;
      }
      setOffline(false);
      const user = await currentUser();
      const anon = user?.is_anonymous ?? true;
      setUserId(user?.id ?? null);
      const name = await withTimeout(ensureProfile(), BOOT_STEP_MS, null);
      if (name) {
        setDisplayName(name);
        setHasProfile(true);
        // A try from earlier today that never reached the server gets another go.
        resubmitToday();
      }
      refreshStats();
      const choiceDone = typeof window !== "undefined" && sessionStorage.getItem(PLAY_CHOICE_KEY) === "true";
      setPhase(!anon || choiceDone || name || quiet ? "ready" : "choice");
    } catch (err) {
      console.error("Failed to establish session:", err);
      setOffline(true);
      setPhase("ready");
    }
  }, [refreshStats, resubmitToday]);

  useEffect(() => {
    bootAuth();
  }, [bootAuth]);

  useEffect(() => {
    if (!offline) return;
    const retry = () => bootAuth(true);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [offline, bootAuth]);

  const handleAuthResolved = useCallback(
    (opts: { isAnonymous: boolean; displayName?: string }) => {
      if (typeof window !== "undefined") sessionStorage.setItem(PLAY_CHOICE_KEY, "true");
      setShowAuth(false);
      setPhase("ready");
      if (!opts.displayName && opts.isAnonymous) return;
      if (opts.displayName) setDisplayName(opts.displayName);
      setHasProfile(true);
      supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
      resubmitToday();
    },
    [resubmitToday]
  );

  const celebrate = (ms = 1600) => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), ms);
  };

  // ---- Daily -------------------------------------------------------------

  const startTry = () => {
    setEndedDaily(null);
    daily.reset();
    setSave(localSave.startTry(today));
  };

  const placeDaily = (sq: number) => {
    const res = daily.play(sq);
    if (!res || !progress.moves) return;
    const moves = [...progress.moves, sq];
    if (!res.game.over) {
      setSave(localSave.setDailyMoves(today, moves));
      return;
    }
    const result: TryResult = { score: res.game.score, best: res.game.best, turns: res.game.turn };
    const previousBest = bestTry(progress)?.score ?? -1;
    const updated = unlockAchievements(localSave.finishTry(today, result, res.game.maxCombo));
    setEndedDaily(res.game);
    setSave(updated);
    if (result.score > previousBest && result.score > 0) celebrate();
    if (hasProfile) submitTry(result, updated.daily?.tries.length ?? 1);
  };

  const handleShare = async () => {
    const top = bestTry(progress);
    if (!top) return;
    const text = buildShareText({ date: today, score: top.score, best: top.best, tries: progress.tries.length, ladder: progress.tries.map((t) => t.score) });
    const result = await shareResult(text);
    setShareState(result);
    setTimeout(() => setShareState("idle"), 2200);
  };

  // ---- Free play -----------------------------------------------------------

  const startFree = () => {
    setEndedFree(null);
    free.reset();
    setSave(localSave.startFree(`mergezy:free:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`));
  };

  const placeFree = (sq: number) => {
    const res = free.play(sq);
    if (!res || !save.free) return;
    const moves = [...save.free.moves, sq];
    if (!res.game.over) {
      setSave(localSave.setFreeMoves(moves));
      return;
    }
    const result: TryResult = { score: res.game.score, best: res.game.best, turns: res.game.turn };
    const record = result.score > save.bestFreeScore;
    setEndedFree({ game: res.game, result });
    setSave(unlockAchievements(localSave.finishFree(result, res.game.maxCombo)));
    if (record && result.score > 0) celebrate();
  };

  const handleUnlock = () => {
    // Stub — no payment processor wired up yet. Replace with a real
    // server-verified purchase flow before this ever ships.
    alert("Payments aren't set up yet — free play will unlock for $2 once that's wired in.");
  };

  // ---- Screens -------------------------------------------------------------

  if (phase === "auth_checking") {
    return (
      <div className="min-h-screen bg-ink text-paper flex items-center justify-center">
        <Wordmark />
      </div>
    );
  }
  if (phase === "choice") {
    return <AuthModal currentDisplayName={displayName} onResolved={handleAuthResolved} />;
  }

  const modalOpen = showAuth || showAchievements || showHelp;
  const btn = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-rule bg-surface text-sm text-paper/90 hover:border-muted/60 transition-colors disabled:opacity-40";
  const primary = "inline-flex items-center justify-center gap-2 w-full max-w-xs py-3 rounded-lg bg-correct hover:bg-correct-dim text-paper font-medium transition-colors";
  const left = triesLeft(progress);
  const top = bestTry(progress);

  const statsLine = stats && stats.players > 0 && (
    <p className="text-xs font-mono text-muted flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5" aria-label="Today's players">
      <span className="inline-flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" />
        {fmt(stats.players)} player{stats.players === 1 ? "" : "s"} today
      </span>
      <span>· avg {fmt(stats.average)}</span>
      <span>· best {fmt(stats.best)}</span>
    </p>
  );

  const scoreBar = (g: Game, label: string) => (
    <div className="w-full max-w-[26rem] flex items-end justify-between">
      <div>
        <p className="text-[11px] font-mono uppercase tracking-wide text-muted">{label}</p>
        <p className="font-sans font-extrabold text-4xl leading-none tabular-nums" aria-label="Score">
          {fmt(g.score)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-[11px] font-mono uppercase tracking-wide text-muted">Top tile</p>
        <p className="font-sans font-extrabold text-2xl leading-none">{g.best}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink text-paper flex flex-col items-center px-4 py-6 gap-5">
      <header className="w-full max-w-xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Wordmark />
          <h1 className="font-display font-semibold text-lg truncate">Mergezy</h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {save.streak > 0 && (
            <div className="flex items-center gap-1 text-sm text-present font-mono" title="Daily streak">
              <Flame className="w-4 h-4" />
              {save.streak}
            </div>
          )}
          <button type="button" onClick={() => setShowHelp(true)} className="text-muted hover:text-paper transition-colors" aria-label="How to play">
            <CircleHelp className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setShowAchievements(true)}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-paper transition-colors"
            aria-label="Achievements"
          >
            <Award className="w-4 h-4" />
            {save.unlockedAchievements.length}/{ACHIEVEMENTS.length}
          </button>
        </div>
      </header>

      {showConfetti && <Confetti durationMs={1600} />}
      {newlyUnlocked && newlyUnlocked.length > 0 && <AchievementToastStack achievements={newlyUnlocked} onDone={() => setNewlyUnlocked(null)} />}
      {showAchievements && <AchievementsModal save={save} onClose={() => setShowAchievements(false)} />}
      {showAuth && <AuthModal currentDisplayName={displayName} onResolved={handleAuthResolved} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      <div className="flex items-center gap-1 p-1 bg-surface border border-rule rounded-lg">
        {(["daily", "free"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === m ? "bg-correct text-paper" : "text-muted hover:text-paper"}`}
          >
            {m === "daily" ? "Daily" : "Free play"}
            {m === "free" && !save.unlockedFree && <Lock className="w-3.5 h-3.5" />}
          </button>
        ))}
      </div>

      <main className="w-full max-w-xl flex flex-col items-center gap-5">
        {offline && (
          <div role="status" className="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-rule bg-surface text-xs text-muted">
            <WifiOff className="w-4 h-4 shrink-0 text-present" aria-hidden="true" />
            <span className="flex-1">Playing offline. Your game saves on this device; the leaderboard comes back when you reconnect.</span>
            <button type="button" onClick={() => bootAuth(true)} className="shrink-0 font-medium text-paper underline underline-offset-2">
              Retry
            </button>
          </div>
        )}
        {/* ---- Daily: intro ---- */}
        {mode === "daily" && progress.tries.length === 0 && !progress.moves && (
          <section className="w-full bg-surface border border-rule rounded-xl p-6 text-center space-y-5 animate-rise-in">
            <div className="space-y-1.5">
              <p className="text-xs font-mono text-muted uppercase tracking-wide">
                No. {puzzleNumber(today)} ·{" "}
                {new Date(today + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
              </p>
              <h2 className="font-display font-semibold text-2xl">Today's tiles</h2>
              <p className="text-sm text-muted">Everyone gets the same tiles in the same order. You have {DAILY_TRIES} tries and your best score counts.</p>
            </div>
            <Rules />
            <button type="button" onClick={startTry} className={primary}>
              <Play className="w-4 h-4" />
              Play — try 1 of {DAILY_TRIES}
            </button>
            {statsLine}
          </section>
        )}

        {/* ---- Daily: playing ---- */}
        {mode === "daily" && progress.moves && daily.game && (
          <>
            {scoreBar(daily.game, `Try ${progress.tries.length + 1} of ${DAILY_TRIES}${top ? ` · best ${fmt(top.score)}` : ""}`)}
            <MergeBoard
              board={daily.game.board}
              current={tileAt(seed, daily.game.turn)}
              steps={daily.anim.steps}
              lastPlaced={daily.anim.placed}
              version={daily.anim.version}
              disabled={modalOpen}
              onPlace={placeDaily}
            />
            <TileQueue current={tileAt(seed, daily.game.turn)} next={tileAt(seed, daily.game.turn + 1)} version={daily.game.turn} />
            {statsLine}
          </>
        )}

        {/* ---- Daily: between tries / done ---- */}
        {mode === "daily" && progress.tries.length > 0 && !progress.moves && top && (
          <>
            <DailyResult
              date={today}
              tries={progress.tries}
              best={top}
              left={left}
              ended={endedDaily}
              streak={save.streak}
              shareState={shareState}
              onShare={handleShare}
              onRetry={startTry}
              onFree={() => setMode("free")}
              scoreStatus={scoreStatus}
              hasProfile={hasProfile}
              onJoin={() => setShowAuth(true)}
              statsLine={statsLine}
            />
            <Leaderboard date={today} currentPlayerId={userId} refreshKey={leaderboardKey} />
          </>
        )}

        {/* ---- Free play ---- */}
        {mode === "free" && !save.unlockedFree && (
          <section className="w-full max-w-sm bg-surface border border-rule rounded-xl p-6 text-center space-y-4 mt-2">
            <div className="w-12 h-12 rounded-full bg-present-soft border border-present-dim/50 flex items-center justify-center text-present mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-lg">Free play</h2>
              <p className="text-sm text-muted mt-1.5">
                Endless games, each with a fresh run of tiles, as often as you like. The daily stays free forever.
              </p>
            </div>
            <button type="button" onClick={handleUnlock} className="w-full py-2.5 px-4 rounded-md bg-correct hover:bg-correct-dim text-paper font-medium text-sm transition-colors">
              Unlock free play for $2
            </button>
          </section>
        )}

        {mode === "free" && save.unlockedFree && free.game && save.free && (
          <>
            {scoreBar(free.game, `Free play${save.bestFreeScore ? ` · best ${fmt(save.bestFreeScore)}` : ""}`)}
            <MergeBoard
              board={free.game.board}
              current={tileAt(save.free.seed, free.game.turn)}
              steps={free.anim.steps}
              lastPlaced={free.anim.placed}
              version={free.anim.version}
              disabled={modalOpen}
              onPlace={placeFree}
            />
            <TileQueue current={tileAt(save.free.seed, free.game.turn)} next={tileAt(save.free.seed, free.game.turn + 1)} version={free.game.turn} />
            <button type="button" onClick={startFree} className={btn}>
              <RotateCcw className="w-4 h-4" />
              New game
            </button>
          </>
        )}

        {mode === "free" && save.unlockedFree && !save.free && (
          <section className="w-full bg-surface border border-rule rounded-xl p-6 text-center space-y-4 animate-rise-in">
            {endedFree ? (
              <>
                <p className="text-xs font-mono text-muted uppercase tracking-wide">Board full</p>
                <p className="font-sans font-extrabold text-5xl text-correct">{fmt(endedFree.result.score)}</p>
                <p className="text-sm text-muted">
                  Top tile {endedFree.result.best} · {endedFree.result.turns} tiles placed
                  {endedFree.result.score >= save.bestFreeScore && endedFree.result.score > 0 ? " · new best!" : ` · best ${fmt(save.bestFreeScore)}`}
                </p>
                <FinalBoard game={endedFree.game} />
              </>
            ) : (
              <>
                <h2 className="font-display font-semibold text-xl">Free play</h2>
                <p className="text-sm text-muted">A fresh run of tiles every game.{save.bestFreeScore ? ` Your best: ${fmt(save.bestFreeScore)}.` : ""}</p>
              </>
            )}
            <button type="button" onClick={startFree} className={primary}>
              <InfinityIcon className="w-4 h-4" />
              {endedFree ? "Play again" : "Start a game"}
            </button>
          </section>
        )}
      </main>

      <footer className="w-full max-w-xl mt-auto pt-6 border-t border-rule/60 text-center space-y-2">
        <p className="text-xs text-muted">More free games on bgameworld</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
          {OTHER_GAMES.map((g) => (
            <a key={g.url} href={g.url} className="text-paper/80 hover:text-correct transition-colors">
              {g.name}
            </a>
          ))}
          <a href="https://bgameworld.com/" className="text-muted hover:text-paper transition-colors">
            All games
          </a>
        </nav>
      </footer>
    </div>
  );
};

const Rules: React.FC = () => (
  <ul className="text-sm text-paper/80 space-y-2.5 text-left max-w-sm mx-auto">
    <li className="flex items-start gap-2.5">
      <span className="w-6 h-6 shrink-0"><TileFace tile={{ c: 0, v: 1 }} size="xs" /></span>
      Tap any empty square to place the tile shown under the board.
    </li>
    <li className="flex items-start gap-2.5">
      <span className="w-6 h-6 shrink-0"><TileFace tile={{ c: 1, v: 2 }} size="xs" /></span>
      Join 3 or more of the same colour and number and they merge into one tile, a number higher. Merges can chain into combos.
    </li>
    <li className="flex items-start gap-2.5">
      <span className="w-6 h-6 shrink-0"><TileFace tile={{ c: -1, v: 1 }} size="xs" /></span>
      A star copies the neighbour it merges best with. Three {TOP_VALUE - 1}s burst and clear the squares around them.
    </li>
    <li className="flex items-start gap-2.5">
      <span className="w-6 h-6 shrink-0"><TileFace tile={{ c: 2, v: 3 }} size="xs" /></span>
      Bigger numbers and bigger groups score more. The game ends when the board is full.
    </li>
  </ul>
);

const HelpModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div role="dialog" aria-modal="true" aria-label="How to play" className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <div className="w-full max-w-md bg-surface border border-rule rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-lg">How to play</h2>
        <button type="button" onClick={onClose} className="text-muted hover:text-paper transition-colors" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>
      <Rules />
      <p className="text-xs text-muted">
        The daily gives everyone the same tiles in the same order, with {DAILY_TRIES} tries — your best one counts. Later in a game, 2s and 3s
        start turning up, so the longer you last the faster you climb.
      </p>
    </div>
  </div>
);

/** The finished board, small and dimmed, under a result. */
const FinalBoard: React.FC<{ game: Game }> = ({ game }) => (
  <div className="grid grid-cols-5 gap-1 w-40 mx-auto opacity-80" aria-hidden="true">
    {game.board.map((t, i) => (
      <span key={i} className="aspect-square rounded-md bg-ink/70">
        {t && <TileFace tile={t} size="xs" />}
      </span>
    ))}
  </div>
);

const DailyResult: React.FC<{
  date: string;
  tries: TryResult[];
  best: TryResult;
  left: number;
  ended: Game | null;
  streak: number;
  shareState: "idle" | "shared" | "copied" | "failed";
  onShare: () => void;
  onRetry: () => void;
  onFree: () => void;
  scoreStatus: "idle" | "saving" | "saved" | "failed";
  hasProfile: boolean;
  onJoin: () => void;
  statsLine: React.ReactNode;
}> = ({ date, tries, best, left, ended, streak, shareState, onShare, onRetry, onFree, scoreStatus, hasProfile, onJoin, statsLine }) => {
  const [countdown, setCountdown] = useState(() => msUntilNextPuzzle());
  useEffect(() => {
    const id = setInterval(() => setCountdown(msUntilNextPuzzle()), 1000);
    return () => clearInterval(id);
  }, []);
  const last = tries[tries.length - 1];

  return (
    <section className="w-full bg-surface border border-rule rounded-xl p-6 space-y-5 animate-rise-in">
      <div className="text-center space-y-2">
        <p className="text-xs font-mono text-muted uppercase tracking-wide">
          {left > 0 ? `Try ${tries.length} of ${DAILY_TRIES} · board full` : `Mergezy No. ${puzzleNumber(date)} · all tries done`}
        </p>
        <p className="font-sans font-extrabold text-5xl text-correct tabular-nums">{fmt(left > 0 ? last.score : best.score)}</p>
        <p className="text-sm text-muted">
          {left > 0
            ? last.score >= best.score && tries.length > 1
              ? "Your best try today!"
              : tries.length > 1
                ? `Best today: ${fmt(best.score)}`
                : `Top tile ${last.best} · ${last.turns} tiles placed`
            : `Your best of ${DAILY_TRIES} · top tile ${best.best}${streak > 1 ? ` · ${streak}-day streak` : ""}`}
        </p>
        <div className="flex justify-center gap-2 pt-1" aria-label="Scores by try">
          {Array.from({ length: DAILY_TRIES }, (_, i) => (
            <span
              key={i}
              className={`px-2.5 py-1 rounded-md border font-mono text-xs ${
                tries[i] ? (tries[i] === best ? "border-correct text-correct bg-correct-soft" : "border-rule text-paper/80") : "border-rule/50 text-faint"
              }`}
            >
              {tries[i] ? fmt(tries[i].score) : "—"}
            </span>
          ))}
        </div>
      </div>

      {ended && <FinalBoard game={ended} />}

      {left > 0 && (
        <button type="button" onClick={onRetry} className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-correct hover:bg-correct-dim text-paper font-medium transition-colors">
          <RotateCcw className="w-4 h-4" />
          Try again — {left} {left === 1 ? "try" : "tries"} left
        </button>
      )}
      <button
        type="button"
        onClick={onShare}
        className={`inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
          left > 0 ? "border border-rule text-paper/90 hover:border-muted/60" : "bg-correct hover:bg-correct-dim text-paper"
        }`}
      >
        {shareState === "copied" ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
        {shareState === "copied" ? "Copied — paste it anywhere" : shareState === "failed" ? "Couldn't copy — try again" : left > 0 ? "Share best so far" : "Share result"}
      </button>
      {left === 0 && (
        <button type="button" onClick={onFree} className="w-full py-2 rounded-lg border border-rule text-sm text-paper/90 hover:border-muted/60 transition-colors">
          Keep playing — Free play
        </button>
      )}

      <div className="text-center space-y-1.5">
        {statsLine}
        {left === 0 && <p className="text-xs font-mono text-muted">Next puzzle in {formatCountdown(countdown)}</p>}
        {!hasProfile ? (
          <button type="button" onClick={onJoin} className="text-xs text-correct hover:underline">
            Create a free account to put your score on the leaderboard
          </button>
        ) : scoreStatus === "failed" ? (
          <p className="text-xs text-muted">Saved on this device — the leaderboard couldn't be reached.</p>
        ) : null}
      </div>
    </section>
  );
};


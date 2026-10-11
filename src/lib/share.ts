import { puzzleNumber } from "./merge.ts";

export const GAME_URL = "https://mergezy.bgameworld.com/";

/** Spoiler-free result: best score of the day, top tile and tries used. */
export function buildShareText(opts: { date: string; score: number; best: number; tries: number; ladder: number[] }): string {
  // One square per try, brightest for the best one.
  const top = Math.max(...opts.ladder);
  const row = opts.ladder.map((s) => (s === top ? "🟩" : s >= top * 0.6 ? "🟨" : "🟥")).join("");
  return (
    `Mergezy #${puzzleNumber(opts.date)}\n` +
    `🧩 ${opts.score.toLocaleString("en-GB")} points · top tile ${opts.best}\n` +
    `${row} ${opts.tries} ${opts.tries === 1 ? "try" : "tries"}\n` +
    GAME_URL
  );
}

/** Opens the native share sheet where there is one (phones), otherwise
 *  copies to the clipboard. Resolves to what happened, for the button label. */
export async function shareResult(text: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (typeof navigator !== "undefined" && navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      await navigator.share({ text });
      return "shared";
    }
  } catch (err) {
    // The player closing the share sheet isn't a failure worth reporting.
    if ((err as { name?: string })?.name === "AbortError") return "shared";
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

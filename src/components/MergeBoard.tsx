import React from "react";
import { Leaf, Sun, Flame, Sparkles } from "lucide-react";
import { SIZE, type Board, type MergeStep, type Tile } from "../lib/merge.ts";

/** Colour 0–2 plus the star. Each has an icon so the colours can be told
 *  apart without seeing colour. */
export const TILE_STYLES = [
  { name: "Leaf", Icon: Leaf, top: "#4cc28d", base: "#2f9e6e", edge: "#1d6e4a" },
  { name: "Sun", Icon: Sun, top: "#e8b452", base: "#c9922f", edge: "#8f6519" },
  { name: "Flame", Icon: Flame, top: "#ee7a5f", base: "#d4573f", edge: "#963725" },
] as const;
const STAR = { name: "Star", Icon: Sparkles, top: "#f6f1ff", base: "#cbb8ff", edge: "#8a6fd6" };

export function tileName(t: Tile): string {
  return t.c === -1 ? "Star tile" : `${TILE_STYLES[t.c].name} ${t.v}`;
}

/** The chunky tile face. `size` picks the number size. */
export const TileFace: React.FC<{
  tile: Tile;
  size?: "lg" | "md" | "sm" | "xs";
  /** Colour only — no number, icon or dots (for the logo). */
  blank?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ tile, size = "lg", blank = false, className = "", style }) => {
  const s = tile.c === -1 ? STAR : TILE_STYLES[tile.c];
  const Icon = s.Icon;
  // Bigger numbers glow a little more, so a 4 or 5 stands out on a busy board.
  const glow = tile.v >= 3 ? `0 0 ${6 + tile.v * 3}px ${s.base}88` : "none";
  const num = size === "lg" ? "text-[clamp(1.25rem,7vw,2rem)]" : size === "md" ? "text-2xl" : size === "sm" ? "text-base" : "text-xs";
  const icon = size === "sm" ? "w-2.5 h-2.5" : "w-3.5 h-3.5";
  const small = size === "xs" || blank;
  return (
    <span
      className={`relative w-full h-full rounded-[22%] flex items-center justify-center font-sans font-extrabold select-none ${className}`}
      style={{
        background: `linear-gradient(180deg, ${s.top} 0%, ${s.base} 70%)`,
        boxShadow: `inset 0 -${size === "sm" || size === "xs" ? 3 : 5}px 0 ${s.edge}, inset 0 2px 0 rgba(255,255,255,.25), ${glow}`,
        color: tile.c === -1 ? "#3b2a78" : "#fff",
        textShadow: tile.c === -1 ? "none" : `0 2px 0 ${s.edge}`,
        ...style,
      }}
    >
      {!small && <Icon className={`absolute top-[9%] left-[10%] ${icon} opacity-80`} aria-hidden="true" />}
      {!blank && <span className={num}>{tile.c === -1 ? "★" : tile.v}</span>}
      {!small && tile.v >= 2 && tile.c !== -1 && (
        <span className="absolute bottom-[12%] flex gap-[2px]" aria-hidden="true">
          {Array.from({ length: Math.min(tile.v, 6) }, (_, i) => (
            <span key={i} className="w-[3px] h-[3px] rounded-full bg-white/70" />
          ))}
        </span>
      )}
    </span>
  );
};

const GAP = "0.4rem";

export const MergeBoard: React.FC<{
  board: Board;
  /** The tile you're placing, shown faintly on the square under the pointer. */
  current: Tile | null;
  /** Merges from the last placement, for the slide-in animation. */
  steps: MergeStep[];
  /** Square just played. */
  lastPlaced: number | null;
  /** Changes on every placement so the animations replay. */
  version: number;
  disabled?: boolean;
  onPlace: (square: number) => void;
}> = ({ board, current, steps, lastPlaced, version, disabled, onPlace }) => {
  const [hover, setHover] = React.useState<number | null>(null);
  const burst = new Set(steps.flatMap((s) => s.burst ?? []));
  const totalPoints = steps.reduce((t, s) => t + s.points, 0);
  const lastStep = steps[steps.length - 1];

  return (
    <div className="w-full max-w-[26rem] select-none" style={{ touchAction: "manipulation" }}>
      <div className="relative rounded-2xl bg-surface border border-rule p-2.5 shadow-inner shadow-black/40">
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))`, gap: GAP }} role="grid" aria-label="Board">
          {board.map((t, i) => {
            const row = Math.floor(i / SIZE) + 1;
            const col = (i % SIZE) + 1;
            const isMergeTarget = steps.some((s) => s.at === i) && t !== null;
            return (
              <button
                key={i}
                type="button"
                role="gridcell"
                disabled={disabled || t !== null}
                onClick={() => onPlace(i)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                aria-label={`Row ${row}, column ${col}: ${t ? tileName(t) : "empty"}`}
                className={`relative aspect-square rounded-[22%] transition-colors ${
                  t ? "cursor-default" : "bg-ink/70 border border-rule/80 hover:border-muted/60 cursor-pointer"
                } ${burst.has(i) ? "animate-burst" : ""}`}
              >
                {t && (
                  <TileFace
                    key={`${version}-${i}`}
                    tile={t}
                    className={i === lastPlaced || isMergeTarget ? "animate-pop" : ""}
                    style={isMergeTarget ? { animationDelay: `${(steps.length - 1) * 220 + 160}ms` } : undefined}
                  />
                )}
                {!t && current && hover === i && !disabled && (
                  <span className="absolute inset-0 opacity-35 pointer-events-none">
                    <TileFace tile={current} />
                  </span>
                )}
              </button>
            );
          })}

          {/* Ghosts of the merged tiles sliding into the square that grew. */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {steps.map((s, k) =>
              s.from.map((f) => {
                const fr = Math.floor(f / SIZE), fc = f % SIZE;
                const tr = Math.floor(s.at / SIZE), tc = s.at % SIZE;
                return (
                  <span
                    key={`${version}-${k}-${f}`}
                    className="absolute animate-merge-slide"
                    style={
                      {
                        left: `calc(${fc} * (100% + ${GAP}) / ${SIZE})`,
                        top: `calc(${fr} * (100% + ${GAP}) / ${SIZE})`,
                        width: `calc((100% - ${SIZE - 1} * ${GAP}) / ${SIZE})`,
                        height: `calc((100% - ${SIZE - 1} * ${GAP}) / ${SIZE})`,
                        "--dx": `calc(${tc - fc} * (100% + ${GAP}))`,
                        "--dy": `calc(${tr - fr} * (100% + ${GAP}))`,
                        animationDelay: `${k * 220}ms`,
                      } as React.CSSProperties
                    }
                  >
                    <TileFace tile={{ c: s.color, v: s.value }} />
                  </span>
                );
              })
            )}
            {totalPoints > 0 && lastStep && (
              <span
                key={`pts-${version}`}
                className="absolute flex flex-col items-center animate-float-up"
                style={{
                  left: `calc(${lastStep.at % SIZE} * (100% + ${GAP}) / ${SIZE})`,
                  top: `calc(${Math.floor(lastStep.at / SIZE)} * (100% + ${GAP}) / ${SIZE})`,
                  width: `calc((100% - ${SIZE - 1} * ${GAP}) / ${SIZE})`,
                }}
              >
                <span className="font-mono font-semibold text-sm text-paper drop-shadow-[0_2px_2px_rgba(0,0,0,.8)]">+{totalPoints}</span>
                {steps.length > 1 && <span className="font-mono text-[11px] text-present drop-shadow-[0_2px_2px_rgba(0,0,0,.8)]">combo ×{steps.length}</span>}
                {lastStep.burst && <span className="font-mono text-[11px] text-present drop-shadow-[0_2px_2px_rgba(0,0,0,.8)]">burst!</span>}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/** "Place now" and "Next up", under the board. */
export const TileQueue: React.FC<{ current: Tile | null; next: Tile | null; version: number }> = ({ current, next, version }) => (
  <div className="flex items-end justify-center gap-6">
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[11px] font-mono uppercase tracking-wide text-muted">Place now</span>
      <span className="w-16 h-16 block" aria-label={current ? `Place now: ${tileName(current)}` : "No tile"}>
        {current && <TileFace key={version} tile={current} size="md" className="animate-rise-in" />}
      </span>
    </div>
    <div className="flex flex-col items-center gap-1.5 pb-1">
      <span className="text-[11px] font-mono uppercase tracking-wide text-faint">Next up</span>
      <span className="w-10 h-10 block opacity-80" aria-label={next ? `Next up: ${tileName(next)}` : "No tile"}>
        {next && <TileFace tile={next} size="sm" />}
      </span>
    </div>
  </div>
);

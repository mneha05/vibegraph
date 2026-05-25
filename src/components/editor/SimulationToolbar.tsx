"use client";
import { useVibeStore } from "@/lib/store/vibeStore";
import { Play, Pause, SkipForward, RotateCcw, Activity } from "lucide-react";

/**
 * SimulationToolbar — playback overlay that appears at the bottom of the
 * canvas when the user switches to Simulate view mode.
 *
 * Shows: ⏮ reset · ▶ play / ⏸ pause · ⏭ step · progress bar · current frame label.
 *
 * The simulator state lives in the store; this component is a thin view layer
 * over it. Frame computation is lazy — the first time the user hits play or
 * step, the store computes a deterministic trace of mock executions.
 */
export function SimulationToolbar() {
  const sim = useVibeStore((s) => s.simulation);
  const play = useVibeStore((s) => s.simulatePlay);
  const pause = useVibeStore((s) => s.simulatePause);
  const step = useVibeStore((s) => s.simulateStep);
  const reset = useVibeStore((s) => s.simulateReset);
  const goto = useVibeStore((s) => s.simulateGoto);

  const currentFrame = sim.cursor >= 0 ? sim.frames[sim.cursor] : null;
  const total = sim.frames.length;
  const isPlaying = sim.status === "playing";
  const isDone = sim.status === "done";
  const percentage = total > 0 ? Math.round(((sim.cursor + 1) / total) * 100) : 0;

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[560px] max-w-[92%] panel shadow-elev z-20 animate-in-up">
      <div className="px-3 h-9 flex items-center gap-2 border-b border-ink-600">
        <Activity size={12} className="text-amber" />
        <span className="text-[11px] uppercase tracking-[0.16em] text-amber font-mono">
          simulator
        </span>
        <span className="ml-auto text-[10px] text-ink-300 font-mono">
          {sim.cursor < 0
            ? "ready"
            : isDone
            ? `done · ${total} frames`
            : `frame ${sim.cursor + 1} / ${total}`}
        </span>
      </div>

      <div className="px-3 py-2 flex items-center gap-2">
        <button
          onClick={reset}
          disabled={sim.cursor < 0 && sim.status === "idle"}
          title="Reset to start"
          className="h-7 w-7 flex items-center justify-center rounded border border-ink-600 bg-ink-700 text-ink-100 hover:text-amber hover:border-amber disabled:opacity-30"
        >
          <RotateCcw size={12} />
        </button>
        {isPlaying ? (
          <button
            onClick={pause}
            title="Pause"
            className="h-7 px-3 flex items-center gap-1.5 rounded border border-amber bg-amber/10 text-amber"
          >
            <Pause size={12} /> pause
          </button>
        ) : (
          <button
            onClick={play}
            title={isDone ? "Replay from start" : "Play simulation"}
            className="h-7 px-3 flex items-center gap-1.5 rounded border border-amber bg-amber text-ink-900 hover:bg-amber-deep font-semibold"
          >
            <Play size={12} /> {isDone ? "replay" : "play"}
          </button>
        )}
        <button
          onClick={step}
          disabled={isDone}
          title="Advance one frame"
          className="h-7 w-7 flex items-center justify-center rounded border border-ink-600 bg-ink-700 text-ink-100 hover:text-amber hover:border-amber disabled:opacity-30"
        >
          <SkipForward size={12} />
        </button>

        <div className="flex-1 mx-2">
          <input
            type="range"
            min={-1}
            max={Math.max(0, total - 1)}
            value={sim.cursor}
            onChange={(e) => goto(parseInt(e.target.value, 10))}
            className="w-full accent-amber"
          />
          <div className="mt-0.5 h-0.5 bg-ink-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </div>

      {currentFrame && (
        <div className="px-3 pb-2 text-[11px] font-mono text-ink-100 truncate">
          <span className="text-amber-soft">{currentFrame.nodeId}</span>
          <span className="text-ink-300"> · </span>
          {currentFrame.message}
          {currentFrame.branchHint && (
            <span className="ml-1.5 px-1 py-0.5 rounded-sm bg-cyan/10 text-cyan text-[10px]">
              {currentFrame.branchHint}
            </span>
          )}
        </div>
      )}

      {sim.cursor < 0 && (
        <div className="px-3 pb-2 text-[11px] font-mono text-ink-300">
          Press <span className="kbd">▶ play</span> to walk the workflow.
          Functions return mock data — no APIs are called.
        </div>
      )}
    </div>
  );
}

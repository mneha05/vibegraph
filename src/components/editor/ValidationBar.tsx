"use client";
import { useVibeStore } from "@/lib/store/vibeStore";
import { CheckCircle2, CircleAlert, TriangleAlert, Info } from "lucide-react";

/**
 * ValidationBar — bottom status strip. Mirrors VS Code / Linear's "status bar"
 * convention: error / warning / info counts at the left, sync state and
 * keyboard hint at the right.
 */
export function ValidationBar() {
  const issues = useVibeStore((s) => s.issues);
  const parseError = useVibeStore((s) => s.parseError);
  const vibe = useVibeStore((s) => s.vibe);

  const counts = {
    error: issues.filter((i) => i.severity === "error").length,
    warning: issues.filter((i) => i.severity === "warning").length,
    info: issues.filter((i) => i.severity === "info").length,
  };
  const total = counts.error + counts.warning + counts.info;

  let nodeCount = 0;
  const recurse = (steps: import("@/lib/vibe/schema").VibeNode[]) => {
    for (const s of steps) {
      nodeCount++;
      if (s.kind === "if") {
        recurse(s.then);
        if (s.else) recurse(s.else);
      } else if (s.kind === "for_each" || s.kind === "while") {
        recurse(s.body);
      } else if (s.kind === "parallel") {
        s.branches.forEach(recurse);
      }
    }
  };
  recurse(vibe.workflow.steps);

  return (
    <footer className="h-7 px-3 flex items-center gap-3 bg-ink-800 border-t border-ink-600 text-[11px] font-mono text-ink-300">
      {parseError ? (
        <span className="flex items-center gap-1.5 text-rose">
          <CircleAlert size={11} />
          parse error · line {parseError.line ?? "?"}
        </span>
      ) : total === 0 ? (
        <span className="flex items-center gap-1.5 text-sage">
          <CheckCircle2 size={11} />
          vibe is valid
        </span>
      ) : (
        <>
          {counts.error > 0 && (
            <span className="flex items-center gap-1 text-rose">
              <CircleAlert size={11} /> {counts.error}
            </span>
          )}
          {counts.warning > 0 && (
            <span className="flex items-center gap-1 text-amber">
              <TriangleAlert size={11} /> {counts.warning}
            </span>
          )}
          {counts.info > 0 && (
            <span className="flex items-center gap-1 text-cyan">
              <Info size={11} /> {counts.info}
            </span>
          )}
        </>
      )}
      <span className="ml-auto flex items-center gap-3">
        <span>{nodeCount} nodes</span>
        <span>id: {vibe.workflow.id || "—"}</span>
        <span>
          <span className="kbd">⌘K</span> command palette
        </span>
      </span>
    </footer>
  );
}

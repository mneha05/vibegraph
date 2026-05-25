"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import { useVibeStore } from "@/lib/store/vibeStore";
import { EXAMPLE_VIBES } from "@/examples";
import { walk } from "@/lib/vibe/walk";
import { analyzeScope } from "@/lib/vibe/scope";
import { Workflow, Play, AlertTriangle, GitBranch, Box, Variable, FileCode2, Search } from "lucide-react";

/**
 * CommandPalette — the Cmd+K palette. Cherry-picked actions plus every node
 * and variable in the current Vibe as jumpable items. Charan's editor doesn't
 * have a palette; once a Vibe gets past ~20 steps, clicking around the canvas
 * to find the one you want stops scaling.
 */

interface Action {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ size?: number }>;
  group: "view" | "example" | "node" | "variable" | "tool";
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const vibe = useVibeStore((s) => s.vibe);
  const setViewMode = useVibeStore((s) => s.setViewMode);
  const loadExample = useVibeStore((s) => s.loadExample);
  const jumpToNode = useVibeStore((s) => s.jumpToNode);
  const highlightVar = useVibeStore((s) => s.highlightVar);
  const undo = useVibeStore((s) => s.undo);
  const redo = useVibeStore((s) => s.redo);

  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions: Action[] = useMemo(() => {
    const items: Action[] = [
      { id: "view-flow", label: "View: Flow", icon: Workflow, group: "view", run: () => setViewMode("flow") },
      { id: "view-error", label: "View: Errors", icon: AlertTriangle, group: "view", run: () => setViewMode("error") },
      { id: "view-data", label: "View: Data flow", icon: GitBranch, group: "view", run: () => setViewMode("data") },
      { id: "view-simulate", label: "View: Simulate", icon: Play, group: "view", run: () => setViewMode("simulate") },
      { id: "undo", label: "Undo", hint: "⌘Z", icon: FileCode2, group: "tool", run: undo },
      { id: "redo", label: "Redo", hint: "⌘⇧Z", icon: FileCode2, group: "tool", run: redo },
    ];
    for (const ex of Object.values(EXAMPLE_VIBES)) {
      items.push({
        id: `example-${ex.key}`,
        label: `Load example: ${ex.title}`,
        hint: ex.badge,
        icon: FileCode2,
        group: "example",
        run: () => loadExample(ex.key),
      });
    }
    walk(vibe.workflow.steps, (n) => {
      items.push({
        id: `node-${n.id}`,
        label: `Jump to node: ${n.id}`,
        hint: n.kind,
        icon: Box,
        group: "node",
        run: () => jumpToNode(n.id),
      });
    });
    const scope = analyzeScope(vibe);
    for (const v of scope.values()) {
      items.push({
        id: `var-${v.name}`,
        label: `Highlight variable: $${v.name}`,
        hint: `${v.readers.length} reads · ${v.writers.length} writes`,
        icon: Variable,
        group: "variable",
        run: () => highlightVar(v.name),
      });
    }
    return items;
  }, [vibe, setViewMode, loadExample, jumpToNode, highlightVar, undo, redo]);

  const fuse = useMemo(
    () => new Fuse(actions, { keys: ["label", "hint"], threshold: 0.35 }),
    [actions],
  );
  const filtered = useMemo(() => {
    if (!query) return actions.slice(0, 60);
    return fuse.search(query).slice(0, 60).map((r) => r.item);
  }, [actions, fuse, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  if (!open) return null;

  const run = (a: Action) => {
    a.run();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-sm animate-in-up"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-[92vw] panel shadow-elev overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 h-10 border-b border-ink-600">
          <Search size={14} className="text-ink-300" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search actions, nodes, variables…"
            className="flex-1 bg-transparent text-[13px] text-ink-50 placeholder:text-ink-300 outline-none font-mono"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter" && filtered[activeIdx]) {
                e.preventDefault();
                run(filtered[activeIdx]);
              }
              if (e.key === "Escape") onClose();
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="max-h-[55vh] overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-[12px] text-ink-300 font-mono">
              no matches
            </div>
          )}
          {filtered.map((a, i) => {
            const Icon = a.icon;
            const active = i === activeIdx;
            return (
              <button
                key={a.id}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => run(a)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12.5px] font-mono border-b border-ink-700/50 ${
                  active ? "bg-ink-700 text-amber" : "text-ink-50 hover:bg-ink-700/60"
                }`}
              >
                <Icon size={13} />
                <span className="flex-1">{a.label}</span>
                {a.hint && <span className="text-[10px] text-ink-300">{a.hint}</span>}
              </button>
            );
          })}
        </div>
        <div className="h-7 px-3 flex items-center justify-between border-t border-ink-600 text-[10px] text-ink-300 font-mono">
          <span>
            <span className="kbd">↑↓</span> navigate · <span className="kbd">↵</span> select
          </span>
          <span>{filtered.length} results</span>
        </div>
      </div>
    </div>
  );
}

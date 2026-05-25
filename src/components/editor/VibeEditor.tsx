"use client";
import { useEffect, useState } from "react";
import { Toolbar } from "./Toolbar";
import { YamlPane } from "./YamlPane";
import { CanvasPane } from "./CanvasPane";
import { InspectorPane } from "./InspectorPane";
import { CommandPalette } from "./CommandPalette";
import { ValidationBar } from "./ValidationBar";
import { useVibeStore } from "@/lib/store/vibeStore";

/**
 * VibeEditor — top-level shell.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  Toolbar (brand · example picker · export · undo · view modes)  │
 *   ├──────────────┬─────────────────────────────────┬────────────────┤
 *   │  YAML pane   │  Canvas pane                    │  Inspector     │
 *   │  (Monaco)    │  (React Flow + ELK)             │  (selected     │
 *   │              │                                 │   node + vars  │
 *   │              │                                 │   + issues)    │
 *   ├──────────────┴─────────────────────────────────┴────────────────┤
 *   │  Validation bar  (issue count · last-saved indicator · Cmd+K)   │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * Panes are CSS-grid sized with drag handles. State is shared through the
 * Zustand store; nothing is plumbed via props.
 */
export default function VibeEditor() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const undo = useVibeStore((s) => s.undo);
  const redo = useVibeStore((s) => s.redo);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((x) => !x);
      }
      if (meta && e.key === "z" && !e.shiftKey) {
        // Don't steal undo while typing in Monaco — Monaco handles its own.
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== "textarea" && tag !== "input" && !(e.target as HTMLElement)?.closest(".monaco-editor")) {
          e.preventDefault();
          undo();
        }
      }
      if (meta && ((e.key === "z" && e.shiftKey) || e.key === "y")) {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== "textarea" && tag !== "input" && !(e.target as HTMLElement)?.closest(".monaco-editor")) {
          e.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <div className="h-screen w-screen flex flex-col bg-ink overflow-hidden">
      <Toolbar onOpenPalette={() => setPaletteOpen(true)} />
      <div className="flex-1 grid grid-cols-[minmax(280px,380px)_1fr_minmax(280px,360px)] min-h-0 border-t border-ink-600">
        <YamlPane />
        <CanvasPane />
        <InspectorPane />
      </div>
      <ValidationBar />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

"use client";
import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { useVibeStore, type CanvasViewMode } from "@/lib/store/vibeStore";
import { EXAMPLE_VIBES } from "@/examples";
import {
  Download,
  Upload,
  Undo2,
  Redo2,
  Command,
  Workflow,
  AlertTriangle,
  GitBranch,
  Play,
} from "lucide-react";

const VIEWS: { mode: CanvasViewMode; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { mode: "flow", label: "Flow", icon: Workflow },
  { mode: "error", label: "Errors", icon: AlertTriangle },
  { mode: "data", label: "Data flow", icon: GitBranch },
  { mode: "simulate", label: "Simulate", icon: Play },
];

export function Toolbar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const yaml = useVibeStore((s) => s.yaml);
  const viewMode = useVibeStore((s) => s.viewMode);
  const setViewMode = useVibeStore((s) => s.setViewMode);
  const loadExample = useVibeStore((s) => s.loadExample);
  const setYaml = useVibeStore((s) => s.setYaml);
  const undo = useVibeStore((s) => s.undo);
  const redo = useVibeStore((s) => s.redo);
  const past = useVibeStore((s) => s.history.past.length);
  const future = useVibeStore((s) => s.history.future.length);

  const onExport = () => {
    const blob = new Blob([yaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vibe.yml";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(setYaml);
  };

  return (
    <header className="h-12 px-3 flex items-center gap-3 bg-ink-800 border-b border-ink-600">
      {/* Brand */}
      <div className="flex items-baseline gap-1.5 mr-2">
        <span className="brand-mark text-[22px] text-amber leading-none">Vibe</span>
        <span className="brand-mark text-[22px] text-ink-50 leading-none">Graph</span>
        <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-ink-300 font-mono">
          alpha
        </span>
      </div>

      {/* Example picker */}
      <select
        onChange={(e) => loadExample(e.target.value)}
        className="h-8 px-2 text-[13px] bg-ink-700 border border-ink-600 rounded text-ink-50 focus:outline-amber"
        defaultValue=""
      >
        <option value="" disabled>
          Load example…
        </option>
        {Object.values(EXAMPLE_VIBES).map((v) => (
          <option key={v.key} value={v.key}>
            {v.title}
            {v.badge ? ` · ${v.badge}` : ""}
          </option>
        ))}
      </select>

      <div className="w-px h-5 bg-ink-600" />

      {/* View modes */}
      <div className="flex items-center gap-0.5 bg-ink-700 border border-ink-600 rounded p-0.5">
        {VIEWS.map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`h-7 px-2.5 flex items-center gap-1.5 text-[12px] font-medium rounded-sm transition-all ${
              viewMode === mode
                ? "bg-amber text-ink-900 shadow-[0_1px_3px_rgba(232,163,61,0.4)]"
                : "text-ink-200 hover:bg-ink-600 hover:text-ink-50"
            }`}
            title={`Switch to ${label} view`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" onClick={undo} disabled={past === 0} title="Undo (Cmd+Z)">
          <Undo2 size={13} />
        </Button>
        <Button size="sm" onClick={redo} disabled={future === 0} title="Redo (Cmd+Shift+Z)">
          <Redo2 size={13} />
        </Button>
        <div className="w-px h-5 bg-ink-600" />
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          <Upload size={13} /> Import
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".yml,.yaml"
          className="hidden"
          onChange={onImport}
        />
        <Button size="sm" onClick={onExport}>
          <Download size={13} /> Export
        </Button>
        <Button size="sm" variant="primary" onClick={onOpenPalette}>
          <Command size={13} /> Command
          <span className="kbd ml-1">⌘K</span>
        </Button>
      </div>
    </header>
  );
}

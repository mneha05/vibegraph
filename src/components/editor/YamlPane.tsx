"use client";
import { useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useVibeStore } from "@/lib/store/vibeStore";
import { FileCode2 } from "lucide-react";

/**
 * YamlPane — Monaco-backed YAML editor wired into the SyncEngine.
 *
 * Why Monaco over a plain textarea (which the reference editor uses):
 *   - syntax highlighting (free, but expected)
 *   - bracket matching, multi-cursor, find/replace, vim mode if anyone wants
 *   - gutter markers for parse errors and validation issues (the killer
 *     feature — squiggle under the YAML token that's broken)
 *   - cursor preservation across re-emits (Monaco preserves it; textarea
 *     resets, which is what makes Charan's editor feel jumpy)
 */
export function YamlPane() {
  const yaml = useVibeStore((s) => s.yaml);
  const setYaml = useVibeStore((s) => s.setYaml);
  const issues = useVibeStore((s) => s.issues);
  const parseError = useVibeStore((s) => s.parseError);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const lastEmitted = useRef<string>(yaml);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    // Tell Monaco our theme — same warm-dark palette as the rest of the app.
    monaco.editor.defineTheme("vibegraph-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "string.yaml", foreground: "F2C078" },
        { token: "type.yaml", foreground: "7BD7E4" },
        { token: "key.yaml", foreground: "F2EBDC", fontStyle: "bold" },
        { token: "comment.yaml", foreground: "534B3D", fontStyle: "italic" },
        { token: "number.yaml", foreground: "8FBC6E" },
      ],
      colors: {
        "editor.background": "#11100C",
        "editor.foreground": "#F2EBDC",
        "editorLineNumber.foreground": "#3A3429",
        "editorLineNumber.activeForeground": "#B5781E",
        "editor.lineHighlightBackground": "#1A1611",
        "editorGutter.background": "#11100C",
        "editorIndentGuide.background": "#1F1B17",
        "editor.selectionBackground": "#3A342966",
      },
    });
    monaco.editor.setTheme("vibegraph-dark");
  };

  // Push validation issues into Monaco's marker model so the gutter shows them.
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    const markers: import("monaco-editor").editor.IMarkerData[] = [];

    if (parseError) {
      markers.push({
        severity: monacoRef.current.MarkerSeverity.Error,
        message: parseError.message,
        startLineNumber: parseError.line ?? 1,
        startColumn: parseError.column ?? 1,
        endLineNumber: parseError.line ?? 1,
        endColumn: (parseError.column ?? 1) + 1,
      });
    }

    for (const issue of issues) {
      // Best-effort: anchor on the YAML line whose text contains the path's
      // last segment. Not perfect, but it gets you to the right neighborhood.
      const line = locatePath(model, issue.path) ?? 1;
      markers.push({
        severity:
          issue.severity === "error"
            ? monacoRef.current.MarkerSeverity.Error
            : issue.severity === "warning"
            ? monacoRef.current.MarkerSeverity.Warning
            : monacoRef.current.MarkerSeverity.Info,
        message: issue.message + (issue.hint ? `\n→ ${issue.hint}` : ""),
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: model.getLineLength(line) + 1,
      });
    }

    monacoRef.current.editor.setModelMarkers(model, "vibegraph", markers);
  }, [issues, parseError]);

  return (
    <div className="flex flex-col bg-ink-800 border-r border-ink-600 min-w-0">
      <header className="h-9 px-3 flex items-center justify-between border-b border-ink-600 bg-ink-800">
        <div className="flex items-center gap-2 text-[12px] text-ink-200">
          <FileCode2 size={13} className="text-amber" />
          <span className="font-mono">vibe.yml</span>
          {parseError && (
            <span className="ml-2 text-[11px] text-rose font-mono">parse error · line {parseError.line ?? "?"}</span>
          )}
        </div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-ink-300 font-mono">
          source of truth
        </div>
      </header>
      <div className="flex-1 min-h-0">
        <Editor
          value={yaml}
          defaultLanguage="yaml"
          onChange={(v) => {
            // Skip echo back to ourselves.
            if (v === undefined || v === lastEmitted.current) return;
            lastEmitted.current = v;
            setYaml(v);
          }}
          onMount={onMount}
          theme="vibegraph-dark"
          options={{
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: 13,
            lineHeight: 20,
            tabSize: 2,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            renderLineHighlight: "line",
            smoothScrolling: true,
            cursorBlinking: "smooth",
            padding: { top: 12, bottom: 12 },
            wordWrap: "on",
            wrappingStrategy: "advanced",
            renderWhitespace: "none",
            guides: { indentation: true, bracketPairs: false },
          }}
        />
      </div>
    </div>
  );
}

/**
 * Cheap path → line resolver. Walks the model line by line looking for the
 * last `key:` segment of the issue path. Good enough for surfacing markers;
 * a YAML CST would be more precise but that's a future polish.
 */
function locatePath(model: import("monaco-editor").editor.ITextModel, path?: string): number | null {
  if (!path) return null;
  const segs = path.split(/[.[]/).map((s) => s.replace(/]/g, ""));
  const last = segs[segs.length - 1];
  if (!last) return null;
  const re = new RegExp(`(^|[\\s-])${last}\\s*:`);
  for (let i = 1; i <= model.getLineCount(); i++) {
    if (re.test(model.getLineContent(i))) return i;
  }
  return null;
}

"use client";
import { useMemo, useState } from "react";
import { useVibeStore, selectNode as findNode } from "@/lib/store/vibeStore";
import { analyzeScope } from "@/lib/vibe/scope";
import { STEP_TEMPLATES } from "@/lib/vibe/templates";
import {
  CircleAlert,
  TriangleAlert,
  Info,
  Variable,
  PenLine,
  X,
  Box,
  GitFork,
  Repeat,
  Network,
  Import,
  Lock,
  Unlock,
  Plus,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  Settings2,
} from "lucide-react";
import type { VibeNode, StepNode } from "@/lib/vibe/schema";

type Tab = "inspect" | "variables" | "issues" | "workflow";
type InputMode = "kv" | "json";

/**
 * InspectorPane — four tabs:
 *
 *   - workflow:  edit the top-level Vibe metadata (id, name, description)
 *   - inspect:   selected node's full property editor with structural actions
 *   - variables: scope chips — click to highlight readers/writers on canvas
 *   - issues:    validation findings — click to jump to the offending node
 *
 * Editing is gated behind a global lock (matches the reference editor's
 * "unlock to edit" affordance) so accidental cursor presses on the canvas
 * don't mutate a Vibe that's open for reading.
 */
export function InspectorPane() {
  const [tab, setTab] = useState<Tab>("inspect");
  const issues = useVibeStore((s) => s.issues);
  const selectedNodeId = useVibeStore((s) => s.selectedNodeId);

  // Auto-switch to Workflow tab when nothing is selected — feels natural
  // because the workflow itself is "the thing being edited".
  if (tab === "inspect" && !selectedNodeId) {
    return (
      <aside className="flex flex-col bg-ink-800 border-l border-ink-600 min-w-0">
        <Tabs tab="workflow" setTab={setTab} issues={issues} />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <WorkflowTab />
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col bg-ink-800 border-l border-ink-600 min-w-0">
      <Tabs tab={tab} setTab={setTab} issues={issues} />
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "workflow" && <WorkflowTab />}
        {tab === "inspect" && <InspectTab />}
        {tab === "variables" && <VariablesTab />}
        {tab === "issues" && <IssuesTab />}
      </div>
    </aside>
  );
}

function Tabs({
  tab,
  setTab,
  issues,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  issues: import("@/lib/vibe/schema").ValidationIssue[];
}) {
  const counts = useMemo(
    () => ({
      error: issues.filter((i) => i.severity === "error").length,
    }),
    [issues],
  );
  return (
    <header className="h-9 px-1 flex items-center gap-0.5 border-b border-ink-600 bg-ink-800">
      {(
        [
          { k: "workflow" as const, label: "Workflow", icon: Settings2 },
          { k: "inspect" as const, label: "Inspect", icon: PenLine },
          { k: "variables" as const, label: "Vars", icon: Variable },
          {
            k: "issues" as const,
            label: `Issues${issues.length ? ` (${issues.length})` : ""}`,
            icon: CircleAlert,
          },
        ] as const
      ).map(({ k, label, icon: I }) => (
        <button
          key={k}
          onClick={() => setTab(k)}
          className={`h-7 px-2 flex items-center gap-1.5 text-[12px] rounded-sm transition-colors ${
            tab === k ? "bg-ink-700 text-amber" : "text-ink-200 hover:text-ink-50"
          }`}
        >
          <I size={11} />
          {label}
          {k === "issues" && counts.error > 0 && (
            <span className="ml-0.5 text-rose">●</span>
          )}
        </button>
      ))}
    </header>
  );
}

function WorkflowTab() {
  const vibe = useVibeStore((s) => s.vibe);
  const update = useVibeStore((s) => s.updateWorkflowMeta);
  const editLocked = useVibeStore((s) => s.editLocked);
  return (
    <div className="p-3 space-y-3">
      <LockBar />
      <Field label="ID">
        <input
          disabled={editLocked}
          value={vibe.workflow.id}
          onChange={(e) => update("id", e.target.value)}
          className={inputCls + " font-mono"}
        />
      </Field>
      <Field label="Name">
        <input
          disabled={editLocked}
          value={vibe.workflow.name ?? ""}
          onChange={(e) => update("name", e.target.value)}
          className={inputCls}
        />
      </Field>
      <Field label="Description">
        <textarea
          disabled={editLocked}
          value={vibe.workflow.description ?? ""}
          rows={4}
          onChange={(e) => update("description", e.target.value)}
          className={inputCls + " h-auto py-1.5 leading-snug"}
        />
      </Field>
      <Field label="Version">
        <input
          disabled={editLocked}
          value={vibe.workflow.version ?? ""}
          onChange={(e) => update("version", e.target.value)}
          className={inputCls + " font-mono"}
        />
      </Field>
      <div className="pt-3 border-t border-ink-600 text-[11px] text-ink-300 font-mono">
        {vibe.workflow.steps.length} top-level step
        {vibe.workflow.steps.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function InspectTab() {
  const vibe = useVibeStore((s) => s.vibe);
  const selectedId = useVibeStore((s) => s.selectedNodeId);
  const updateNode = useVibeStore((s) => s.updateNode);
  const deleteNode = useVibeStore((s) => s.deleteNode);
  const insertAfter = useVibeStore((s) => s.insertStepAfter);
  const insertBefore = useVibeStore((s) => s.insertStepBefore);
  const addErrHandler = useVibeStore((s) => s.addErrorHandlerFor);
  const editLocked = useVibeStore((s) => s.editLocked);
  const [inputMode, setInputMode] = useState<InputMode>("kv");

  const node = findNode(vibe, selectedId);

  if (!node) {
    return (
      <div className="p-4 text-[12px] text-ink-300 font-mono">
        Click a node on the canvas to inspect it, or use{" "}
        <span className="kbd">⌘K</span>.
      </div>
    );
  }

  const KindIcon =
    node.kind === "if"
      ? GitFork
      : node.kind === "for_each" || node.kind === "while"
      ? Repeat
      : node.kind === "parallel"
      ? Network
      : node.kind === "import"
      ? Import
      : Box;

  return (
    <div className="p-3 space-y-3">
      <LockBar />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KindIcon size={13} className="text-amber" />
          <span className="text-[11px] uppercase tracking-[0.16em] text-ink-300 font-mono">
            {node.kind}
          </span>
        </div>
      </div>

      <Field label="ID">
        <input
          disabled={editLocked}
          value={node.id}
          onChange={(e) =>
            updateNode(node.id, { id: e.target.value } as Partial<VibeNode>)
          }
          className={inputCls + " font-mono"}
        />
        {!editLocked && (
          <div className="mt-1 text-[10px] text-ink-300 font-mono">
            ↳ renaming auto-updates every <span className="text-cyan">${`{steps.${node.id}.…}`}</span>{" "}
            reference and routing pointer in the Vibe.
          </div>
        )}
      </Field>

      <Field label="Description">
        <textarea
          disabled={editLocked}
          value={node.description ?? ""}
          onChange={(e) =>
            updateNode(node.id, {
              description: e.target.value,
            } as Partial<VibeNode>)
          }
          rows={2}
          className={inputCls + " h-auto py-1.5 leading-snug"}
        />
      </Field>

      {node.kind === "step" && (
        <>
          <Field label="Function">
            <div className="flex gap-1">
              <input
                disabled={editLocked}
                value={node.function}
                list="step-function-templates"
                onChange={(e) =>
                  updateNode(node.id, {
                    function: e.target.value,
                  } as Partial<VibeNode>)
                }
                className={inputCls + " font-mono"}
              />
              <datalist id="step-function-templates">
                {STEP_TEMPLATES.map((t) => (
                  <option key={t.function} value={t.function}>
                    {t.label}
                  </option>
                ))}
              </datalist>
              <TemplateMenu
                disabled={editLocked}
                onPick={(t) =>
                  updateNode(node.id, {
                    function: t.function,
                    input: t.input,
                  } as Partial<VibeNode>)
                }
              />
            </div>
          </Field>

          <Field label="Output variable">
            <input
              disabled={editLocked}
              value={node.output ?? ""}
              placeholder="(none)"
              onChange={(e) =>
                updateNode(node.id, {
                  output: e.target.value || undefined,
                } as Partial<VibeNode>)
              }
              className={inputCls + " font-mono"}
            />
          </Field>

          <Field
            label="Input"
            trailing={
              <div className="flex items-center gap-0.5 bg-ink-700 border border-ink-600 rounded p-0.5">
                {(["kv", "json"] as InputMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setInputMode(m)}
                    className={`h-5 px-1.5 text-[10px] rounded-sm ${
                      inputMode === m ? "bg-ink-600 text-amber" : "text-ink-200"
                    }`}
                  >
                    {m === "kv" ? "K/V" : "JSON"}
                  </button>
                ))}
              </div>
            }
          >
            {inputMode === "json" ? (
              <JsonInput
                disabled={editLocked}
                value={(node as StepNode).input ?? {}}
                onChange={(v) =>
                  updateNode(node.id, { input: v } as Partial<VibeNode>)
                }
              />
            ) : (
              <KeyValueEditor
                disabled={editLocked}
                value={(node as StepNode).input ?? {}}
                onChange={(v) =>
                  updateNode(node.id, { input: v } as Partial<VibeNode>)
                }
              />
            )}
          </Field>
        </>
      )}

      {node.kind === "if" && (
        <Field label="Condition">
          <input
            disabled={editLocked}
            value={node.condition}
            onChange={(e) =>
              updateNode(node.id, {
                condition: e.target.value,
              } as Partial<VibeNode>)
            }
            className={inputCls + " font-mono"}
          />
        </Field>
      )}

      {node.kind === "for_each" && (
        <>
          <Field label="Iterable expression">
            <input
              disabled={editLocked}
              value={node.iterable}
              onChange={(e) =>
                updateNode(node.id, {
                  iterable: e.target.value,
                } as Partial<VibeNode>)
              }
              className={inputCls + " font-mono"}
            />
          </Field>
          <Field label="Item variable">
            <input
              disabled={editLocked}
              value={node.item}
              onChange={(e) =>
                updateNode(node.id, {
                  item: e.target.value,
                } as Partial<VibeNode>)
              }
              className={inputCls + " font-mono"}
            />
          </Field>
          <Field label="Index variable (optional)">
            <input
              disabled={editLocked}
              value={node.index ?? ""}
              onChange={(e) =>
                updateNode(node.id, {
                  index: e.target.value || undefined,
                } as Partial<VibeNode>)
              }
              className={inputCls + " font-mono"}
            />
          </Field>
        </>
      )}

      {node.kind === "import" && (
        <Field label="Source">
          <input
            disabled={editLocked}
            value={node.source}
            onChange={(e) =>
              updateNode(node.id, {
                source: e.target.value,
              } as Partial<VibeNode>)
            }
            className={inputCls + " font-mono"}
          />
        </Field>
      )}

      <div className="pt-3 border-t border-ink-600">
        <div className="text-[10px] uppercase tracking-[0.16em] text-ink-300 font-mono mb-2">
          flow control
        </div>
        <Field label="Next step ID">
          <input
            disabled={editLocked}
            value={node.next_step_id ?? ""}
            placeholder="(fall through)"
            onChange={(e) =>
              updateNode(node.id, {
                next_step_id: e.target.value || undefined,
              } as Partial<VibeNode>)
            }
            className={inputCls + " font-mono"}
          />
        </Field>
        <Field label="On error step ID">
          <input
            disabled={editLocked}
            value={node.on_error_step_id ?? ""}
            placeholder="(none)"
            onChange={(e) =>
              updateNode(node.id, {
                on_error_step_id: e.target.value || undefined,
              } as Partial<VibeNode>)
            }
            className={inputCls + " font-mono"}
          />
        </Field>
        <Field label="Error message">
          <input
            disabled={editLocked}
            value={node.error_message ?? ""}
            placeholder="(none)"
            onChange={(e) =>
              updateNode(node.id, {
                error_message: e.target.value || undefined,
              } as Partial<VibeNode>)
            }
            className={inputCls}
          />
        </Field>
      </div>

      <div className="pt-3 border-t border-ink-600 space-y-1">
        <div className="text-[10px] uppercase tracking-[0.16em] text-ink-300 font-mono mb-2">
          actions
        </div>
        <ActionBtn
          disabled={editLocked}
          onClick={() => insertBefore(node.id)}
          icon={ChevronUp}
        >
          Insert step before
        </ActionBtn>
        <ActionBtn
          disabled={editLocked}
          onClick={() => insertAfter(node.id)}
          icon={ChevronDown}
        >
          Insert step after
        </ActionBtn>
        {!node.on_error_step_id && (
          <ActionBtn
            disabled={editLocked}
            onClick={() => addErrHandler(node.id)}
            icon={AlertOctagon}
          >
            Add error handler
          </ActionBtn>
        )}
        <ActionBtn
          disabled={editLocked}
          onClick={() => deleteNode(node.id)}
          icon={X}
          danger
        >
          Delete node
        </ActionBtn>
        {!editLocked && (
          <div className="mt-2 text-[10px] text-ink-300 font-mono leading-snug">
            ↳ deleting bridges incoming <span className="text-amber">next_step_id</span> pointers
            across this node and strips orphaned <span className="text-cyan">${`{steps.${node.id}.…}`}</span>{" "}
            references from every other step.
          </div>
        )}
      </div>
    </div>
  );
}

function VariablesTab() {
  const vibe = useVibeStore((s) => s.vibe);
  const highlighted = useVibeStore((s) => s.highlightedVar);
  const highlightVar = useVibeStore((s) => s.highlightVar);
  const scope = useMemo(() => analyzeScope(vibe), [vibe]);
  const entries = Array.from(scope.values());

  return (
    <div className="p-3">
      <div className="text-[11px] text-ink-300 mb-2">
        Click a variable or step output to highlight every reader/writer on the canvas.
      </div>
      {entries.length === 0 && (
        <div className="text-[12px] text-ink-300 font-mono">No variables in scope.</div>
      )}
      <div className="space-y-1">
        {entries.map((v) => {
          const active = highlighted === v.name;
          const kind = v.declaredAt?.kind;
          const isStepOutput = kind === "step" || kind === "step_output";
          return (
            <button
              key={v.name}
              onClick={() => highlightVar(active ? null : v.name)}
              className={`w-full text-left px-2 py-1.5 rounded text-[12px] font-mono border ${
                active
                  ? "bg-cyan/10 text-cyan border-cyan/30"
                  : "bg-ink-700 text-ink-50 border-ink-600 hover:border-cyan/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">
                  {isStepOutput ? `\${steps.${v.name}.…}` : `$${v.name}`}
                </span>
                <span className="text-[10px] text-ink-300 shrink-0 ml-2">
                  {kind === "workflow_var" && "workflow"}
                  {kind === "for_each_item" && "for_each item"}
                  {kind === "for_each_index" && "for_each idx"}
                  {(kind === "step" || kind === "step_output") && "step output"}
                  {!kind && "undeclared"}
                </span>
              </div>
              <div className="text-[10px] text-ink-300 mt-0.5">
                {v.readers.length} read{v.readers.length === 1 ? "" : "s"} ·{" "}
                {v.writers.length} write{v.writers.length === 1 ? "" : "s"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IssuesTab() {
  const issues = useVibeStore((s) => s.issues);
  const jumpToNode = useVibeStore((s) => s.jumpToNode);

  if (issues.length === 0) {
    return (
      <div className="p-3 text-[12px] text-sage font-mono">
        ✓ Vibe is valid — no issues found.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1">
      {issues.map((i, idx) => {
        const Icon =
          i.severity === "error"
            ? CircleAlert
            : i.severity === "warning"
            ? TriangleAlert
            : Info;
        const color =
          i.severity === "error"
            ? "text-rose"
            : i.severity === "warning"
            ? "text-amber"
            : "text-cyan";
        return (
          <button
            key={idx}
            onClick={() => i.nodeId && jumpToNode(i.nodeId)}
            className="w-full text-left px-2 py-2 rounded text-[12px] bg-ink-700 border border-ink-600 hover:border-ink-500"
          >
            <div className={`flex items-start gap-1.5 ${color}`}>
              <Icon size={12} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-mono">{i.message}</div>
                {i.hint && (
                  <div className="text-ink-300 mt-1 text-[11px]">→ {i.hint}</div>
                )}
                {i.nodeId && (
                  <div className="text-[10px] text-ink-300 mt-1 font-mono">
                    node: {i.nodeId}
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function LockBar() {
  const editLocked = useVibeStore((s) => s.editLocked);
  const toggle = useVibeStore((s) => s.toggleEditLock);
  const Icon = editLocked ? Lock : Unlock;
  return (
    <button
      onClick={toggle}
      className={`w-full h-7 px-2 flex items-center gap-1.5 text-[11px] font-mono rounded border transition-colors ${
        editLocked
          ? "bg-ink-700 border-ink-600 text-ink-300 hover:text-ink-100"
          : "bg-amber/[0.08] border-amber/40 text-amber"
      }`}
    >
      <Icon size={11} />
      {editLocked ? "Locked — click to enable inline editing" : "Editing enabled"}
    </button>
  );
}

function TemplateMenu({
  disabled,
  onPick,
}: {
  disabled?: boolean;
  onPick: (t: (typeof STEP_TEMPLATES)[number]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        disabled={disabled}
        onClick={() => setOpen((x) => !x)}
        className="h-7 px-2 text-[11px] bg-ink-700 border border-ink-600 rounded text-ink-100 hover:text-amber disabled:opacity-40"
        title="Apply a step template"
      >
        <Plus size={11} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 z-30 w-[260px] panel shadow-elev p-1 max-h-[300px] overflow-y-auto"
          onMouseLeave={() => setOpen(false)}
        >
          {STEP_TEMPLATES.map((t) => (
            <button
              key={t.function}
              onClick={() => {
                onPick(t);
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1.5 rounded text-[12px] hover:bg-ink-700 group"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-amber">{t.function}</span>
                <span className="text-[10px] text-ink-300 uppercase tracking-wider">
                  {t.category}
                </span>
              </div>
              <div className="text-[11px] text-ink-200 mt-0.5 leading-snug">
                {t.description}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  icon: Icon,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number }>;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`w-full h-7 px-2 flex items-center gap-1.5 text-[12px] rounded border transition-colors disabled:opacity-30 ${
        danger
          ? "border-rose/30 text-rose hover:bg-rose/10"
          : "border-ink-600 text-ink-100 hover:border-ink-500 hover:text-amber"
      }`}
    >
      <Icon size={12} />
      {children}
    </button>
  );
}

function Field({
  label,
  children,
  trailing,
}: {
  label: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.16em] text-ink-300 font-mono">
          {label}
        </span>
        {trailing}
      </div>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full h-7 px-2 text-[12px] bg-ink-700 border border-ink-600 rounded text-ink-50 focus:outline-amber disabled:opacity-50 disabled:cursor-not-allowed";

function JsonInput({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <textarea
        disabled={disabled}
        value={text}
        rows={6}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setError(null);
          } catch (err) {
            setError(err instanceof Error ? err.message : "JSON parse error");
          }
        }}
        className="w-full p-2 text-[12px] font-mono bg-ink-700 border border-ink-600 rounded text-ink-50 focus:outline-amber disabled:opacity-50"
      />
      {error && <div className="mt-1 text-[11px] text-rose font-mono">{error}</div>}
    </div>
  );
}

/**
 * Key/Value editor — flat editing for top-level input fields. Nested objects
 * fall back to a JSON sub-editor inline. Matches the reference editor's K/V
 * pattern but with a small ergonomic edge: typing in a value field also
 * inferences JSON when the value parses cleanly, so booleans/numbers/objects
 * survive their round-trip instead of becoming strings.
 */
function KeyValueEditor({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const entries = Object.entries(value);

  const setKey = (idx: number, newKey: string) => {
    const next: Record<string, unknown> = {};
    entries.forEach(([k, v], i) => {
      next[i === idx ? newKey : k] = v;
    });
    onChange(next);
  };
  const setValue = (idx: number, raw: string) => {
    const next: Record<string, unknown> = {};
    entries.forEach(([k, v], i) => {
      if (i === idx) {
        // Best-effort: parse JSON for booleans/numbers/objects/arrays;
        // fall back to the raw string for everything else (refs etc).
        let parsed: unknown = raw;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
        next[k] = parsed;
      } else {
        next[k] = v;
      }
    });
    onChange(next);
  };
  const remove = (idx: number) => {
    const next: Record<string, unknown> = {};
    entries.forEach(([k, v], i) => {
      if (i !== idx) next[k] = v;
    });
    onChange(next);
  };
  const add = () => onChange({ ...value, "": "" });

  if (entries.length === 0) {
    return (
      <div>
        <div className="text-[11px] text-ink-300 font-mono italic px-2 py-3 bg-ink-700/60 border border-dashed border-ink-600 rounded">
          empty — click +Add to add a field
        </div>
        <button
          disabled={disabled}
          onClick={add}
          className="mt-1 h-6 px-2 text-[11px] border border-dashed border-ink-600 rounded text-ink-200 hover:text-amber hover:border-amber/40 disabled:opacity-40"
        >
          + add field
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {entries.map(([k, v], i) => {
        const valueText =
          typeof v === "string" ? v : v === undefined ? "" : JSON.stringify(v);
        const isComplex = typeof v === "object" && v !== null;
        return (
          <div key={i} className="flex gap-1 items-start">
            <input
              disabled={disabled}
              value={k}
              onChange={(e) => setKey(i, e.target.value)}
              className="h-6 w-24 px-1.5 text-[11px] font-mono bg-ink-700 border border-ink-600 rounded text-ink-100 shrink-0 focus:outline-amber"
            />
            {isComplex ? (
              <textarea
                disabled={disabled}
                value={valueText}
                rows={3}
                onChange={(e) => setValue(i, e.target.value)}
                className="flex-1 min-w-0 px-1.5 py-1 text-[11px] font-mono bg-ink-700 border border-ink-600 rounded text-ink-100 focus:outline-amber"
              />
            ) : (
              <input
                disabled={disabled}
                value={valueText}
                onChange={(e) => setValue(i, e.target.value)}
                className="flex-1 min-w-0 h-6 px-1.5 text-[11px] font-mono bg-ink-700 border border-ink-600 rounded text-ink-100 focus:outline-amber"
              />
            )}
            <button
              disabled={disabled}
              onClick={() => remove(i)}
              className="h-6 w-6 flex items-center justify-center text-ink-300 hover:text-rose disabled:opacity-30"
              title="remove"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
      <button
        disabled={disabled}
        onClick={add}
        className="h-6 px-2 text-[11px] border border-dashed border-ink-600 rounded text-ink-200 hover:text-amber hover:border-amber/40 disabled:opacity-40"
      >
        + add field
      </button>
    </div>
  );
}

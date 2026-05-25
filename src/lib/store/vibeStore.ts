import { create } from "zustand";
import { SyncEngine } from "@/lib/yaml/sync";
import { validateVibe } from "@/lib/vibe/validator";
import type { Vibe, VibeNode, StepNode, ValidationIssue } from "@/lib/vibe/schema";
import { EXAMPLE_VIBES, DEFAULT_EXAMPLE_KEY } from "@/examples";
import { walk } from "@/lib/vibe/walk";
import { renameStepReferences, stripStepReferences } from "@/lib/vibe/references";
import { simulate } from "@/lib/vibe/simulator";

/**
 * useVibeStore — global app state, sole writer to the SyncEngine.
 *
 * The interesting bits are the structural mutations:
 *
 *   - updateNode rewires every `${steps.OLD.…}` reference when an id changes,
 *     mirroring the reference editor's killer "rename → propagate" UX.
 *
 *   - deleteNode bridges incoming `next_step_id` pointers across the deleted
 *     step (so the flow doesn't break), and strips any input fields that
 *     referenced the now-gone step.
 *
 *   - addErrorHandlerFor / insertStepAfter / insertStepBefore / addStandaloneStep
 *     give the canvas one-click affordances for the most common structural
 *     edits, matching the reference editor's "add" toolbar.
 *
 * Anything more complex is just an edit in Monaco — the YAML is the source
 * of truth and the sync engine catches everything else.
 */

const initialYaml = EXAMPLE_VIBES[DEFAULT_EXAMPLE_KEY].yaml;
const engine = new SyncEngine(initialYaml, validateVibe);

export type CanvasViewMode = "flow" | "error" | "data" | "simulate";

interface History {
  past: string[];
  future: string[];
}

interface VibeStore {
  yaml: string;
  vibe: Vibe;
  issues: ValidationIssue[];
  parseError?: { message: string; line?: number; column?: number };
  selectedNodeId: string | null;
  highlightedVar: string | null;
  viewMode: CanvasViewMode;
  history: History;
  editLocked: boolean;
  /** Monotonically increasing counter the canvas watches to auto-pan. */
  centerOnNode: { id: string | null; tick: number };
  /** Simulator state — frames + cursor + playback status. */
  simulation: SimulationState;

  setYaml: (yaml: string) => void;
  setVibe: (vibe: Vibe) => void;
  loadExample: (key: string) => void;
  selectNode: (id: string | null) => void;
  jumpToNode: (id: string) => void;
  highlightVar: (name: string | null) => void;
  setViewMode: (mode: CanvasViewMode) => void;
  toggleEditLock: () => void;
  undo: () => void;
  redo: () => void;

  // Node-level mutations
  updateNode: (id: string, patch: Partial<VibeNode>) => void;
  deleteNode: (id: string) => void;
  addStandaloneStep: () => void;
  insertStepAfter: (afterId: string) => void;
  insertStepBefore: (beforeId: string) => void;
  insertStepOnEdge: (sourceId: string, targetId: string) => void;
  addErrorHandlerFor: (sourceId: string) => void;

  // Canvas-driven edge mutations
  addEdge: (sourceId: string, targetId: string) => void;
  deleteEdge: (sourceId: string, targetId: string) => void;

  // Workflow metadata mutations
  updateWorkflowMeta: (field: "id" | "name" | "description" | "version", value: string) => void;

  // Simulator controls
  simulatePlay: () => void;
  simulatePause: () => void;
  simulateStep: () => void;
  simulateReset: () => void;
  simulateGoto: (frameIndex: number) => void;
}

export interface SimulationState {
  status: "idle" | "playing" | "paused" | "done";
  /** Current frame index. -1 means "not yet started". */
  cursor: number;
  /** All frames computed up-front from the current Vibe. */
  frames: import("@/lib/vibe/simulator").SimulationFrame[];
  /** Set of node ids the simulation has already visited. */
  visited: Set<string>;
  /** Last computed-for vibe — used to invalidate the trace when YAML changes. */
  computedForYaml: string;
}

export const useVibeStore = create<VibeStore>((set, get) => {
  // Playback timer lives outside React — it's a module-local variable so the
  // setInterval handle survives store mutations.
  let playbackTimer: ReturnType<typeof setInterval> | null = null;
  const stopTimer = () => {
    if (playbackTimer) {
      clearInterval(playbackTimer);
      playbackTimer = null;
    }
  };

  // Recompute the simulation trace whenever the underlying YAML changes.
  // We reset cursor + visited and keep status idle so playback doesn't try
  // to advance through stale frames.
  engine.subscribe((s) => {
    const prev = get();
    const yamlChanged = prev.yaml !== s.yaml;
    set({
      yaml: s.yaml,
      vibe: s.vibe,
      issues: s.issues,
      parseError: s.parseError,
      ...(yamlChanged && {
        simulation: {
          status: "idle",
          cursor: -1,
          frames: [],
          visited: new Set<string>(),
          computedForYaml: "",
        },
      }),
    });
    if (yamlChanged) stopTimer();
  });

  const initial = engine.getState();

  const pushHistory = (yaml: string) => {
    const h = get().history;
    set({ history: { past: [...h.past.slice(-49), yaml], future: [] } });
  };

  // Lazy-compute the trace the first time it's needed.
  const ensureFrames = () => {
    const s = get();
    if (s.simulation.computedForYaml === s.yaml && s.simulation.frames.length > 0) {
      return s.simulation.frames;
    }
    const result = simulate(s.vibe);
    set({
      simulation: {
        ...s.simulation,
        frames: result.frames,
        computedForYaml: s.yaml,
      },
    });
    return result.frames;
  };

  return {
    yaml: initial.yaml,
    vibe: initial.vibe,
    issues: initial.issues,
    parseError: initial.parseError,
    selectedNodeId: null,
    highlightedVar: null,
    viewMode: "flow",
    history: { past: [], future: [] },
    editLocked: true,
    centerOnNode: { id: null, tick: 0 },
    simulation: {
      status: "idle",
      cursor: -1,
      frames: [],
      visited: new Set<string>(),
      computedForYaml: "",
    },

    setYaml: (yaml) => {
      pushHistory(get().yaml);
      engine.setYaml(yaml);
    },
    setVibe: (vibe) => {
      pushHistory(get().yaml);
      engine.setVibe(vibe);
    },
    loadExample: (key) => {
      const ex = EXAMPLE_VIBES[key];
      if (!ex) return;
      pushHistory(get().yaml);
      engine.load(ex.yaml);
      set({ selectedNodeId: null, highlightedVar: null });
    },
    selectNode: (id) => set({ selectedNodeId: id }),
    jumpToNode: (id) =>
      set({
        selectedNodeId: id,
        centerOnNode: { id, tick: get().centerOnNode.tick + 1 },
      }),
    highlightVar: (name) =>
      set({ highlightedVar: name, viewMode: name ? "data" : get().viewMode }),
    setViewMode: (mode) => set({ viewMode: mode }),
    toggleEditLock: () => set({ editLocked: !get().editLocked }),

    undo: () => {
      const h = get().history;
      if (h.past.length === 0) return;
      const previous = h.past[h.past.length - 1];
      set({
        history: {
          past: h.past.slice(0, -1),
          future: [get().yaml, ...h.future].slice(0, 50),
        },
      });
      engine.load(previous);
    },
    redo: () => {
      const h = get().history;
      if (h.future.length === 0) return;
      const next = h.future[0];
      set({
        history: {
          past: [...h.past, get().yaml].slice(-50),
          future: h.future.slice(1),
        },
      });
      engine.load(next);
    },

    updateNode: (id, patch) => {
      const vibe = get().vibe;
      // Detect an id change so we can fan-out the rename across every
      // ${steps.OLD.…} reference in the workflow.
      const isIdChange = "id" in patch && patch.id && patch.id !== id;
      const newVibe = mutateNode(vibe, id, (n) => ({ ...n, ...patch }) as VibeNode);
      let finalVibe = newVibe;
      if (isIdChange) {
        finalVibe = {
          workflow: {
            ...newVibe.workflow,
            // Also rewrite next_step_id / on_error_step_id pointers to the old id.
            steps: rewriteRoutingPointers(newVibe.workflow.steps, id, patch.id as string),
          },
        };
        finalVibe = renameStepReferencesInVibe(finalVibe, id, patch.id as string);
        if (get().selectedNodeId === id) {
          set({ selectedNodeId: patch.id as string });
        }
      }
      get().setVibe(finalVibe);
    },

    deleteNode: (id) => {
      const vibe = get().vibe;
      // 1. Find the deleted node's next_step_id so we can bridge incoming pointers.
      let bridgedNext: string | undefined;
      walk(vibe.workflow.steps, (n) => {
        if (n.id === id) bridgedNext = n.next_step_id;
      });
      // 2. Remove the node.
      let nextVibe: Vibe = {
        workflow: { ...vibe.workflow, steps: removeNode(vibe.workflow.steps, id) },
      };
      // 3. Rewrite any pointer that pointed at the deleted node, either bridging
      //    or clearing it. Mirrors Charan's "delete a step → flow stays valid" UX.
      nextVibe = {
        workflow: {
          ...nextVibe.workflow,
          steps: bridgePointers(nextVibe.workflow.steps, id, bridgedNext),
        },
      };
      // 4. Strip every `${steps.DELETED.…}` reference from remaining inputs.
      nextVibe = {
        workflow: {
          ...nextVibe.workflow,
          steps: nextVibe.workflow.steps.map((s) => stripRefsFromNode(s, id)),
        },
      };
      get().setVibe(nextVibe);
      if (get().selectedNodeId === id) set({ selectedNodeId: null });
    },

    addStandaloneStep: () => {
      const vibe = get().vibe;
      const id = nextStepId(vibe.workflow.steps);
      const step: StepNode = {
        kind: "step",
        id,
        function: "setVariable",
        input: { variable_name: id, value: "" },
      };
      get().setVibe({
        workflow: { ...vibe.workflow, steps: [...vibe.workflow.steps, step] },
      });
      set({ selectedNodeId: id });
    },

    insertStepAfter: (afterId) => {
      const vibe = get().vibe;
      const id = nextStepId(vibe.workflow.steps);
      const step: StepNode = {
        kind: "step",
        id,
        function: "setVariable",
        input: { variable_name: id, value: "" },
      };
      const nextSteps = insertAfter(vibe.workflow.steps, afterId, step);
      // Wire the new step into the routing — predecessor's next becomes us,
      // our next becomes the old next.
      const rewired = wireInsertion(nextSteps, afterId, id);
      get().setVibe({ workflow: { ...vibe.workflow, steps: rewired } });
      set({ selectedNodeId: id });
    },

    insertStepBefore: (beforeId) => {
      const vibe = get().vibe;
      const id = nextStepId(vibe.workflow.steps);
      const step: StepNode = {
        kind: "step",
        id,
        function: "setVariable",
        input: { variable_name: id, value: "" },
        next_step_id: beforeId,
      };
      const nextSteps = insertBefore(vibe.workflow.steps, beforeId, step);
      get().setVibe({ workflow: { ...vibe.workflow, steps: nextSteps } });
      set({ selectedNodeId: id });
    },

    insertStepOnEdge: (sourceId, targetId) => {
      const vibe = get().vibe;
      const id = nextStepId(vibe.workflow.steps);
      const step: StepNode = {
        kind: "step",
        id,
        function: "setVariable",
        input: { variable_name: id, value: "" },
        next_step_id: targetId,
      };
      let nextSteps = insertBefore(vibe.workflow.steps, targetId, step);
      nextSteps = mutateNodeRaw(nextSteps, sourceId, (n) => {
        if (n.next_step_id === targetId) return { ...n, next_step_id: id };
        if (n.on_error_step_id === targetId) return { ...n, on_error_step_id: id };
        return n;
      });
      get().setVibe({ workflow: { ...vibe.workflow, steps: nextSteps } });
      set({ selectedNodeId: id });
    },

    addErrorHandlerFor: (sourceId) => {
      const vibe = get().vibe;
      const base = `${sourceId}_error_handler`;
      const id = uniqueId(base, collectIds(vibe.workflow.steps));
      const handler: StepNode = {
        kind: "step",
        id,
        function: "sendResponse",
        input: {
          type: "fixed",
          message: `Something went wrong while running ${sourceId}.`,
        },
        description: `Handles errors from ${sourceId} and provides a fallback response.`,
      };
      // Wire the source step's on_error_step_id to the new handler.
      const nextSteps = mutateNodeRaw(vibe.workflow.steps, sourceId, (n) => ({
        ...n,
        on_error_step_id: id,
        error_message:
          n.error_message ||
          `Error while running ${sourceId}. Please review the failed step output.`,
      }));
      const inserted = insertAfter(nextSteps, sourceId, handler);
      get().setVibe({ workflow: { ...vibe.workflow, steps: inserted } });
      set({ selectedNodeId: id });
    },

    addEdge: (sourceId, targetId) => {
      const vibe = get().vibe;
      // Set source.next_step_id = target. Doesn't touch on_error.
      const nextSteps = mutateNodeRaw(vibe.workflow.steps, sourceId, (n) => ({
        ...n,
        next_step_id: targetId,
      }));
      get().setVibe({ workflow: { ...vibe.workflow, steps: nextSteps } });
    },

    deleteEdge: (sourceId, targetId) => {
      const vibe = get().vibe;
      const nextSteps = mutateNodeRaw(vibe.workflow.steps, sourceId, (n) => {
        const u: VibeNode = { ...n };
        if (u.next_step_id === targetId) u.next_step_id = undefined;
        if (u.on_error_step_id === targetId) u.on_error_step_id = undefined;
        return u;
      });
      get().setVibe({ workflow: { ...vibe.workflow, steps: nextSteps } });
    },

    updateWorkflowMeta: (field, value) => {
      const vibe = get().vibe;
      get().setVibe({
        workflow: { ...vibe.workflow, [field]: value || undefined },
      });
    },

    simulatePlay: () => {
      const frames = ensureFrames();
      if (frames.length === 0) return;
      stopTimer();
      // If already done, snap back to start before playing.
      const s = get();
      let nextCursor = s.simulation.cursor;
      if (s.simulation.status === "done" || s.simulation.cursor >= frames.length - 1) {
        nextCursor = -1;
        set({
          simulation: { ...s.simulation, cursor: -1, visited: new Set() },
        });
      }
      set({
        simulation: { ...get().simulation, status: "playing" },
      });
      // 800ms per frame — fast enough to feel like execution, slow enough to read.
      playbackTimer = setInterval(() => {
        const cur = get();
        const frs = cur.simulation.frames;
        const next = cur.simulation.cursor + 1;
        if (next >= frs.length) {
          stopTimer();
          set({
            simulation: { ...cur.simulation, status: "done" },
          });
          return;
        }
        const f = frs[next];
        const visited = new Set(cur.simulation.visited);
        if (f.nodeId) visited.add(f.nodeId);
        set({
          simulation: {
            ...cur.simulation,
            cursor: next,
            visited,
          },
          centerOnNode: { id: f.nodeId ?? null, tick: cur.centerOnNode.tick + 1 },
        });
      }, 800);
      // Reference next/nextCursor to avoid unused-var warning.
      void nextCursor;
    },

    simulatePause: () => {
      stopTimer();
      const s = get();
      if (s.simulation.status === "playing") {
        set({ simulation: { ...s.simulation, status: "paused" } });
      }
    },

    simulateStep: () => {
      const frames = ensureFrames();
      if (frames.length === 0) return;
      stopTimer();
      const s = get();
      const next = s.simulation.cursor + 1;
      if (next >= frames.length) {
        set({ simulation: { ...s.simulation, status: "done" } });
        return;
      }
      const f = frames[next];
      const visited = new Set(s.simulation.visited);
      if (f.nodeId) visited.add(f.nodeId);
      set({
        simulation: {
          ...s.simulation,
          cursor: next,
          visited,
          status: next === frames.length - 1 ? "done" : "paused",
        },
        centerOnNode: { id: f.nodeId ?? null, tick: s.centerOnNode.tick + 1 },
      });
    },

    simulateReset: () => {
      stopTimer();
      const s = get();
      set({
        simulation: {
          ...s.simulation,
          status: "idle",
          cursor: -1,
          visited: new Set(),
        },
      });
    },

    simulateGoto: (frameIndex) => {
      const frames = ensureFrames();
      if (frames.length === 0) return;
      stopTimer();
      const s = get();
      const clamped = Math.max(-1, Math.min(frames.length - 1, frameIndex));
      // Rebuild visited up to the clamped cursor for consistency.
      const visited = new Set<string>();
      for (let i = 0; i <= clamped; i++) {
        const f = frames[i];
        if (f.nodeId) visited.add(f.nodeId);
      }
      set({
        simulation: {
          ...s.simulation,
          cursor: clamped,
          visited,
          status: clamped === frames.length - 1 ? "done" : "paused",
        },
        centerOnNode: {
          id: clamped >= 0 ? frames[clamped].nodeId ?? null : null,
          tick: s.centerOnNode.tick + 1,
        },
      });
    },
  };
});

// ============================================================
// Pure helpers — exported so tests can exercise them directly.
// ============================================================

/** Apply a transformation to a single node anywhere in the tree. */
function mutateNode(
  vibe: Vibe,
  id: string,
  transform: (n: VibeNode) => VibeNode,
): Vibe {
  return {
    workflow: {
      ...vibe.workflow,
      steps: mutateNodeRaw(vibe.workflow.steps, id, transform),
    },
  };
}

function mutateNodeRaw(
  list: VibeNode[],
  id: string,
  transform: (n: VibeNode) => VibeNode,
): VibeNode[] {
  return list.map((node) => {
    if (node.id === id) return transform(node);
    if (node.kind === "if") {
      return {
        ...node,
        then: mutateNodeRaw(node.then, id, transform),
        else: node.else ? mutateNodeRaw(node.else, id, transform) : undefined,
      };
    }
    if (node.kind === "for_each" || node.kind === "while") {
      return { ...node, body: mutateNodeRaw(node.body, id, transform) };
    }
    if (node.kind === "parallel") {
      return { ...node, branches: node.branches.map((b) => mutateNodeRaw(b, id, transform)) };
    }
    return node;
  });
}

function removeNode(list: VibeNode[], id: string): VibeNode[] {
  return list
    .filter((n) => n.id !== id)
    .map((n) => {
      if (n.kind === "if") {
        return {
          ...n,
          then: removeNode(n.then, id),
          else: n.else ? removeNode(n.else, id) : undefined,
        };
      }
      if (n.kind === "for_each" || n.kind === "while") {
        return { ...n, body: removeNode(n.body, id) };
      }
      if (n.kind === "parallel") {
        return { ...n, branches: n.branches.map((b) => removeNode(b, id)) };
      }
      return n;
    });
}

function insertAfter(list: VibeNode[], afterId: string, node: VibeNode): VibeNode[] {
  const out: VibeNode[] = [];
  let inserted = false;
  for (const n of list) {
    out.push(n);
    if (n.id === afterId && !inserted) {
      out.push(node);
      inserted = true;
    }
  }
  if (inserted) return out;
  return list.map((n) => {
    if (n.kind === "if") {
      return {
        ...n,
        then: insertAfter(n.then, afterId, node),
        else: n.else ? insertAfter(n.else, afterId, node) : undefined,
      };
    }
    if (n.kind === "for_each" || n.kind === "while") {
      return { ...n, body: insertAfter(n.body, afterId, node) };
    }
    if (n.kind === "parallel") {
      return { ...n, branches: n.branches.map((b) => insertAfter(b, afterId, node)) };
    }
    return n;
  });
}

function insertBefore(list: VibeNode[], beforeId: string, node: VibeNode): VibeNode[] {
  const out: VibeNode[] = [];
  let inserted = false;
  for (const n of list) {
    if (n.id === beforeId && !inserted) {
      out.push(node);
      inserted = true;
    }
    out.push(n);
  }
  if (inserted) return out;
  return list.map((n) => {
    if (n.kind === "if") {
      return {
        ...n,
        then: insertBefore(n.then, beforeId, node),
        else: n.else ? insertBefore(n.else, beforeId, node) : undefined,
      };
    }
    if (n.kind === "for_each" || n.kind === "while") {
      return { ...n, body: insertBefore(n.body, beforeId, node) };
    }
    if (n.kind === "parallel") {
      return { ...n, branches: n.branches.map((b) => insertBefore(b, beforeId, node)) };
    }
    return n;
  });
}

/**
 * Rewire routing — any step whose next_step_id pointed at oldId now points at
 * newId; same for on_error_step_id. Used when a step is renamed.
 */
function rewriteRoutingPointers(list: VibeNode[], oldId: string, newId: string): VibeNode[] {
  return list.map((n) => {
    const updated: VibeNode = { ...n };
    if (updated.next_step_id === oldId) updated.next_step_id = newId;
    if (updated.on_error_step_id === oldId) updated.on_error_step_id = newId;
    if (updated.kind === "if") {
      return {
        ...updated,
        then: rewriteRoutingPointers(updated.then, oldId, newId),
        else: updated.else ? rewriteRoutingPointers(updated.else, oldId, newId) : undefined,
      };
    }
    if (updated.kind === "for_each" || updated.kind === "while") {
      return { ...updated, body: rewriteRoutingPointers(updated.body, oldId, newId) };
    }
    if (updated.kind === "parallel") {
      return {
        ...updated,
        branches: updated.branches.map((b) => rewriteRoutingPointers(b, oldId, newId)),
      };
    }
    return updated;
  });
}

/** Bridge pointers across a deleted node, OR clear them if no replacement exists. */
function bridgePointers(
  list: VibeNode[],
  deletedId: string,
  bridgedNext: string | undefined,
): VibeNode[] {
  return list.map((n) => {
    const updated: VibeNode = { ...n };
    if (updated.next_step_id === deletedId) {
      // Avoid creating self-loops.
      updated.next_step_id = bridgedNext && bridgedNext !== updated.id ? bridgedNext : undefined;
    }
    if (updated.on_error_step_id === deletedId) {
      updated.on_error_step_id = undefined;
    }
    if (updated.kind === "if") {
      return {
        ...updated,
        then: bridgePointers(updated.then, deletedId, bridgedNext),
        else: updated.else ? bridgePointers(updated.else, deletedId, bridgedNext) : undefined,
      };
    }
    if (updated.kind === "for_each" || updated.kind === "while") {
      return { ...updated, body: bridgePointers(updated.body, deletedId, bridgedNext) };
    }
    if (updated.kind === "parallel") {
      return {
        ...updated,
        branches: updated.branches.map((b) => bridgePointers(b, deletedId, bridgedNext)),
      };
    }
    return updated;
  });
}

/** Strip every ${steps.DELETED.…} reference from a node's input recursively. */
function stripRefsFromNode(node: VibeNode, deletedId: string): VibeNode {
  let next = node;
  if (next.kind === "step" && next.input) {
    const cleaned = stripStepReferences(next.input, deletedId) as
      | Record<string, unknown>
      | undefined;
    next = { ...next, input: cleaned ?? {} };
  }
  if (next.kind === "if") {
    return {
      ...next,
      then: next.then.map((c) => stripRefsFromNode(c, deletedId)),
      else: next.else ? next.else.map((c) => stripRefsFromNode(c, deletedId)) : undefined,
    };
  }
  if (next.kind === "for_each" || next.kind === "while") {
    return { ...next, body: next.body.map((c) => stripRefsFromNode(c, deletedId)) };
  }
  if (next.kind === "parallel") {
    return {
      ...next,
      branches: next.branches.map((b) => b.map((c) => stripRefsFromNode(c, deletedId))),
    };
  }
  return next;
}

/** Apply renameStepReferences across every node's input recursively. */
function renameStepReferencesInVibe(vibe: Vibe, oldId: string, newId: string): Vibe {
  const recurse = (list: VibeNode[]): VibeNode[] =>
    list.map((n) => {
      let next = n;
      if (next.kind === "step" && next.input) {
        next = {
          ...next,
          input: renameStepReferences(next.input, oldId, newId) as Record<string, unknown>,
        };
      }
      if (next.kind === "if") {
        return {
          ...next,
          then: recurse(next.then),
          else: next.else ? recurse(next.else) : undefined,
        };
      }
      if (next.kind === "for_each" || next.kind === "while") {
        return { ...next, body: recurse(next.body) };
      }
      if (next.kind === "parallel") {
        return { ...next, branches: next.branches.map(recurse) };
      }
      return next;
    });
  return { workflow: { ...vibe.workflow, steps: recurse(vibe.workflow.steps) } };
}

/** Wire a freshly-inserted step into the routing after `afterId`. */
function wireInsertion(list: VibeNode[], afterId: string, newId: string): VibeNode[] {
  // Find the inserted node's next-sibling so we can wire next properly.
  let after: VibeNode | undefined;
  let afterIdx = -1;
  let inserted: VibeNode | undefined;
  let insertedIdx = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === afterId) {
      after = list[i];
      afterIdx = i;
    }
    if (list[i].id === newId) {
      inserted = list[i];
      insertedIdx = i;
    }
  }
  if (!after || !inserted || afterIdx === -1 || insertedIdx === -1) {
    // Could be inside a container — recurse.
    return list.map((n) => {
      if (n.kind === "if") {
        return {
          ...n,
          then: wireInsertion(n.then, afterId, newId),
          else: n.else ? wireInsertion(n.else, afterId, newId) : undefined,
        };
      }
      if (n.kind === "for_each" || n.kind === "while") {
        return { ...n, body: wireInsertion(n.body, afterId, newId) };
      }
      if (n.kind === "parallel") {
        return { ...n, branches: n.branches.map((b) => wireInsertion(b, afterId, newId)) };
      }
      return n;
    });
  }
  // The inserted step's `next` becomes what `after.next` used to be.
  const insertedNext = after.next_step_id;
  const out = list.map((n) => {
    if (n.id === afterId) return { ...n, next_step_id: newId };
    if (n.id === newId && insertedNext) return { ...n, next_step_id: insertedNext };
    return n;
  });
  return out;
}

function collectIds(steps: VibeNode[]): Set<string> {
  const ids = new Set<string>();
  walk(steps, (n) => ids.add(n.id));
  return ids;
}

function nextStepId(steps: VibeNode[]): string {
  const existing = collectIds(steps);
  let i = existing.size + 1;
  while (existing.has(`new_step_${i}`)) i++;
  return `new_step_${i}`;
}

function uniqueId(base: string, existing: Set<string>): string {
  const norm =
    base.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "step";
  if (!existing.has(norm)) return norm;
  let i = 2;
  while (existing.has(`${norm}_${i}`)) i++;
  return `${norm}_${i}`;
}

/** Lookup helper — get the node by id (used by Inspector). */
export function selectNode(vibe: Vibe, id: string | null): VibeNode | null {
  if (!id) return null;
  let found: VibeNode | null = null;
  walk(vibe.workflow.steps, (n) => {
    if (n.id === id) found = n;
  });
  return found;
}

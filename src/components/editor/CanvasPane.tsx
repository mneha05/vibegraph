"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node as RFNode,
  type Edge as RFEdge,
  type Connection,
  type EdgeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { buildGraph } from "@/lib/vibe/graph";
import { applyLayout } from "@/lib/vibe/layout";
import { useVibeStore } from "@/lib/store/vibeStore";
import { StepNodeView } from "@/components/canvas/nodes/StepNodeView";
import { ConditionalNodeView } from "@/components/canvas/nodes/ConditionalNodeView";
import { LoopNodeView } from "@/components/canvas/nodes/LoopNodeView";
import { ParallelNodeView } from "@/components/canvas/nodes/ParallelNodeView";
import { ImportNodeView } from "@/components/canvas/nodes/ImportNodeView";
import { StartNodeView } from "@/components/canvas/nodes/StartNodeView";
import { FlowEdge, ErrorEdge } from "@/components/canvas/edges/edges";
import { Search, Maximize2, Minimize2, Plus, ScanSearch, Info } from "lucide-react";
import { analyzeScope, touchedBy } from "@/lib/vibe/scope";
import { SimulationToolbar } from "@/components/editor/SimulationToolbar";

const NODE_TYPES = {
  step: StepNodeView,
  conditional: ConditionalNodeView,
  loop: LoopNodeView,
  parallel: ParallelNodeView,
  import: ImportNodeView,
  start: StartNodeView,
};

const EDGE_TYPES = {
  flow: FlowEdge,
  error: ErrorEdge,
};

export function CanvasPane() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}

function Inner() {
  const vibe = useVibeStore((s) => s.vibe);
  const viewMode = useVibeStore((s) => s.viewMode);
  const selectedNodeId = useVibeStore((s) => s.selectedNodeId);
  const selectNode = useVibeStore((s) => s.selectNode);
  const highlightedVar = useVibeStore((s) => s.highlightedVar);
  const issues = useVibeStore((s) => s.issues);
  const addStandaloneStep = useVibeStore((s) => s.addStandaloneStep);
  const editLocked = useVibeStore((s) => s.editLocked);
  const addEdge = useVibeStore((s) => s.addEdge);
  const deleteEdge = useVibeStore((s) => s.deleteEdge);
  const centerOnNode = useVibeStore((s) => s.centerOnNode);
  const simulation = useVibeStore((s) => s.simulation);

  const reactFlow = useReactFlow();
  const [nodes, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<RFEdge[]>([]);
  const [search, setSearch] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const layoutTick = useRef(0);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
    }
  };
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const scope = useMemo(() => analyzeScope(vibe), [vibe]);
  const touched = useMemo(
    () => touchedBy(highlightedVar ? scope.get(highlightedVar) : undefined),
    [highlightedVar, scope],
  );

  // Layout cycle — rebuild graph + apply ELK whenever the Vibe changes.
  // Crucial bit: after async ELK completes, we trigger fitView so the
  // newly-positioned nodes actually become visible. Without this, the
  // canvas appears blank because React Flow's mount-time fitView fired
  // before any nodes existed.
  useEffect(() => {
    let cancelled = false;
    const myTick = ++layoutTick.current;
    const { nodes: built, edges: builtEdges } = buildGraph(vibe);
    applyLayout(built, builtEdges).then((laid) => {
      if (cancelled || myTick !== layoutTick.current) return;
      setNodes(laid.nodes);
      setEdges(laid.edges);
      // Defer fitView so React Flow renders the new nodes first.
      requestAnimationFrame(() => {
        if (myTick !== layoutTick.current) return;
        try {
          reactFlow.fitView({ padding: 0.2, duration: 250 });
        } catch {
          /* react-flow may not be ready */
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [vibe, reactFlow]);

  // Auto-pan when a node is jumped-to from Issues/Vars/palette.
  useEffect(() => {
    if (!centerOnNode.id) return;
    const target = nodes.find((n) => n.id === centerOnNode.id);
    if (!target) return;
    try {
      reactFlow.setCenter(
        (target.position?.x ?? 0) + 110,
        (target.position?.y ?? 0) + 48,
        { duration: 350, zoom: Math.max(reactFlow.getZoom(), 0.9) },
      );
    } catch {
      /* not ready */
    }
  }, [centerOnNode, nodes, reactFlow]);

  // Annotate nodes per current view mode + selection + validation issues
  // + simulator execution state.
  const displayNodes = useMemo<RFNode[]>(() => {
    const issueByNode = new Map<string, string>();
    for (const i of issues) {
      if (i.nodeId) {
        issueByNode.set(i.nodeId, (issueByNode.get(i.nodeId) ?? "") + " " + i.severity);
      }
    }
    const currentSimNodeId =
      viewMode === "simulate" && simulation.cursor >= 0
        ? simulation.frames[simulation.cursor]?.nodeId
        : null;
    return nodes.map((n) => {
      const dimmed =
        viewMode === "data"
          ? highlightedVar !== null && !touched.has(n.id) && n.id !== "__start__"
          : false;
      const selected = selectedNodeId === n.id;
      const matchesSearch = search ? n.id.toLowerCase().includes(search.toLowerCase()) : true;
      const issueSeverity = issueByNode.get(n.id);
      const executionState =
        viewMode === "simulate"
          ? n.id === currentSimNodeId
            ? "running"
            : simulation.visited.has(n.id)
            ? "visited"
            : "pending"
          : undefined;
      return {
        ...n,
        data: {
          ...n.data,
          selected,
          dimmed: dimmed || (!matchesSearch && search.length > 0),
          highlighted: touched.has(n.id) && viewMode === "data",
          issueSeverity,
          executionState,
        },
      };
    });
  }, [
    nodes,
    viewMode,
    highlightedVar,
    touched,
    selectedNodeId,
    issues,
    search,
    simulation,
  ]);

  // Edge filtering per view mode — each mode shows visibly different edges.
  const displayEdges = useMemo<RFEdge[]>(() => {
    const kindOf = (e: RFEdge) => (e.data as { kind?: string })?.kind ?? "next";
    if (viewMode === "error") {
      // Errors view: only error edges, plus dimmed flow context.
      return edges.map((e) => {
        const k = kindOf(e);
        const isError = e.type === "error" || k === "error";
        return isError
          ? e
          : { ...e, style: { ...(e.style ?? {}), opacity: 0.18 } };
      });
    }
    if (viewMode === "data") {
      // Data view: promote data edges, hide control flow except branches/loops.
      return edges
        .filter((e) => {
          const k = kindOf(e);
          return (
            k === "data" ||
            k === "branch_then" ||
            k === "branch_else" ||
            k === "loop_iter" ||
            k === "loop_back" ||
            k === "parallel_fork"
          );
        });
    }
    if (viewMode === "simulate") {
      // Simulate view: only flow edges, no data noise. Edges get a subtle pulse later.
      return edges.filter((e) => kindOf(e) !== "data");
    }
    // Flow view (default): hide data edges.
    return edges.filter((e) => kindOf(e) !== "data");
  }, [edges, viewMode]);

  // Canvas-driven edge mutations.
  const handleConnect = useCallback(
    (c: Connection) => {
      if (editLocked || !c.source || !c.target) return;
      if (c.source === "__start__" || c.target === "__start__") return;
      addEdge(c.source, c.target);
    },
    [addEdge, editLocked],
  );

  const handleEdgeClick = useCallback<EdgeMouseHandler>(
    (event, edge) => {
      if (editLocked) return;
      event.stopPropagation();
      // Only allow deleting `next` and `error` edges via click.
      const kind = (edge.data as { kind?: string })?.kind ?? "next";
      if (kind === "data" || kind === "branch_then" || kind === "branch_else") return;
      if (edge.source === "__start__") return;
      const ok = window.confirm(
        `Remove the edge ${edge.source} → ${edge.target}?`,
      );
      if (ok) deleteEdge(edge.source, edge.target);
    },
    [deleteEdge, editLocked],
  );

  const handleFitView = () => {
    try {
      reactFlow.fitView({ padding: 0.2, duration: 250 });
    } catch {}
  };

  return (
    <div ref={containerRef} className="relative flex flex-col bg-ink min-w-0">
      <header className="h-9 px-3 flex items-center justify-between border-b border-ink-600 bg-ink-800">
        <div className="text-[12px] text-ink-200 font-mono">
          canvas · <span className="text-amber">{viewMode}</span>
          {!editLocked && <span className="ml-2 text-amber-soft">· editing</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none"
            />
            <input
              placeholder="filter nodes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-6 w-44 pl-6 pr-2 text-[12px] bg-ink-700 border border-ink-600 rounded text-ink-50 placeholder:text-ink-300 focus:outline-amber font-mono"
            />
          </div>
          <button
            disabled={editLocked}
            onClick={addStandaloneStep}
            className="h-6 px-2 flex items-center gap-1 text-[11px] bg-ink-700 border border-ink-600 rounded text-ink-100 hover:text-amber disabled:opacity-30"
            title={editLocked ? "Unlock the inspector to add steps" : "Add a standalone step"}
          >
            <Plus size={11} /> step
          </button>
          <button
            onClick={handleFitView}
            className="h-6 w-6 flex items-center justify-center bg-ink-700 border border-ink-600 rounded text-ink-100 hover:text-amber"
            title="Fit canvas to nodes"
          >
            <ScanSearch size={11} />
          </button>
          <button
            onClick={toggleFullscreen}
            className="h-6 w-6 flex items-center justify-center bg-ink-700 border border-ink-600 rounded text-ink-100 hover:text-amber"
            title="Toggle fullscreen"
          >
            {fullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodeClick={(_, n) => selectNode(n.id === "__start__" ? null : n.id)}
          onPaneClick={() => selectNode(null)}
          onConnect={handleConnect}
          onEdgeClick={handleEdgeClick}
          connectOnClick={false}
          minZoom={0.15}
          maxZoom={2.5}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: false }}
          deleteKeyCode={null}
        >
          <Background gap={24} size={1} color="rgba(232,163,61,0.06)" />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(n) => {
              const role = (n.data as { role?: string })?.role;
              const s = (n.data as { issueSeverity?: string })?.issueSeverity;
              if (s?.includes("error")) return "#D4654C";
              if (role === "start") return "#E8A33D";
              if (role === "conclusion") return "#8FBC6E";
              if (role === "terminating_error") return "#D4654C";
              if (role === "error_handler") return "#E8A33D";
              if (n.type === "conditional") return "#7BD7E4";
              if (n.type === "loop") return "#F2C078";
              if (n.type === "parallel") return "#8FBC6E";
              return "#534B3D";
            }}
            maskColor="rgba(11,9,8,0.85)"
            pannable
            zoomable
          />
        </ReactFlow>
      </div>

      {viewMode === "simulate" && <SimulationToolbar />}

      {viewMode === "data" &&
        edges.filter((e) => (e.data as { kind?: string })?.kind === "data").length === 0 && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 panel shadow-elev px-4 py-3 z-10 max-w-md text-center animate-in-up">
            <div className="flex items-center justify-center gap-2 text-cyan mb-1">
              <Info size={14} />
              <span className="text-[12px] font-mono uppercase tracking-[0.14em]">
                no data references
              </span>
            </div>
            <div className="text-[12px] text-ink-200 leading-snug">
              This Vibe has no <span className="font-mono text-cyan">{`\${steps.X.…}`}</span>{" "}
              references between its steps.
              <div className="mt-1 text-ink-300">
                Try loading <span className="font-mono text-amber">lead-enrichment</span> or{" "}
                <span className="font-mono text-amber">content-moderation</span> — those exercise
                step-output references heavily.
              </div>
            </div>
          </div>
        )}

      {vibe.workflow.steps.length === 0 && !nodes.length && (
        <div className="absolute inset-0 flex items-center justify-center text-ink-300 text-sm font-mono pointer-events-none">
          no steps yet — start typing in the YAML pane or load an example
        </div>
      )}
    </div>
  );
}

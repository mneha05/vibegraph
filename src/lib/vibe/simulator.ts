import type { Vibe, VibeNode, IfNode, ForEachNode, WhileNode, ParallelNode, StepNode } from "./schema";

/**
 * Simulator — a tiny interpreter over a Vibe.
 *
 * Powers the Simulation pane (Cmd-K → "Simulate Vibe"). It does NOT call any
 * real APIs — every step returns a deterministic mock value based on its
 * function name and inputs. The purpose is to give Vibe authors a debugger-
 * style step-through so they can see:
 *   - which branch a real `if` would take given a chosen variable value
 *   - how many times a `for_each` iterates given a mock list length
 *   - what `$variables` exist at each point in the workflow
 *
 * Synchronous and pure — emits a list of "frames" which the UI scrubs through.
 */

export interface SimulationFrame {
  /** Position in the execution trace, 0-indexed. */
  index: number;
  /** The node about to execute (or just executed). */
  nodeId: string;
  /** Snapshot of all variables in scope at this frame. */
  vars: Record<string, unknown>;
  /** Human-readable label of what just happened. */
  message: string;
  /** Optional branch hint ("then" / "else" / "iteration 3"). */
  branchHint?: string;
}

export interface SimulationResult {
  frames: SimulationFrame[];
  finalVars: Record<string, unknown>;
  /** True if the simulation hit a terminating error or exhausted the loop guard. */
  halted: boolean;
}

const MAX_FRAMES = 500;
const MAX_LOOP_ITERS = 25;

export function simulate(vibe: Vibe, initialVars: Record<string, unknown> = {}): SimulationResult {
  const frames: SimulationFrame[] = [];
  const vars: Record<string, unknown> = { ...initialVars };

  // Seed workflow-scope variable defaults.
  for (const v of vibe.workflow.variables ?? []) {
    if (vars[v.name] === undefined && v.default !== undefined) vars[v.name] = v.default;
  }

  const push = (nodeId: string, message: string, branchHint?: string) => {
    if (frames.length >= MAX_FRAMES) return false;
    frames.push({ index: frames.length, nodeId, vars: { ...vars }, message, branchHint });
    return true;
  };

  const exec = (steps: VibeNode[]): boolean => {
    for (const node of steps) {
      switch (node.kind) {
        case "step": {
          const s = node as StepNode;
          const mockOutput = mockFor(s);
          push(s.id, `Called \`${s.function}\``);
          if (s.output) {
            vars[s.output] = mockOutput;
            push(s.id, `Wrote \`$${s.output}\``);
          }
          break;
        }
        case "if": {
          const n = node as IfNode;
          const took = evalCondition(n.condition, vars);
          push(n.id, `Evaluated condition → ${took ? "then" : "else"}`, took ? "then" : "else");
          if (took) {
            if (!exec(n.then)) return false;
          } else if (n.else) {
            if (!exec(n.else)) return false;
          }
          break;
        }
        case "for_each": {
          const fe = node as ForEachNode;
          const list = mockIterable(fe.iterable, vars);
          push(fe.id, `Iterating over ${list.length} items`);
          let i = 0;
          for (const item of list) {
            if (i >= MAX_LOOP_ITERS) {
              push(fe.id, `Stopped after ${MAX_LOOP_ITERS} iterations (guard)`);
              return false;
            }
            vars[fe.item] = item;
            if (fe.index) vars[fe.index] = i;
            push(fe.id, `Iteration ${i + 1}`, `iteration ${i + 1}`);
            if (!exec(fe.body)) return false;
            i++;
          }
          break;
        }
        case "while": {
          const w = node as WhileNode;
          let i = 0;
          while (evalCondition(w.condition, vars)) {
            if (i >= MAX_LOOP_ITERS) {
              push(w.id, `Stopped after ${MAX_LOOP_ITERS} iterations (guard)`);
              return false;
            }
            push(w.id, `While condition true → iter ${i + 1}`);
            if (!exec(w.body)) return false;
            i++;
          }
          push(w.id, `While condition false → exit loop`);
          break;
        }
        case "parallel": {
          const p = node as ParallelNode;
          push(p.id, `Forking ${p.branches.length} branches`);
          for (let bi = 0; bi < p.branches.length; bi++) {
            push(p.id, `Running branch ${bi + 1}`, `branch ${bi + 1}`);
            if (!exec(p.branches[bi])) return false;
          }
          push(p.id, `Joined ${p.branches.length} branches`);
          break;
        }
        case "import": {
          push(node.id, `Imported sub-Vibe \`${(node as { source: string }).source}\``);
          break;
        }
      }
    }
    return true;
  };

  const completed = exec(vibe.workflow.steps);
  return { frames, finalVars: vars, halted: !completed };
}

/** Cheap condition evaluator — supports `var === "x"`, `var > 0`, truthy var. */
function evalCondition(expr: string, vars: Record<string, unknown>): boolean {
  if (!expr) return true;
  const trimmed = expr.trim();
  // Pull the first variable reference, default to the whole expression.
  const varMatch = trimmed.match(/\$([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (varMatch) {
    const v = vars[varMatch[1]];
    if (typeof v === "number") return v > 0;
    return Boolean(v);
  }
  // Bare truthy string.
  return trimmed.length > 0 && trimmed !== "false" && trimmed !== "0";
}

function mockIterable(expr: string, vars: Record<string, unknown>): unknown[] {
  const varMatch = expr.match(/\$([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (varMatch) {
    const v = vars[varMatch[1]];
    if (Array.isArray(v)) return v;
  }
  // Default to a 3-element mock list so authors can see the body iterate.
  return ["mock_item_1", "mock_item_2", "mock_item_3"];
}

function mockFor(step: StepNode): unknown {
  switch (step.function) {
    case "apiRequest":
      return { status: 200, body: { ok: true, source: step.input?.endpoint } };
    case "llmCall":
      return { content: "(mock llm response)", tokens: 42 };
    case "setVariable":
      return step.input ?? null;
    case "queryDb":
      return [{ id: 1 }, { id: 2 }];
    default:
      return { mock: true };
  }
}

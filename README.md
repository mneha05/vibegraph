<div align="center">

# VibeGraph

**A bidirectional visual editor for Vibes — where the canvas and the YAML are always the same thing.**

`Next.js 15 · React 19 · Monaco · React Flow · ELK · Zustand · TypeScript`

[Live demo](https://vibegraph.vercel.app) · [Demo script](./DEMO.md)

</div>

---

## What is this?

VibeGraph is a visual editor for **Vibes** — the YAML-based template format used to describe AI agentic workflows.

You can drive it from either side: type YAML on the left and watch the graph rebuild on the right; or click on the canvas and watch the YAML refactor itself. The two views are never out of sync, even when the underlying workflow has fifty steps, three nested for-each loops, four parallel branches, and imports another Vibe.

It's built around a single conviction: a Vibes author opens it and never wants to go back to raw YAML.

## What makes it work

**Real control flow.** `if`, `for_each`, `while`, `parallel`, and `import` are first-class nodes — rendered as containers with their children nested inside, not faked with decorative rectangles. A `for_each` is a real loop with loop-back edges; an `if` is a real branch with `then` and `else` groups; a `parallel` is a real fork/join.

**Real refactoring.** Rename a step in the Inspector and every `${steps.OLD.output.…}` reference across the entire Vibe updates with it — across deeply nested input fields, across routing pointers, across imports. Delete a step and the `next_step_id` pointers bridge across it cleanly while orphaned references get stripped from every other step's inputs.

**Real variable scope.** Click any step output or variable in the Variables tab and the canvas dims everything that doesn't touch it. You see, at a glance, where the value is born, where it gets read, where it gets overwritten.

**Real validation.** Nine classes of issues — duplicate IDs, broken routing refs, broken `${steps.X.…}` interpolations, unreachable steps, empty containers, undeclared variables, malformed inputs, missing imports, missing functions — surfaced inline in the YAML gutter, as colored rings on canvas nodes, and as a jump-to-source list in the Issues tab. Each one ships with a hint telling you how to fix it.

**Real layout.** A 50-node Vibe with three nested loops doesn't turn into spaghetti, because ELK's hierarchical layered algorithm understands the parent/child relationships and routes edges around them.

## Quickstart

```bash
git clone https://github.com/<your-username>/vibegraph.git
cd vibegraph
npm install
npm run dev
# → http://localhost:3000
```

Requires Node 18.18+ (tested on Node 20).

### Deploy to Vercel

The editor is fully client-side — no env config required.

```bash
npm i -g vercel
vercel        # follow the prompts
vercel --prod # ship
```

Or import the GitHub repo at [vercel.com/new](https://vercel.com/new).

## Architecture

```
src/
├── app/                          Next.js app router (page + global CSS)
├── components/
│   ├── editor/                   The three-pane shell
│   │   ├── VibeEditor.tsx        Layout, global shortcuts
│   │   ├── Toolbar.tsx           Brand, example picker, view modes
│   │   ├── YamlPane.tsx          Monaco + gutter markers from validator
│   │   ├── CanvasPane.tsx        React Flow + ELK layout
│   │   ├── InspectorPane.tsx     Workflow / Inspect / Vars / Issues tabs
│   │   ├── CommandPalette.tsx    ⌘K
│   │   └── ValidationBar.tsx     Bottom status strip
│   ├── canvas/
│   │   ├── nodes/                One view per node kind (6 total)
│   │   └── edges/                Semantic edge styles per relationship
│   └── ui/                       Tiny shared primitives
├── lib/
│   ├── vibe/
│   │   ├── schema.ts             Typed Vibe domain model
│   │   ├── parser.ts             YAML → typed AST (with kind inference)
│   │   ├── serializer.ts         AST → YAML, stable key order
│   │   ├── walk.ts               Generic visitor (path + scope path)
│   │   ├── references.ts         ${steps.X.…} grammar — single source of truth
│   │   ├── validator.ts          The 9 issue classes
│   │   ├── graph.ts              AST → React Flow nodes/edges
│   │   ├── layout.ts             ELK hierarchical layout
│   │   ├── scope.ts              Variable scope analyzer
│   │   ├── templates.ts          Step function templates
│   │   ├── simulator.ts          Mock step-through executor
│   │   └── imports.ts            Import resolver (cycle-safe)
│   ├── yaml/
│   │   └── sync.ts               The sync engine (the hard part)
│   └── store/
│       └── vibeStore.ts          Zustand store + rename/delete propagation
└── examples/                     6 realistic Vibe YAMLs
test/                             Vitest specs — 33 tests
```

## The bidirectional sync engine

The hardest part of an editor like this isn't the visuals — React Flow handles those. It's keeping two editable views of the same document in sync without creating feedback loops.

A naive approach goes:

```
yaml change → parse → rebuild graph → user clicks node → mutate AST →
serialize → yaml updates → parse → rebuild graph → user's cursor jumps →
yaml change fires → …
```

VibeGraph's `SyncEngine` (`src/lib/yaml/sync.ts`) tags every edit with its `source` (`yaml`, `canvas`, or `external`) and refuses to re-render the side that originated the change. Combined with stable key ordering in the serializer, the result is: you can rename a step in the Inspector, watch every `${steps.OLD.output.…}` reference rewrite itself across the YAML pane, and your cursor in Monaco stays exactly where you left it.

This engine lives outside React on purpose — so it's testable headlessly and doesn't depend on render timing.

## The reference grammar

VibeGraph recognises five forms of reference:

| Form | Meaning | Validated against |
|---|---|---|
| `${steps.X.output.y.z}` | Step output access | Step IDs in this Vibe |
| `${secrets.NAME}` | Injected secret | (treated as valid) |
| `${uniqueData.NAME}` | Trigger payload | (treated as valid) |
| `${system.NAME}` | Runtime metadata (timestamp, etc) | (treated as valid) |
| `$name` | Shorthand — workflow variable, `for_each` item, or step output alias | Declared in `workflow.variables`, a `for_each` `item:`, or a step's `output:` |

All five flavours flow through `src/lib/vibe/references.ts`. Five other modules — the validator, scope analyzer, data-edge builder, rename helper, and delete helper — dispatch off that one grammar, so a fix in one place propagates everywhere.

## Example library

Five realistic Vibes ship in the editor:

| Key | What it shows |
|---|---|
| `ticket-triage` | Parallel enrichment fan-out, conditional routing by intent + ARR, SLA polling loop, escalation |
| `lead-enrichment` | `for_each` over CSV rows, multi-call enrichment, scoring, conditional Salesforce write, error fallback |
| `content-moderation` | Lexical → parallel classifier fan-out → conditional human review → branch-specific publish/reject |
| `onboarding` | Parallel provisioning across Okta / GitHub / Slack, `for_each` 1:1 scheduling, training kickoff |
| `auth-common` | Reusable OAuth + permission-check sub-Vibe, imported by the others |

Each example uses at least two control-flow primitives and hits at least one realistic API surface — they're meant to be recognisable to anyone who actually writes Vibes.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette — fuzzy search actions, nodes, variables |
| `⌘Z` / `Ctrl+Z` | Undo |
| `⌘⇧Z` / `Ctrl+Y` | Redo |
| `Esc` | Close palette / deselect |

Monaco keeps all of its own shortcuts (multi-cursor, find-and-replace, fold) inside the YAML pane.

## Scripts

```bash
npm run dev         # Turbopack dev server
npm run build       # Production build
npm run start       # Production server
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run test        # Vitest (33 tests)
npm run test:watch  # Vitest watch
```

## Design notes

A few decisions worth flagging for anyone reading the source:

- **Why ELK and not Dagre.** Dagre doesn't model nested groups; you can fake nesting with subgraphs but they don't share a layered pass. ELK's hierarchical layered algorithm handles real container nesting (the conditional-inside-a-for-each-inside-a-parallel case in `content-moderation.yml`) without edge crossings.
- **Why a separate `SyncEngine` and not just two `useEffect`s.** The naive React approach loops infinitely. Isolating the source-of-change discipline outside React makes it testable headlessly and keeps render order out of the correctness story.
- **Why a `references.ts` grammar module.** Five different places in the codebase needed to recognise `${steps.X.…}` strings — the validator, the scope analyzer, the data-edge builder, the rename helper, and the delete helper. Concentrating the grammar in one place means you fix a bug once and every consumer gets the fix.
- **Why `kind:` inference in the parser.** Lots of Vibes in the wild were written without explicit `kind:` discriminators. The parser infers them from shape (a node with `condition:` and `then:` is an `if`, a node with `iterable:` and `body:` is a `for_each`) so old Vibes load without manual conversion.

## Built with Claude Code

Per the project brief, Claude (via Claude Code and the Claude desktop app) drove most of the implementation. Every meaningful module has comments explaining *why* it's shaped the way it is, not just what it does — so future contributors can pick up where the conversation left off.

## License

MIT.

# 10-minute live demo script

A beat-by-beat plan. Practice this once end-to-end; total runtime ~10 min.

---

## Minute 0:00 — Open cold

Open the deployed URL. The `ticket-triage` Vibe is loaded by default. Say:

> "This is VibeGraph. Left pane is the YAML — the source of truth. Middle is the canvas. Right is the inspector. They're never out of sync."

Take a beat. Let the audience see the shape — the parallel fan-out, the for_each loop, the nested if.

## Minute 0:30 — Prove the sync

Click on `assign_csm` on the canvas. The Inspector populates with its fields. Edit its description. Watch the YAML pane on the left scroll to the right line and update in place.

> "Edit on the canvas, YAML refactors itself. Notice my cursor in the YAML pane didn't jump."

Now click into the YAML pane and add a new step inside `enrich_in_parallel`. Watch the canvas re-layout and the new node appear in the right branch.

> "Edit the YAML, the canvas rebuilds. Same engine, both directions."

## Minute 2:00 — Control flow as containers

Point at the `enrich_in_parallel` container — a translucent green-edged box with three child nodes nested inside it. Then the `for_each` over SLA checks, with an `if` nested inside it.

> "`if`, `for_each`, `while`, `parallel` are first-class container nodes. The visual nesting matches the YAML nesting. A `for_each` is a real loop with a loop-back edge. An `if` is a real branch with `then` and `else` groups. You can see the topology of the workflow without reading a single line of YAML."

Switch examples → load `lead-enrichment`. Point at the three-level nesting: `for_each` → `if` → step.

> "Three levels deep, no edge crossings. That's the ELK layered layout doing its job."

## Minute 3:30 — Refactoring

Back to the canvas. Click on `enrich_clearbit`. Unlock the inspector. Rename it to `clearbit_lookup`.

- Every `${steps.enrich_clearbit.output.…}` reference across the YAML rewrites to `${steps.clearbit_lookup.output.…}`.
- Every `next_step_id: enrich_clearbit` pointer updates.
- The Monaco cursor stays where it is.

> "Renaming a step is not a search-and-replace. The editor knows what depends on what and rewrites the references for you."

Now delete a step in the middle of the flow.

- The `next_step_id` of the previous step bridges across to the deleted step's successor.
- Any input field referencing `${steps.DELETED.…}` gets stripped automatically.

> "Same idea on delete. Pointers bridge across, orphaned references clean up. The flow stays valid."

## Minute 5:00 — Variable scope

Open the Variables tab in the Inspector. Point to the chips:

- `${steps.classify_intent.…}` — declared by a step
- `$leads` — workflow-scope variable
- `$row` — `for_each` item binding

Click `${steps.classify_intent.…}`. The canvas dims everything except the producer node and every step that reads its output.

> "I clicked one step's output. The canvas dims everything that doesn't touch it. This is what variable scope means in a Vibe. You see the data flow, not just the control flow."

Click another variable — the overlay updates. Click it again to clear.

## Minute 6:30 — Live validation

In the YAML pane, find a `${steps.classify_intent.output.intent}` reference somewhere and typo the step name to `${steps.classify_intnet.…}`.

- Watch a red squiggle appear in Monaco's gutter.
- Watch the affected node get a red ring on the canvas.
- Watch the issue appear in the Issues tab.

> "Live validation. Broken step references, broken routing pointers, duplicate IDs, unreachable steps, undeclared variables, empty containers — nine classes total. Each one ships with a hint telling you how to fix it."

Click the Issues entry — it jumps you to the offending node. Fix the typo. Everything goes green.

## Minute 8:00 — Imports + command palette

Open `lead-enrichment`. Point at the `auth` node — it imports `auth-common`.

> "Vibes can import other Vibes. This one pulls in our reusable OAuth sub-Vibe. The resolver expands it inline, cycle-safe."

Press `⌘K`. Type "for_each". Jump to a for_each node.

> "Once a Vibe has thirty steps, clicking around the canvas stops scaling. The palette finds any node, any variable, any view mode, any action in one keystroke."

## Minute 9:00 — Why this works

Open `src/lib/yaml/sync.ts` in the editor or in another tab. Say:

> "The visuals aren't the hard part — React Flow gives you those. The hard part is keeping two editable views of the same document in sync without feedback loops. This file is the engine. Every edit gets tagged with its source — `yaml`, `canvas`, or `external` — and the engine refuses to re-render the side that originated the change. That's why the cursor never jumps when references auto-rewrite."

Then mention briefly:

> "Built with Claude Code. 33 unit tests. ELK hierarchical layout. Five realistic example Vibes. Repo link and deploy URL at the bottom of the README."

## Minute 9:45 — Close

> "Questions?"

/**
 * Canonical Vibe step functions and the input shape each one expects.
 *
 * Backs both the function-name autocomplete in the Inspector and a one-click
 * "use template" action that swaps a step's input to the canonical scaffold.
 *
 * This list isn't exhaustive — it covers the functions seen in real Vibes
 * across the bundled examples plus the reference editor's coverage. Anyone
 * can still type a custom function name; this just makes the common case
 * one keystroke instead of ten.
 */

export interface StepTemplate {
  function: string;
  label: string;
  category: "data" | "io" | "ai" | "control" | "messaging";
  description: string;
  input: Record<string, unknown>;
}

export const STEP_TEMPLATES: StepTemplate[] = [
  {
    function: "setVariable",
    label: "Set variable",
    category: "data",
    description: "Assigns a computed value to a workflow variable.",
    input: { variable_name: "result", value: "" },
  },
  {
    function: "apiRequest",
    label: "HTTP request",
    category: "io",
    description: "Calls an external API. Use ${steps.X.output} to pipe data.",
    input: {
      endpoint: "https://api.example.com/...",
      method: "GET",
      headers: { "Content-Type": "application/json" },
    },
  },
  {
    function: "queryDb",
    label: "Database query",
    category: "io",
    description: "Runs a SQL query against the connected database.",
    input: { query: "SELECT * FROM table WHERE id = ${steps.x.output.id}" },
  },
  {
    function: "queryKnowledgebase",
    label: "Query knowledge base",
    category: "io",
    description: "Pulls matching documents from the knowledge base.",
    input: { query_string: "", labels: [], max_results: 5 },
  },
  {
    function: "llmCall",
    label: "LLM call",
    category: "ai",
    description: "Calls a language model with a prompt.",
    input: {
      model: "claude-sonnet-4",
      system: "You are…",
      user: "${steps.x.output}",
    },
  },
  {
    function: "aiProcessing",
    label: "AI processing",
    category: "ai",
    description: "Runs an AI-backed transformation with a structured output.",
    input: { output_type: "json", temperature: 0, prompt: "" },
  },
  {
    function: "sendResponse",
    label: "Send response",
    category: "messaging",
    description: "Sends a message back to the originating channel.",
    input: { type: "dynamic", channel: "", message: "" },
  },
  {
    function: "createTask",
    label: "Create human task",
    category: "messaging",
    description: "Queues work for a human reviewer.",
    input: { queue: "", content: "${steps.x.output}" },
  },
  {
    function: "sleep",
    label: "Sleep",
    category: "control",
    description: "Pauses the workflow for N seconds. Useful in polling loops.",
    input: { seconds: 60 },
  },
  {
    function: "pageOnCall",
    label: "Page on-call",
    category: "messaging",
    description: "Alerts the on-call rotation. Use sparingly.",
    input: { severity: "P2", message: "" },
  },
  {
    function: "concludeWorkflow",
    label: "Conclude workflow",
    category: "control",
    description: "Marks the workflow as completed with a final status.",
    input: { status: "completed" },
  },
];

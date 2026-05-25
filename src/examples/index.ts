import ticketTriage from "./ticket-triage.yml.json";
import leadEnrichment from "./lead-enrichment.yml.json";
import contentModeration from "./content-moderation.yml.json";
import onboarding from "./onboarding.yml.json";
import authCommon from "./auth-common.yml.json";

/**
 * EXAMPLE_VIBES — the bundled Vibe library shown in the picker and used to
 * back the import resolver. Each example is a real, multi-feature Vibe:
 * loops, conditionals, parallel branches, imports, error handlers, variables.
 *
 * Not toy examples — these are realistic enough that a Vibes author opening
 * the editor for the first time recognises their own work in them.
 */

export interface ExampleVibe {
  key: string;
  title: string;
  description: string;
  yaml: string;
  badge?: string;
}

const make = (
  key: string,
  title: string,
  description: string,
  raw: { yaml: string },
  badge?: string,
): ExampleVibe => ({ key, title, description, yaml: raw.yaml, badge });

export const EXAMPLE_VIBES: Record<string, ExampleVibe> = {
  "ticket-triage": make(
    "ticket-triage",
    "Support ticket triage",
    "Parallel enrichment fan-out, conditional routing by intent + ARR, SLA polling loop, escalation. Exercises every control-flow primitive.",
    ticketTriage,
    "starter",
  ),
  "lead-enrichment": make(
    "lead-enrichment",
    "Sales lead enrichment",
    "Loops over a CSV of new leads, enriches each from Clearbit + LinkedIn, scores them, and creates Salesforce records for the top tier.",
    leadEnrichment,
    "advanced",
  ),
  "content-moderation": make(
    "content-moderation",
    "Content moderation pipeline",
    "Multi-stage moderation: lexical scan → image classifier → human review if uncertain → auto-publish on the rest.",
    contentModeration,
    "advanced",
  ),
  onboarding: make(
    "onboarding",
    "Employee onboarding",
    "End-to-end onboarding: provision Okta + GitHub + Slack in parallel, send welcome packet, schedule 1:1s, kick off training.",
    onboarding,
  ),
  "auth-common": make(
    "auth-common",
    "Auth — common (library)",
    "Reusable OAuth + permission-check sub-Vibe. Imported by the other examples.",
    authCommon,
    "library",
  ),
};

export const DEFAULT_EXAMPLE_KEY = "ticket-triage";

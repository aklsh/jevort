import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

const EFFORTS = {
  low: "A short, scoped task with a clear answer or a tiny reversible edit.",
  medium: "Routine coding or analysis needing several steps but little architectural uncertainty.",
  high: "Complex debugging, design, unfamiliar code, or changes with meaningful integration risk.",
  xhigh: "Exceptional difficulty: broad architecture, subtle correctness constraints, or high stakes where deeper analysis is justified.",
} as const;
type Effort = keyof typeof EFFORTS;
const levels = ["low", "medium", "high", "xhigh"] as const;
const FALLBACK: Effort = "medium";
let autoApply = /^(1|true|yes|on)$/i.test(process.env.JEVORT_AUTO_APPLY ?? "");

function chooseEffort(answer: { choice: string; probabilities: Record<string, number> } | undefined): Effort {
  if (!answer || !(answer.choice in EFFORTS)) return FALLBACK;
  const probability = answer.probabilities?.[answer.choice];
  return typeof probability === "number" && Number.isFinite(probability) && probability >= 0.5
    ? (answer.choice as Effort)
    : FALLBACK;
}

// Pi exposes a common effort vocabulary and each model's thinkingLevelMap tells
// us which levels that provider/model can actually represent.
function supportedEfforts(model: { reasoning: boolean; thinkingLevelMap?: Partial<Record<string, string | null>> } | undefined): Effort[] {
  if (!model?.reasoning) return [];
  return levels.filter((level) => model.thinkingLevelMap?.[level] !== null);
}

function mapEffort(effort: Effort, supported: Effort[]): Effort | undefined {
  if (!supported.length) return undefined;
  if (supported.includes(effort)) return effort;
  const target = levels.indexOf(effort);
  return [...supported].sort((a, b) => Math.abs(levels.indexOf(a) - target) - Math.abs(levels.indexOf(b) - target))[0];
}

async function decide(prompt: string, model?: string): Promise<Effort> {
  if (!process.env.TYPESAFE_API_KEY) throw new Error("TYPESAFE_API_KEY is missing");
  const client = new TypeSafeClient({ defaultModel: "jev-latest", timeout: 2500, retry: { maxRetries: 0 } });
  const state: Record<string, string> = { user_request: prompt };
  if (model) state.codex_model = model;
  const response = await client.systemOne({
    state,
    questions: {
      effort: choice(
        "Which reasoning effort tier should a coding agent use for this request? Judge likely task complexity and cost of errors, not prompt length. If uncertain, prefer medium.",
        EFFORTS,
      ),
    },
  });
  return chooseEffort(response.answers.effort);
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("jevort", {
    description: "Toggle Jevort automatic effort application (on/off/status)",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === "on") autoApply = true;
      else if (action === "off") autoApply = false;
      else if (action === "toggle" || action === "") autoApply = !autoApply;
      else if (action !== "status") {
        ctx.ui.notify("Usage: /jevort [on|off|toggle|status]", "warning");
        return;
      }
      ctx.ui.notify(`Jevort auto-apply is ${autoApply ? "on" : "off"}`, "info");
    },
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!event.prompt.trim()) return;
    try {
      const recommendation = await decide(event.prompt);
      const supported = supportedEfforts(ctx.model);
      const effort = mapEffort(recommendation, supported);
      if (!effort) {
        ctx.ui.notify("Jev made a recommendation, but the active model does not support reasoning effort; keeping current setting", "warning");
        return;
      }
      if (autoApply) pi.setThinkingLevel(effort);
      const suggestion = effort === recommendation
        ? effort
        : `${recommendation} (nearest supported: ${effort})`;
      ctx.ui.notify(
        autoApply
          ? `Jev suggested ${suggestion}; applied for this turn`
          : `Jev suggests ${suggestion} thinking. Use Pi's /thinking control to apply it.`,
        "warning",
      );
    } catch (error) {
      ctx.ui.notify(`Jev effort recommendation unavailable; keeping current level (${String(error)})`, "warning");
    }
  });

}

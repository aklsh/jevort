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
const manualLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const FALLBACK: Effort = "medium";

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
      pi.setThinkingLevel(effort);
      ctx.ui.notify(
        effort === recommendation
          ? `Jev selected ${effort} thinking for this turn`
          : `Jev suggested ${recommendation}; using supported ${effort} for this model`,
        "info",
      );
    } catch (error) {
      ctx.ui.notify(`Jev effort recommendation unavailable; keeping current level (${String(error)})`, "warning");
    }
  });

  pi.registerCommand("effort", {
    description: "Show or set Pi's reasoning effort",
    handler: async (args, ctx) => {
      const requested = args.trim();
      if (!requested) {
        ctx.ui.notify(`Current thinking level: ${pi.getThinkingLevel()}`, "info");
        return;
      }
      const supported = supportedEfforts(ctx.model);
      const allowed = ctx.model?.reasoning
        ? ["off", "minimal", ...supported, ...(ctx.model.thinkingLevelMap?.max !== undefined && ctx.model.thinkingLevelMap.max !== null ? ["max"] : [])]
        : ["off"];
      if (!(manualLevels as readonly string[]).includes(requested) || !allowed.includes(requested)) {
        ctx.ui.notify(`Unsupported for the active model. Available: ${allowed.join(" | ")}`, "warning");
        return;
      }
      pi.setThinkingLevel(requested as (typeof manualLevels)[number]);
      ctx.ui.notify(`Thinking level set to ${requested}`, "info");
    },
  });
}

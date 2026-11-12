// Talking points for each call.
//
// With an Anthropic API key (and AI switched on for this person), Claude writes
// 3 short, specific points from my notes. Otherwise — or if anything goes wrong —
// we use the built-in list. An AI problem must NEVER stop the daily job.
//
// Privacy: only the first name, the relation and the notes are sent.
// Never the phone number, email, or anything about other people.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Logger } from "pino";
import type { Relation } from "../../../shared/schemas.js";
import { offlineTopics } from "../core/offlineTopics.js";

export interface TopicRequest {
  personId: string;
  name: string;
  relation: Relation;
  notes: string;
  lastNotes: string | null;
  date: string;
  useAi: boolean;
}

export interface TopicResult {
  points: string[];
  source: "ai" | "offline";
}

export interface TopicService {
  pick(req: TopicRequest): Promise<TopicResult>;
}

const MODEL = "claude-opus-5-5";
const TIMEOUT_MS = 30_000;

const PointsSchema = z.object({
  points: z.array(z.string()).describe("Exactly 3 talking points"),
});

const SYSTEM_PROMPT = `You help an introverted student keep in touch with family and friends.
Write exactly 3 conversation starters for a short phone call.
Rules:
- Each one is a single friendly sentence, at most 18 words.
- Make them specific to the notes when notes exist. Do not invent facts that are not in the notes.
- Warm and natural, like a caring friend would say it. No emojis.
- Mention festivals or events only if the notes mention them.`;

export function offlineService(): TopicService {
  return {
    async pick(req) {
      return { points: offlineTopics(req.relation, `${req.personId}|${req.date}`), source: "offline" };
    },
  };
}

export function createTopicService(apiKey: string | null, logger: Logger): TopicService {
  const offline = offlineService();
  if (!apiKey) return offline;
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: TIMEOUT_MS });

  return {
    async pick(req) {
      if (!req.useAi) return offline.pick(req);
      const firstName = req.name.trim().split(/\s+/)[0] ?? req.name;
      const userText = [
        `Person: ${firstName} (${req.relation})`,
        `Today: ${req.date}`,
        `My notes about them: ${req.notes || "(none)"}`,
        `What we talked about last time: ${req.lastNotes || "(nothing recorded)"}`,
      ].join("\n");

      try {
        const response = await client.beta.messages.parse({
          model: MODEL,
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userText }],
          output_config: { effort: "low", format: betaZodOutputFormat(PointsSchema) },
          // If the main model declines, the API retries on a fallback model in the same call.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        });
        if (response.stop_reason === "refusal" || !response.parsed_output) return offline.pick(req);
        const points = response.parsed_output.points
          .map((p) => p.trim())
          .filter((p) => p.length > 0 && p.length <= 200)
          .slice(0, 3);
        if (points.length < 3) return offline.pick(req);
        return { points, source: "ai" };
      } catch (err) {
        // Log the kind of error only — never the prompt (it contains notes).
        const kind = err instanceof Anthropic.APIError ? `api-${err.status ?? "error"}` : "unexpected";
        logger.warn({ kind }, "AI talking points failed, using the built-in list");
        return offline.pick(req);
      }
    },
  };
}

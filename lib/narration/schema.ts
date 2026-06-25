import { z } from "zod";

import {
  narrationScriptSources,
  narrationSegmentKinds
} from "@/lib/narration/types";

export const maxNarrationTargetSeconds = 90;
export const maxNarrationTotalCharacters = 2600;
export const maxNarrationSegmentCharacters = 520;

const requiredSegmentKinds = [
  "overview",
  "naive_baseline",
  "key_path",
  "risk_checkpoint",
  "improvement",
  "final_lesson"
] as const;

export const narrationSegmentKindSchema = z.enum(narrationSegmentKinds);
export const narrationScriptSourceSchema = z.enum(narrationScriptSources);

export const narrationSegmentSchema = z.object({
  id: z.string().trim().min(1).max(80),
  kind: narrationSegmentKindSchema,
  title: z.string().trim().min(3).max(90),
  text: z.string().trim().min(40).max(maxNarrationSegmentCharacters),
  related_node_ids: z.array(z.string().trim().min(1)).max(6),
  related_issue_ids: z.array(z.string().trim().min(1)).max(4),
  target_duration_seconds: z.number().int().min(6).max(20)
});

export const narrationScriptSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    graph_id: z.string().trim().min(1),
    version: z.literal("1.0.0"),
    title: z.string().trim().min(3).max(120),
    source: narrationScriptSourceSchema,
    target_duration_seconds: z.number().int().min(30).max(maxNarrationTargetSeconds),
    simulation_notice: z.string().trim().min(40).max(240),
    segments: z.array(narrationSegmentSchema).min(5).max(8)
  })
  .superRefine((script, context) => {
    const segmentIds = new Set<string>();
    const segmentKinds = new Set<string>();
    const totalDuration = script.segments.reduce(
      (sum, segment) => sum + segment.target_duration_seconds,
      0
    );
    const totalCharacters =
      script.simulation_notice.length +
      script.segments.reduce((sum, segment) => sum + segment.text.length, 0);

    if (totalDuration !== script.target_duration_seconds) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Script target duration must equal the sum of segment durations.",
        path: ["target_duration_seconds"]
      });
    }

    if (totalDuration > maxNarrationTargetSeconds) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Script target duration must be ${maxNarrationTargetSeconds} seconds or less.`,
        path: ["target_duration_seconds"]
      });
    }

    if (totalCharacters > maxNarrationTotalCharacters) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Script text must be ${maxNarrationTotalCharacters} characters or less.`,
        path: ["segments"]
      });
    }

    if (!hasSimulationNotice(script.simulation_notice)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Simulation notice must clearly say the script is not a live execution or proof.",
        path: ["simulation_notice"]
      });
    }

    for (const requiredKind of requiredSegmentKinds) {
      if (!script.segments.some((segment) => segment.kind === requiredKind)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Script must include a ${requiredKind} segment.`,
          path: ["segments"]
        });
      }
    }

    for (const [index, segment] of script.segments.entries()) {
      if (segmentIds.has(segment.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate segment id ${segment.id}.`,
          path: ["segments", index, "id"]
        });
      }

      if (segmentKinds.has(segment.kind)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate segment kind ${segment.kind}.`,
          path: ["segments", index, "kind"]
        });
      }

      segmentIds.add(segment.id);
      segmentKinds.add(segment.kind);

      const estimatedSeconds = estimateSpeechSeconds(segment.text);
      if (estimatedSeconds > segment.target_duration_seconds + 4) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Segment ${segment.id} is too long for its target duration.`,
          path: ["segments", index, "target_duration_seconds"]
        });
      }

      if (hasUnsupportedTruthClaim(segment.text)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Segment ${segment.id} uses unsupported live-execution, audio, or guarantee language.`,
          path: ["segments", index, "text"]
        });
      }
    }
  });

export function estimateSpeechSeconds(text: string) {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(6, Math.ceil(wordCount / 2.55));
}

function hasSimulationNotice(value: string) {
  const normalized = value.toLowerCase();

  return (
    normalized.includes("not a live execution") ||
    normalized.includes("not a live run") ||
    normalized.includes("not proof") ||
    normalized.includes("does not call external apis")
  );
}

function hasUnsupportedTruthClaim(value: string) {
  return [
    /\bactually (?:ran|run|executed|called|queried|uploaded|retrieved|verified)\b/i,
    /\blive (?:api|provider|database|retrieval|execution|run)\b/i,
    /\bproduction ready\b/i,
    /\bguarantee(?:d|s)? correctness\b/i,
    /\bcompliance-certified\b/i,
    /\baudio route\b/i,
    /\bmicrophone\b/i,
    /\brecording\b/i,
    /\btranscription\b/i
  ].some((pattern) => pattern.test(value));
}

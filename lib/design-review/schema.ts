import { z } from "zod";

import {
  designReviewRoles,
  designReviewSources
} from "@/lib/design-review/types";

export const maxDesignReviewTotalCharacters = 3200;
export const maxDesignReviewTurnCharacters = 420;
export const maxDesignReviewLessonCharacters = 280;

export const designReviewRoleSchema = z.enum(designReviewRoles);
export const designReviewSourceSchema = z.enum(designReviewSources);

export const designReviewTurnSchema = z.object({
  id: z.string().trim().min(1).max(80),
  role: designReviewRoleSchema,
  speaker: z.string().trim().min(3).max(40),
  text: z.string().trim().min(50).max(maxDesignReviewTurnCharacters),
  related_node_ids: z.array(z.string().trim().min(1)).max(6),
  related_issue_ids: z.array(z.string().trim().min(1)).max(4)
});

export const designReviewLessonSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(3).max(90),
  text: z.string().trim().min(50).max(maxDesignReviewLessonCharacters),
  related_node_ids: z.array(z.string().trim().min(1)).max(6),
  related_issue_ids: z.array(z.string().trim().min(1)).max(4)
});

export const designReviewDialogueSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    graph_id: z.string().trim().min(1),
    version: z.literal("1.0.0"),
    title: z.string().trim().min(3).max(120),
    source: designReviewSourceSchema,
    review_notice: z.string().trim().min(40).max(240),
    turns: z.array(designReviewTurnSchema).min(6).max(10),
    lessons: z.array(designReviewLessonSchema).min(2).max(4)
  })
  .superRefine((dialogue, context) => {
    const turnIds = new Set<string>();
    const lessonIds = new Set<string>();
    const roles = new Set(dialogue.turns.map((turn) => turn.role));
    const totalCharacters =
      dialogue.review_notice.length +
      dialogue.turns.reduce((sum, turn) => sum + turn.text.length, 0) +
      dialogue.lessons.reduce((sum, lesson) => sum + lesson.text.length, 0);

    if (totalCharacters > maxDesignReviewTotalCharacters) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Design review text must be ${maxDesignReviewTotalCharacters} characters or less.`,
        path: ["turns"]
      });
    }

    if (!hasReviewNotice(dialogue.review_notice)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Review notice must clearly say the critique is simulated and not a live execution.",
        path: ["review_notice"]
      });
    }

    for (const role of designReviewRoles) {
      if (!roles.has(role)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Dialogue must include a ${role} turn.`,
          path: ["turns"]
        });
      }
    }

    for (const [index, turn] of dialogue.turns.entries()) {
      if (turnIds.has(turn.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate turn id ${turn.id}.`,
          path: ["turns", index, "id"]
        });
      }

      turnIds.add(turn.id);

      if (hasUnsupportedTruthClaim(turn.text)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Turn ${turn.id} uses unsupported live-execution, audio, or guarantee language.`,
          path: ["turns", index, "text"]
        });
      }

      if (hasTheatricalFiller(turn.text)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Turn ${turn.id} uses theatrical filler instead of architecture critique.`,
          path: ["turns", index, "text"]
        });
      }
    }

    for (const [index, lesson] of dialogue.lessons.entries()) {
      if (lessonIds.has(lesson.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate lesson id ${lesson.id}.`,
          path: ["lessons", index, "id"]
        });
      }

      lessonIds.add(lesson.id);

      if (hasUnsupportedTruthClaim(lesson.text) || hasTheatricalFiller(lesson.text)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Lesson ${lesson.id} must stay grounded in architecture evidence.`,
          path: ["lessons", index, "text"]
        });
      }
    }
  });

function hasReviewNotice(value: string) {
  const normalized = value.toLowerCase();

  return (
    normalized.includes("simulated") &&
    (normalized.includes("not a live execution") ||
      normalized.includes("not a live run") ||
      normalized.includes("not proof"))
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

function hasTheatricalFiller(value: string) {
  return [
    /\bcurtain rises\b/i,
    /\bon stage\b/i,
    /\bdramatic pause\b/i,
    /\bapplause\b/i,
    /\broleplay\b/i,
    /\bscene\b/i
  ].some((pattern) => pattern.test(value));
}

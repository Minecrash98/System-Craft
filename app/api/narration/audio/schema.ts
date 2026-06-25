import { z } from "zod";

import {
  maxNarrationSegmentCharacters,
  maxNarrationTotalCharacters,
  narrationSegmentSchema
} from "@/lib/narration/schema";
import type { NarrationSegment } from "@/lib/narration/types";

export const maxNarrationAudioSegments = 8;
export const maxNarrationAudioTotalCharacters = maxNarrationTotalCharacters;

const referenceIdsSchema = z.array(z.string().trim().min(1)).max(120);

const narrationAudioRequestSchema = z
  .object({
    segment: narrationSegmentSchema.optional(),
    segments: z
      .array(narrationSegmentSchema)
      .min(1)
      .max(maxNarrationAudioSegments)
      .optional(),
    references: z
      .object({
        node_ids: referenceIdsSchema.optional(),
        issue_ids: referenceIdsSchema.optional()
      })
      .strict()
      .optional(),
    request_id: z.string().trim().min(1).max(120).optional(),
    trace_id: z.string().trim().min(1).max(120).optional(),
    response_format: z.enum(["audio", "json"]).optional()
  })
  .strict()
  .superRefine((request, context) => {
    if (!request.segment && !request.segments) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide one segment or a non-empty segments array.",
        path: ["segment"]
      });
    }

    if (request.segment && request.segments) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either segment or segments, not both.",
        path: ["segments"]
      });
    }
  });

export interface NarrationAudioRequest {
  segments: NarrationSegment[];
  responseFormat: "audio" | "json";
  requestId?: string;
  traceId?: string;
  totalTextCharacters: number;
}

export type NarrationAudioParseResult =
  | { success: true; request: NarrationAudioRequest }
  | { success: false; details: string[] };

export function parseNarrationAudioRequest(
  body: unknown
): NarrationAudioParseResult {
  const parsed = narrationAudioRequestSchema.safeParse(body);

  if (!parsed.success) {
    return {
      success: false,
      details: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "request"}: ${issue.message}`
      )
    };
  }

  const segments = parsed.data.segment
    ? [parsed.data.segment]
    : parsed.data.segments ?? [];
  const totalTextCharacters = segments.reduce(
    (total, segment) => total + countCharacters(segment.text),
    0
  );
  const referenceErrors = findReferenceErrors(
    segments,
    parsed.data.references?.node_ids,
    parsed.data.references?.issue_ids
  );
  const details = [...referenceErrors];

  if (totalTextCharacters > maxNarrationAudioTotalCharacters) {
    details.push(
      `segments: Narration audio text must be ${maxNarrationAudioTotalCharacters} characters or fewer.`
    );
  }

  if (
    segments.some(
      (segment) => countCharacters(segment.text) > maxNarrationSegmentCharacters
    )
  ) {
    details.push(
      `segments: Each narration audio segment must be ${maxNarrationSegmentCharacters} characters or fewer.`
    );
  }

  if (details.length > 0) {
    return { success: false, details };
  }

  return {
    success: true,
    request: {
      segments,
      responseFormat: parsed.data.response_format ?? "audio",
      requestId: parsed.data.request_id,
      traceId: parsed.data.trace_id,
      totalTextCharacters
    }
  };
}

function findReferenceErrors(
  segments: NarrationSegment[],
  nodeIds?: string[],
  issueIds?: string[]
) {
  const errors: string[] = [];
  const knownNodeIds = nodeIds ? new Set(nodeIds) : undefined;
  const knownIssueIds = issueIds ? new Set(issueIds) : undefined;

  segments.forEach((segment, index) => {
    if (knownNodeIds) {
      for (const nodeId of segment.related_node_ids) {
        if (!knownNodeIds.has(nodeId)) {
          errors.push(
            `segments.${index}.related_node_ids: unknown node ${nodeId}.`
          );
        }
      }
    }

    if (knownIssueIds) {
      for (const issueId of segment.related_issue_ids) {
        if (!knownIssueIds.has(issueId)) {
          errors.push(
            `segments.${index}.related_issue_ids: unknown issue ${issueId}.`
          );
        }
      }
    }
  });

  return errors;
}

function countCharacters(value: string) {
  return Array.from(value).length;
}

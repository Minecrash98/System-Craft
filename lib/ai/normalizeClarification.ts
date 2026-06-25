import {
  clarificationResponseSchema,
  type ClarificationQuestion,
  type ClarificationResponse
} from "@/lib/ai/types";

export function normalizeClarificationCandidate(
  candidate: unknown
): ClarificationResponse | null {
  const response = unwrapResponse(candidate);
  const questionValues = getArrayField(response, [
    "questions",
    "clarification_questions",
    "clarifying_questions",
    "architecture_questions",
    "items"
  ]);

  if (!questionValues) {
    return null;
  }

  const questions = questionValues
    .map(normalizeQuestion)
    .filter((question): question is ClarificationQuestion => question !== null)
    .slice(0, 4);

  if (questions.length < 2) {
    return null;
  }

  const assumptions = normalizeStringArray(
    getField(response, ["assumptions", "default_assumptions", "defaults"]),
    []
  );

  const parsed = clarificationResponseSchema.safeParse({
    questions,
    assumptions
  });

  return parsed.success ? parsed.data : null;
}

function unwrapResponse(candidate: unknown) {
  if (!isRecord(candidate)) {
    return candidate;
  }

  for (const key of ["clarification", "clarifications", "response", "result"]) {
    const value = candidate[key];

    if (isRecord(value) || Array.isArray(value)) {
      return value;
    }
  }

  return candidate;
}

function normalizeQuestion(
  rawQuestion: unknown,
  index: number
): ClarificationQuestion | null {
  if (typeof rawQuestion === "string" && rawQuestion.trim()) {
    const question = rawQuestion.trim();

    return {
      id: `question_${index + 1}`,
      question,
      why_it_matters:
        "This answer changes retrieval, verification, privacy, or review boundaries.",
      default_answer: "Use the safer architecture default"
    };
  }

  if (!isRecord(rawQuestion)) {
    return null;
  }

  const question = firstString(rawQuestion, [
    "question",
    "text",
    "prompt",
    "title"
  ]);

  if (!question) {
    return null;
  }

  const options = normalizeOptions(
    getField(rawQuestion, ["options", "choices", "answers"])
  );
  const defaultAnswer =
    firstString(rawQuestion, [
      "default_answer",
      "default",
      "defaultAnswer",
      "recommended_answer",
      "answer"
    ]) ??
    options?.[0] ??
    "Use the safer architecture default";

  return {
    id:
      firstString(rawQuestion, ["id", "key", "name"]) ??
      slugify(question) ??
      `question_${index + 1}`,
    question,
    why_it_matters:
      firstString(rawQuestion, [
        "why_it_matters",
        "why",
        "rationale",
        "reason",
        "architecture_impact"
      ]) ??
      "This answer changes retrieval, verification, privacy, or review boundaries.",
    default_answer: defaultAnswer,
    ...(options ? { options } : {})
  };
}

function normalizeOptions(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const options = value
    .map((option) => {
      if (typeof option === "string") {
        return option.trim();
      }

      if (isRecord(option)) {
        return firstString(option, ["label", "value", "text", "name"]) ?? "";
      }

      return "";
    })
    .filter(Boolean)
    .slice(0, 5);

  return options.length >= 2 ? options : null;
}

function getArrayField(value: unknown, keys: string[]) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of keys) {
    const field = value[key];

    if (Array.isArray(field)) {
      return field;
    }
  }

  return null;
}

function getField(value: unknown, keys: string[]) {
  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of keys) {
    if (value[key] !== undefined) {
      return value[key];
    }
  }

  return undefined;
}

function firstString(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = value[key];

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  if (!Array.isArray(value)) {
    return fallback;
  }

  const strings = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  return strings.length > 0 ? strings : fallback;
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  return slug || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

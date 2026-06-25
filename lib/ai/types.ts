import { z } from "zod";

export const clarificationQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  why_it_matters: z.string().min(1),
  default_answer: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(5).optional()
});

export const clarificationResponseSchema = z.object({
  questions: z.array(clarificationQuestionSchema).min(2).max(4),
  assumptions: z.array(z.string().min(1)).default([])
});

export const clarificationAnswerSchema = z.object({
  question_id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1)
});

export const generationRequestSchema = z.object({
  idea: z.string().trim().min(1).max(2000),
  answers: z.array(clarificationAnswerSchema).default([]),
  example_id: z.string().min(1).optional()
});

export type ClarificationQuestion = z.infer<
  typeof clarificationQuestionSchema
>;
export type ClarificationResponse = z.infer<
  typeof clarificationResponseSchema
>;
export type ClarificationAnswer = z.infer<typeof clarificationAnswerSchema>;
export type GenerationRequest = z.infer<typeof generationRequestSchema>;

import type {
  ClarificationQuestion,
  ClarificationResponse
} from "@/lib/ai/types";

export function buildFallbackClarification(
  idea: string,
  exampleId?: string
): ClarificationResponse {
  const lowerIdea = `${idea} ${exampleId ?? ""}`.toLowerCase();

  if (matchesAny(lowerIdea, ["research", "paper", "citation", "cite", "rag", "source", "document", "pdf", "evidence"])) {
    return {
      questions: [
        question(
          "knowledge_source",
          "What sources should the assistant be allowed to answer from?",
          "Uploaded papers only",
          [
            "Uploaded papers only",
            "Uploaded papers plus trusted web sources",
            "General model knowledge is acceptable"
          ],
          "This decides whether the architecture needs retrieval, source metadata, and strict grounding."
        ),
        question(
          "citation_requirement",
          "How strict should citation checking be?",
          "Every factual claim needs a source",
          [
            "Every factual claim needs a source",
            "Only key claims need sources",
            "Citations are optional"
          ],
          "Citation strictness determines whether a verifier is mandatory before final output."
        ),
        question(
          "privacy_level",
          "Will uploaded papers or notes contain private material?",
          "Yes, treat uploads as private",
          [
            "Yes, treat uploads as private",
            "Sometimes, ask per project",
            "No, sources are public"
          ],
          "Private documents require retention, deletion, and data-minimization assumptions."
        ),
        question(
          "review_style",
          "Who should approve high-trust answers before they are used externally?",
          "A human reviewer approves flagged answers",
          [
            "A human reviewer approves flagged answers",
            "The user approves every answer",
            "No manual review"
          ],
          "Review requirements change the graph by adding or removing human review gates."
        )
      ],
      assumptions: [
        "Answers should be grounded in approved source material.",
        "Citation reliability and privacy controls matter for this idea."
      ]
    };
  }

  if (matchesAny(lowerIdea, ["study", "student", "quiz", "revision", "course", "lesson", "tutor", "homework", "learning", "exam"])) {
    return {
      questions: [
        question(
          "course_materials",
          "What course material should shape the study plan?",
          "Course notes and syllabus",
          ["Course notes and syllabus", "Notes only", "No private notes"],
          "Study plans are stronger when they are grounded in the actual course context."
        ),
        question(
          "memory_boundary",
          "What progress should the system remember?",
          "Weak topics and completed quizzes",
          ["Weak topics and completed quizzes", "Only current session", "No memory"],
          "Memory changes privacy risk and determines whether a progress-memory node belongs in the graph."
        ),
        question(
          "student_control",
          "Should the student approve schedules before they are finalized?",
          "Yes, require student approval",
          ["Yes, require student approval", "Only approve major changes", "No approval"],
          "Approval keeps the coach from overcommitting the student."
        )
      ],
      assumptions: [
        "The student should remain in control of private notes and study commitments."
      ]
    };
  }

  if (matchesAny(lowerIdea, ["support", "customer", "faq", "billing", "policy", "ticket", "helpdesk", "refund", "account", "triage"])) {
    return {
      questions: [
        question(
          "policy_source",
          "Where should support answers come from?",
          "Approved FAQ and policy docs",
          ["Approved FAQ and policy docs", "FAQ only", "General model knowledge"],
          "Support bots need approved policy grounding to avoid wrong commitments."
        ),
        question(
          "sensitive_cases",
          "Which messages must be escalated to a person?",
          "Billing, legal, security, and angry customers",
          [
            "Billing, legal, security, and angry customers",
            "Billing only",
            "Only messages the model is uncertain about"
          ],
          "Escalation rules determine where human review appears in the workflow."
        ),
        question(
          "data_handling",
          "How should private customer data be handled?",
          "Redact PII before generation",
          [
            "Redact PII before generation",
            "Show PII only to support agents",
            "No special handling"
          ],
          "PII handling determines whether privacy filtering is required before the LLM."
        )
      ],
      assumptions: [
        "Customer data may be sensitive and policy answers should use approved sources."
      ]
    };
  }

  return {
    questions: [
      question(
        "knowledge_need",
        "Does the system need private or domain-specific knowledge?",
        "Yes, it needs approved knowledge sources",
        [
          "Yes, it needs approved knowledge sources",
          "Some domain knowledge",
          "No, general model knowledge is enough"
        ],
        "Knowledge needs decide whether retrieval and a knowledge base are necessary."
      ),
      question(
        "tool_actions",
        "Will the AI take actions outside the chat?",
        "No irreversible actions",
        [
          "No irreversible actions",
          "Draft actions for approval",
          "Take low-risk actions automatically"
        ],
        "External actions require permission gates, validation, and fallbacks."
      ),
      question(
        "privacy_memory",
        "Should the system remember user data over time?",
        "Only with explicit consent",
        ["Only with explicit consent", "Session only", "No memory"],
        "Memory can improve fit, but it adds retention and deletion requirements."
      ),
      question(
        "review_requirement",
        "When should a human review the output?",
        "Review high-risk or uncertain outputs",
        [
          "Review high-risk or uncertain outputs",
          "Review every final output",
          "No human review needed"
        ],
        "Human review controls risk before users trust or act on outputs."
      )
    ],
    assumptions: [
      "The first architecture should favor reliability and explainability over automation."
    ]
  };
}

function question(
  id: string,
  text: string,
  defaultAnswer: string,
  options: string[],
  whyItMatters: string
): ClarificationQuestion {
  return {
    id,
    question: text,
    default_answer: defaultAnswer,
    options,
    why_it_matters: whyItMatters
  };
}

function matchesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

import researchAssistantGraph from "@/examples/research-assistant.graph.json";
import studyCoachGraph from "@/examples/study-coach.graph.json";
import supportTriageGraph from "@/examples/support-triage.graph.json";
import type { ClarificationAnswer, GenerationRequest } from "@/lib/ai/types";
import { architectureGraphSchema } from "@/shared/schemas/graphSchema";
import type { ArchitectureGraph } from "@/shared/types/graph";

const templates = [
  architectureGraphSchema.parse(researchAssistantGraph),
  architectureGraphSchema.parse(studyCoachGraph),
  architectureGraphSchema.parse(supportTriageGraph)
] as ArchitectureGraph[];

export function getExampleGraphs() {
  return templates.map(cloneGraph);
}

export function getExampleGraphById(id: string) {
  const match = templates.find((graph) => graph.id === id);
  return match ? cloneGraph(match) : null;
}

export function buildFallbackArchitecture({
  idea,
  answers,
  example_id: exampleId
}: GenerationRequest): ArchitectureGraph {
  const scenarioText = [
    idea,
    ...answers.map((answer) => `${answer.question} ${answer.answer}`)
  ].join(" ");
  const template = chooseTemplate(scenarioText, exampleId);
  const graph = cloneGraph(template);
  const answerAssumptions = answersToAssumptions(answers);

  graph.id = `generated-${template.id}`;
  graph.user_idea = idea;
  graph.description = `Cached ${template.title.toLowerCase()} architecture adapted for the submitted idea.`;
  graph.assumptions = dedupe([
    ...graph.assumptions,
    ...answerAssumptions,
    "A cached architecture was used because live model generation was unavailable or invalid."
  ]).slice(0, 8);

  return graph;
}

function chooseTemplate(idea: string, exampleId?: string) {
  if (exampleId) {
    const selected = templates.find((graph) => graph.id === exampleId);

    if (selected) {
      return selected;
    }
  }

  const lowerIdea = idea.toLowerCase();

  if (matchesAny(lowerIdea, ["study", "student", "quiz", "revision", "course", "lesson", "tutor", "homework", "learning", "exam", "flashcard"])) {
    return templates.find((graph) => graph.id === "study-coach") ?? templates[0];
  }

  if (matchesAny(lowerIdea, ["support", "customer", "faq", "billing", "policy", "ticket", "helpdesk", "refund", "account", "triage"])) {
    return (
      templates.find((graph) => graph.id === "support-triage") ?? templates[0]
    );
  }

  if (matchesAny(lowerIdea, ["research", "paper", "citation", "cite", "rag", "source", "document", "pdf", "knowledge", "evidence", "fact"])) {
    return (
      templates.find((graph) => graph.id === "research-assistant") ??
      templates[0]
    );
  }

  return templates[0];
}

function answersToAssumptions(answers: ClarificationAnswer[]) {
  return answers
    .filter((answer) => answer.answer.trim().length > 0)
    .map((answer) => `${answer.question}: ${answer.answer}`);
}

function cloneGraph(graph: ArchitectureGraph): ArchitectureGraph {
  return JSON.parse(JSON.stringify(graph)) as ArchitectureGraph;
}

function matchesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

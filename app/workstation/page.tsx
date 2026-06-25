import type { Metadata } from "next";

import { WorkstationClient } from "@/components/workstation/WorkstationClient";
import type { ArchitectureGraph } from "@/shared/types/graph";

import researchAssistantGraph from "@/examples/research-assistant.graph.json";
import studyCoachGraph from "@/examples/study-coach.graph.json";
import supportTriageGraph from "@/examples/support-triage.graph.json";

export const metadata: Metadata = {
  title: "Workstation | SystemCraft",
  description:
    "Inspect saved SystemCraft blueprints and example architectures."
};

const exampleGraphs = [
  researchAssistantGraph,
  studyCoachGraph,
  supportTriageGraph
] as ArchitectureGraph[];

export default function WorkstationPage() {
  return <WorkstationClient exampleGraphs={exampleGraphs} />;
}

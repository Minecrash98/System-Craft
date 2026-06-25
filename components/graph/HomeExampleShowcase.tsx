"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ArchitectureWorkspace } from "@/components/graph/ArchitectureWorkspace";
import type { ArchitectureGraph } from "@/shared/types/graph";

interface ExamplesResponse {
  examples: ArchitectureGraph[];
}

interface HomeExampleShowcaseProps {
  initialGraphs: ArchitectureGraph[];
  isActive: boolean;
  onBack: () => void;
}

export function HomeExampleShowcase({
  initialGraphs,
  isActive,
  onBack
}: HomeExampleShowcaseProps) {
  const [graphs, setGraphs] = useState(initialGraphs);

  useEffect(() => {
    let ignore = false;

    async function loadExamples() {
      try {
        const response = await fetch("/api/examples");

        if (!response.ok) {
          throw new Error("Examples failed to load.");
        }

        const data = (await response.json()) as ExamplesResponse;

        if (!ignore && data.examples.length > 0) {
          setGraphs(data.examples);
        }
      } catch {
        if (!ignore) {
          setGraphs(initialGraphs);
        }
      }
    }

    void loadExamples();

    return () => {
      ignore = true;
    };
  }, [initialGraphs]);

  return (
    <section
      id="examples"
      className={`crystal-example-scene dark-crystal-workspace ${
        isActive ? "crystal-example-scene-active" : ""
      }`}
      aria-hidden={!isActive}
      aria-labelledby="examples-title"
    >
      <header className="crystal-example-topbar">
        <div>
          <p className="crystal-eyebrow">Connected examples</p>
          <h2 id="examples-title">Inspect real SystemCraft blueprints.</h2>
          <p>
            Loaded through the examples interface with validation, score,
            simulation, node inspection, and export preserved.
          </p>
        </div>
        <div className="crystal-example-actions">
          <button type="button" className="crystal-button" onClick={onBack}>
            Back to home
          </button>
          <Link href="/create" className="crystal-button crystal-button-primary">
            Create your own
          </Link>
        </div>
      </header>
      <div className="crystal-example-workspace">
        <ArchitectureWorkspace graphs={graphs} />
      </div>
    </section>
  );
}

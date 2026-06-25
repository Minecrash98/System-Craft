"use client";

import Link from "next/link";
import { LanguageToggle, useLanguage } from "@/components/i18n/LanguageProvider";
import { useEffect, useMemo, useState } from "react";

import {
  ArchitectureWorkspace,
  type ArchitectureGraphGroup
} from "@/components/graph/ArchitectureWorkspace";
import {
  loadWorkstationGraphs,
  saveGraphToWorkstation
} from "@/lib/workstation/browserStorage";
import type { ArchitectureGraph } from "@/shared/types/graph";

interface WorkstationClientProps {
  exampleGraphs: ArchitectureGraph[];
}

const workstationCopy = {
  zh: {
    savedTitle: "我的蓝图",
    savedEmpty: "在这个浏览器里创建并保存的架构会显示在这里。",
    examplesTitle: "示例",
    homeAria: "SystemCraft 首页",
    backHome: "返回首页",
    create: "创建蓝图"
  },
  en: {
    savedTitle: "My Blueprints",
    savedEmpty: "Created architectures saved in this browser will appear here.",
    examplesTitle: "Examples",
    homeAria: "SystemCraft home",
    backHome: "Back to home",
    create: "Create your own"
  }
};
export function WorkstationClient({ exampleGraphs }: WorkstationClientProps) {
  const { language } = useLanguage();
  const copy = workstationCopy[language];
  const [savedGraphs, setSavedGraphs] = useState<ArchitectureGraph[]>([]);
  const [requestedGraphId, setRequestedGraphId] = useState<string | null>(null);

  useEffect(() => {
    setSavedGraphs(loadWorkstationGraphs());

    const params = new URLSearchParams(window.location.search);
    setRequestedGraphId(params.get("graph"));
  }, []);

  const graphGroups = useMemo<ArchitectureGraphGroup[]>(
    () => [
      {
        id: "saved",
        title: copy.savedTitle,
        emptyText: copy.savedEmpty,
        graphs: savedGraphs
      },
      {
        id: "examples",
        title: copy.examplesTitle,
        graphs: exampleGraphs
      }
    ],
    [copy, exampleGraphs, savedGraphs]
  );
  const graphs = useMemo(
    () => [...savedGraphs, ...exampleGraphs],
    [copy, exampleGraphs, savedGraphs]
  );
  const initialGraphId =
    requestedGraphId && graphs.some((graph) => graph.id === requestedGraphId)
      ? requestedGraphId
      : graphs[0]?.id;

  function handleGraphChange(nextGraph: ArchitectureGraph) {
    saveGraphToWorkstation(nextGraph);
    setSavedGraphs((current) => [
      nextGraph,
      ...current.filter((graph) => graph.id !== nextGraph.id)
    ].slice(0, 12));
  }

  return (
    <section className="workstation-page workstation-redesign">
      <div className="workstation-ambient" aria-hidden="true">
        <div className="workstation-glow workstation-glow-a" />
        <div className="workstation-glow workstation-glow-b" />
        <div className="workstation-glow workstation-glow-c" />
        <div className="workstation-sheen" />
      </div>
      <div className="workstation-grain" aria-hidden="true" />
      <div className="workstation-micro-texture" aria-hidden="true" />

      <main className="workstation-app">
        <header className="workstation-nav">
          <Link href="/" className="workstation-brand" aria-label={copy.homeAria}>
            <span className="workstation-mark" aria-hidden="true">
              <svg viewBox="0 0 40 40" fill="none">
                <path
                  d="M20 4.5 33.4 12v15.8L20 35.5 6.6 27.8V12L20 4.5Z"
                  stroke="url(#workstation-mark-gradient)"
                  strokeWidth="2"
                />
                <path
                  d="M20 12.2 26.6 16v7.7L20 27.5l-6.6-3.8V16l6.6-3.8Z"
                  stroke="rgba(217,230,255,.70)"
                  strokeWidth="1.4"
                />
                <path
                  d="M13.4 23.6 20 19.8l6.6 3.8"
                  stroke="rgba(127,156,255,.76)"
                  strokeWidth="1.4"
                />
                <defs>
                  <linearGradient
                    id="workstation-mark-gradient"
                    x1="6"
                    y1="4"
                    x2="35"
                    y2="36"
                  >
                    <stop stopColor="#D9E6FF" />
                    <stop offset=".48" stopColor="#7F9CFF" />
                    <stop offset="1" stopColor="#AA8CFF" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
            <span>SystemCraft</span>
          </Link>

          <div className="workstation-nav-actions">
            <LanguageToggle variant="light" />
            <Link href="/" className="workstation-button">
              {copy.backHome}
            </Link>
            <Link href="/create" className="workstation-button workstation-button-primary">
              {copy.create}
            </Link>
          </div>
        </header>

        <section className="workstation-shell">
          <ArchitectureWorkspace
            editable
            graphs={graphs}
            graphGroups={graphGroups}
            initialGraphId={initialGraphId}
            onGraphChange={handleGraphChange}
          />
        </section>
      </main>
    </section>
  );
}

"use client";

import Link from "next/link";
import { LanguageToggle, useLanguage } from "@/components/i18n/LanguageProvider";

const homeCopy = {
  zh: {
    eyebrow: "可视化 AI 系统架构师",
    titleTop: "从模糊想法",
    titleBottom: "到可信系统。",
    subcopy:
      "一个为创作者和学生准备的智能工作台，把不清晰的 AI 产品想法变成结构化、可检查、可教学的系统蓝图。",
    create: "设计蓝图",
    workstation: "查看工作区示例"
  },
  en: {
    eyebrow: "Visual AI System Architect",
    titleTop: "From vague idea",
    titleBottom: "to verified system.",
    subcopy:
      "A crafted intelligence workspace that turns ambiguous AI product concepts into structured, inspectable, teachable system maps.",
    create: "Design a blueprint",
    workstation: "Workstation example"
  }
};

const diagramCopy = {
  zh: {
    aria: "SystemCraft 可视化架构概念",
    intentNote: "澄清范围",
    kbNote: "知识来源",
    ragNote: "上下文检索",
    llmNote: "推理核心",
    toolsNote: "系统能力",
    verifierNote: "策略和风险",
    humanNote: "复核回路",
    outputNote: "可教学规格",
    looseSignals: "模糊信号",
    reasoningLayer: "推理层",
    verifiedHandoff: "验证交付",
    validation: "验证",
    inspectable: "可检查",
    confidence: "系统可信度",
    grounded: "有依据",
    reliable: "可靠",
    teachable: "可教学",
    ambiguity: "歧义",
    review: "复核",
    caption: "精心构建的智能系统 / 不只是仪表盘"
  },
  en: {
    aria: "SystemCraft visual architecture concept",
    intentNote: "clarify scope",
    kbNote: "grounding source",
    ragNote: "context retrieval",
    llmNote: "reasoning core",
    toolsNote: "capabilities",
    verifierNote: "policy + risk",
    humanNote: "review loop",
    outputNote: "teachable spec",
    looseSignals: "loose signals",
    reasoningLayer: "reasoning layer",
    verifiedHandoff: "verified handoff",
    validation: "Validation",
    inspectable: "Inspectable",
    confidence: "system confidence",
    grounded: "Grounded",
    reliable: "Reliable",
    teachable: "Teachable",
    ambiguity: "Ambiguity",
    review: "Review",
    caption: "crafted intelligence / not a dashboard"
  }
};
export default function HomePage() {
  const { language } = useLanguage();
  const copy = homeCopy[language];

  return (
    <main className="systemcraft-home">
      <div className="crystal-home-shell" data-scene="hero">
        <section
          className="crystal-hero crystal-scene crystal-scene-active"
          aria-labelledby="systemcraft-home-title"
        >
          <div className="crystal-wash" />
          <div className="crystal-grain" />
          <div className="crystal-micro-texture" />

          <div className="crystal-brand">
            <div className="crystal-brand-lockup">
              <CrystalMark />
              <span>SystemCraft</span>
            </div>
            <LanguageToggle />
          </div>

          <section className="crystal-copy">
            <p className="crystal-eyebrow">{copy.eyebrow}</p>
            <h1 id="systemcraft-home-title">
              {copy.titleTop}
              <br />
              {copy.titleBottom}
            </h1>
            <p className="crystal-subcopy">
              {copy.subcopy}
            </p>
            <div className="crystal-actions">
              <Link href="/create" className="crystal-button crystal-button-primary">
                {copy.create}
              </Link>
              <Link href="/workstation" className="crystal-button">
                {copy.workstation}
              </Link>
            </div>
          </section>

          <CrystalDiagram />
        </section>


      </div>
    </main>
  );
}

function CrystalMark() {
  return (
    <span className="crystal-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <path
          d="M20 4.5 33.4 12v15.8L20 35.5 6.6 27.8V12L20 4.5Z"
          stroke="url(#crystal-mark-gradient)"
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
          <linearGradient id="crystal-mark-gradient" x1="6" y1="4" x2="35" y2="36">
            <stop stopColor="#D9E6FF" />
            <stop offset=".48" stopColor="#7F9CFF" />
            <stop offset="1" stopColor="#AA8CFF" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  );
}

function CrystalDiagram() {
  const { language } = useLanguage();
  const copy = diagramCopy[language];

  return (
    <section className="crystal-canvas" aria-label={copy.aria}>
      <div className="crystal-halo" />

      <div className="crystal-idea-card" aria-hidden="true">
        <div className="crystal-spark">*</div>
        <div className="crystal-line crystal-line-l" />
        <div className="crystal-line crystal-line-m" />
        <div className="crystal-line crystal-line-s" />
      </div>

      <svg className="crystal-diagram" viewBox="0 0 980 680" preserveAspectRatio="none">
        <path className="crystal-fine crystal-scratch" d="M86 90 C228 66 368 86 510 66 S774 60 902 96" />
        <path className="crystal-fine crystal-scratch" d="M104 590 C260 552 390 612 548 566 S774 546 892 590" />
        <path className="crystal-fine" d="M240 120 L830 118 L880 575 L190 586 Z" />
        <path className="crystal-fine" d="M285 165 L786 152 L824 525 L240 532 Z" />
        <path className="crystal-fine crystal-dash" d="M242 352 C350 250 500 224 636 264 C744 296 812 366 846 462" />

        <path className="crystal-violet crystal-main" d="M70 390 C140 355 182 367 236 390 C278 408 312 414 356 392" />
        <path className="crystal-violet crystal-fine" d="M60 420 C160 386 206 420 270 426 C304 430 332 418 360 392" />
        <path className="crystal-violet crystal-fine" d="M88 350 C164 350 188 322 242 338 C294 354 312 380 356 392" />
        <circle cx="126" cy="376" r="2.2" fill="rgba(170,140,255,.76)" />
        <circle cx="184" cy="354" r="1.6" fill="rgba(217,230,255,.78)" />
        <circle cx="242" cy="423" r="1.8" fill="rgba(170,140,255,.72)" />
        <circle cx="306" cy="402" r="2.1" fill="rgba(245,248,255,.70)" />

        <path className="crystal-accent" d="M356 392 C386 378 404 370 428 366" />
        <path className="crystal-main" d="M496 354 C526 318 556 296 590 286" />
        <path className="crystal-main" d="M420 514 C452 466 482 412 512 362" />
        <path className="crystal-main" d="M432 490 C454 438 478 392 512 362" />
        <path className="crystal-accent" d="M675 298 C720 308 750 326 778 356" />
        <path className="crystal-green crystal-main" d="M830 390 C822 438 785 482 726 526" />
        <path className="crystal-main crystal-dash" d="M800 428 C734 472 652 476 576 438" />
        <path className="crystal-green crystal-main" d="M724 560 C780 552 820 520 846 474" />
        <path className="crystal-main crystal-dash" d="M642 224 C626 198 632 170 666 146" />
        <path className="crystal-main crystal-dash" d="M702 180 C708 222 696 250 674 278" />

        <path className="crystal-node" d="M386 322 Q386 306 402 304 L486 298 Q504 297 508 314 L518 374 Q522 392 503 396 L410 402 Q390 404 388 384 Z" />
        <text className="crystal-label" x="420" y="348">Intent</text>
        <text className="crystal-note" x="407" y="371">{copy.intentNote}</text>

        <path className="crystal-node" d="M284 472 Q284 456 300 454 L406 448 Q424 447 429 465 L443 532 Q447 551 427 554 L308 561 Q289 562 287 544 Z" />
        <text className="crystal-label" x="330" y="498">KB</text>
        <text className="crystal-note" x="312" y="521">{copy.kbNote}</text>

        <path className="crystal-node" d="M414 452 Q414 436 430 434 L526 428 Q544 427 549 445 L563 512 Q567 531 547 534 L438 541 Q419 542 417 524 Z" />
        <text className="crystal-label" x="456" y="478">RAG</text>
        <text className="crystal-note" x="438" y="501">{copy.ragNote}</text>

        <path className="crystal-node-core" d="M548 236 Q548 219 565 216 L676 208 Q696 206 703 225 L723 314 Q727 334 707 339 L580 348 Q559 350 555 328 Z" />
        <text className="crystal-label" x="601" y="285">LLM</text>
        <text className="crystal-note" x="581" y="308">{copy.llmNote}</text>

        <path className="crystal-node" d="M658 100 Q658 84 674 82 L768 76 Q786 75 791 92 L804 156 Q808 174 790 178 L682 186 Q663 187 661 169 Z" />
        <text className="crystal-label" x="700" y="133">Tools</text>
        <text className="crystal-note" x="684" y="154">{copy.toolsNote}</text>

        <path className="crystal-node" d="M760 334 Q760 318 776 316 L870 310 Q890 309 895 328 L908 402 Q912 422 892 425 L786 432 Q766 433 763 414 Z" />
        <text className="crystal-label" x="797" y="370">Verifier</text>
        <text className="crystal-note" x="785" y="394">{copy.verifierNote}</text>

        <path className="crystal-node" d="M536 398 Q536 381 553 379 L660 373 Q678 372 683 389 L696 458 Q700 478 680 481 L562 488 Q543 489 540 470 Z" />
        <text className="crystal-label" x="573" y="424">Human</text>
        <text className="crystal-note" x="572" y="447">{copy.humanNote}</text>

        <path className="crystal-node" d="M640 522 Q640 506 657 504 L770 498 Q788 497 794 516 L804 576 Q807 595 788 597 L664 603 Q644 604 642 585 Z" />
        <text className="crystal-label" x="684" y="557">Output</text>
        <text className="crystal-note" x="664" y="579">{copy.outputNote}</text>

        <circle className="crystal-accent" cx="634" cy="266" r="22" />
        <path className="crystal-accent" d="M614 260 L654 274 M620 280 L648 250 M612 272 L656 262" opacity=".66" />
        <path className="crystal-green crystal-main" d="M814 346 l22 12 22-12 v31 c0 22-17 34-22 37-5-3-22-15-22-37z" />
        <path className="crystal-green crystal-main" d="M826 376 l8 8 18-22" />

        <text className="crystal-tiny" x="296" y="150">{copy.looseSignals}</text>
        <text className="crystal-tiny" x="560" y="192">{copy.reasoningLayer}</text>
        <text className="crystal-tiny" x="786" y="500">{copy.verifiedHandoff}</text>
        <path className="crystal-fine" d="M286 158 L358 224" />
        <path className="crystal-fine" d="M574 186 L604 220" />
        <path className="crystal-fine" d="M784 490 L738 528" />
      </svg>

      <aside className="crystal-audit" aria-label={copy.validation}>
        <p className="crystal-audit-title">{copy.validation}</p>
        <div className="crystal-score">
          <div className="crystal-ring"><span>92</span></div>
          <div>
            <p className="crystal-score-title">{copy.inspectable}</p>
            <p className="crystal-score-copy">{copy.confidence}</p>
          </div>
        </div>
        <div className="crystal-audit-row"><span>{copy.grounded}</span><span>OK</span></div>
        <div className="crystal-audit-row"><span>{copy.reliable}</span><span>OK</span></div>
        <div className="crystal-audit-row"><span>{copy.teachable}</span><span>OK</span></div>
        <div className="crystal-audit-row crystal-audit-row-warn"><span>{copy.ambiguity}</span><span>{copy.review}</span></div>
      </aside>

      <div className="crystal-floating-caption">{copy.caption}</div>
    </section>
  );
}

# System Craft

System Craft is a visual AI system architect. It turns vague AI product ideas into inspectable, validated, and teachable system blueprints.

The app is built for the Theme A4 idea of moving from prompt user to system architect: users describe an AI product, answer architecture-focused questions, review the generated system graph, inspect risks and trade-offs, simulate a failure path, and export an implementation plan.

## Features

- Typed idea input with architecture clarification questions.
- AI-assisted architecture graph generation with deterministic fallback when no provider key is available.
- Visual graph rendering with node inspection for purpose, ports, configuration, risks, alternatives, cost, and latency.
- Deterministic validation for structural, grounding, privacy, review, tool, and output risks.
- Heuristic architecture scoring with visible disclaimers.
- Simulated failure trace for the graph, including the primary unsupported-citation story.
- JSON and Markdown export from the current architecture.
- Transcript-first narration and design-review flows with bundled demo audio fallback assets.

## Tech Stack

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- React Flow via `@xyflow/react`
- Zod and AJV for runtime and example validation

## Getting Started

Prerequisites: Node.js 18+ and npm.

```bash
npm install
npm run dev
```

The local app starts at:

```text
http://localhost:30021
```

The app works without provider credentials. If `OPENAI_API_KEY` is not set, clarification and architecture generation use deterministic fallback content.

## Environment

Create `.env.local` for private values. Do not commit secrets.

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_MS=12000

ELEVENLABS_API_KEY=
ELEVENLABS_NARRATOR_VOICE_ID=
ELEVENLABS_BUILDER_VOICE_ID=
ELEVENLABS_REVIEWER_VOICE_ID=
ELEVENLABS_MENTOR_VOICE_ID=
ELEVENLABS_TTS_MODEL=eleven_multilingual_v2
ELEVENLABS_DIALOGUE_MODEL=eleven_v3
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128
ELEVENLABS_TIMEOUT_MS=120000
```

OpenAI is optional for graph generation. ElevenLabs is optional for live narration and design-review audio; bundled demo audio keeps the primary demo usable without live quota.

## Scripts

```bash
npm run typecheck
npm run validate:examples
npm run test:validation
npm run test:audio-cache
```

## Routes

- `/` - main visual System Craft experience.
- `/create` - guided idea-to-architecture flow.
- `/workstation` - architecture workstation view.
- `/api/examples` - bundled example graphs.
- `/api/clarify` - architecture clarification.
- `/api/generate-architecture` - model or fallback graph generation.
- `/api/validate` - deterministic graph validation.
- `/api/score` - heuristic architecture scoring.
- `/api/simulate` - simulated trace generation.
- `/api/export` - JSON and Markdown export.

## Transparency Notes

- Simulated traces are educational walkthroughs over the graph; they do not execute real retrieval, policies, tools, or external workflows.
- Scores are heuristic teaching signals, not safety, compliance, or production-readiness guarantees.
- Provider credentials stay server-side.
- Speech recording, transcription, microphone capture, authentication, billing, and real external workflow execution are not part of this app.

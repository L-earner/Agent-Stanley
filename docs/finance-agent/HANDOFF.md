# Finance Analyst Engine Handoff

## Current status

- Phase: **13 complete — all planned status items complete**
- Last completed item: **13.4 — migration decision ADR**
- Next item: None
- Known blockers: **None**
- Root status file: `../../../STATUS.md` from this directory
- Canonical task list: `docs/finance-agent/TODO.md`

`STATUS.md` and `docs/finance-agent/TODO.md` were synced on 2026-05-29 after Phase 13. Keep them in sync when updating progress.

## What this project is building

Refactoring the Pi coding-agent runtime into a **financial research analyst engine**. Users ask questions about public companies using SEC filings, XBRL facts, and earnings call transcripts. The system answers with source-grounded, citation-backed analysis and refuses personalized investment advice.

The product must not behave like a coding agent.

## Architecture snapshot

```
User
  -> Web/App UI
  -> Research Chat API
  -> ResearchAgentRuntime
  -> PiResearchAgentRuntime
     - noTools: "builtin"
     - finance system prompt
     - coding context suppressed
     - custom finance tools only
  -> Finance tools
  -> Research DB repositories / SEC ingestion / transcript ingestion
  -> AnalystAnswer with evidence IDs and verification results
```

`PiResearchAgentRuntime` is the only file that should import `@earendil-works/pi-coding-agent`. Everything else should depend on the framework-neutral `ResearchAgentRuntime` interface or Pi-independent tool core functions.

## Important files

| File | Purpose |
|------|---------|
| `docs/finance-agent/IMPLEMENTATION_PLAN.md` | Full phase-by-phase implementation spec |
| `docs/finance-agent/TODO.md` | Canonical task list; currently synced with root `STATUS.md` |
| `docs/finance-agent/ARCHITECTURE.md` | Architecture notes and decisions |
| `docs/finance-agent/adr/` | Architecture Decision Records |
| `packages/research-agent/src/runtime/ResearchAgentRuntime.ts` | Framework-neutral runtime interface |
| `packages/research-agent/src/runtime/PiResearchAgentRuntime.ts` | Pi SDK adapter |
| `packages/research-agent/src/runtime/PiCoreResearchAgentRuntime.ts` | Direct pi-agent-core migration adapter |
| `packages/research-agent/src/evals/` | Offline eval cases and local runner |
| `packages/research-agent/src/prompts/financeSystemPrompt.ts` | Finance system prompt |
| `packages/research-agent/src/tools/` | Finance tool core logic and Pi wrappers |
| `packages/research-agent/src/verification/` | Citation, advice, and unsupported-claim checks |
| `packages/research-db/src/` | Schema, repository interfaces, in-memory repos, retrieval |
| `packages/sec-ingestion/src/` | SEC/API Ninjas client, filing download, parsing, XBRL |
| `packages/transcript-ingestion/src/` | Transcript provider, parser, ingestor |
| `packages/web-app/src/server.ts` | Node HTTP server with `/api/research/chat` SSE endpoint |
| `packages/web-app/src/observability.ts` | Request logging helpers with redacted query metadata |
| `packages/web-app/src/sseSerializer.ts` | ResearchAgentEvent to SSE frame serialization |
| `packages/web-app/src/toolDeps.ts` | In-memory repo and provider wiring for finance tools |
| `packages/web-app/public/index.html` | Minimal chat UI with evidence, caveats, and error states |

## Completed phases

- Phase 0: Discovery and docs
- Phase 1: Runtime isolation
- Phase 2: Data contracts
- Phase 3: SEC client
- Phase 4: Filing ingestion
- Phase 5: XBRL and metrics
- Phase 6: Retrieval
- Phase 7: Agent tools
- Phase 8: Transcripts
- Phase 9: Analyst answer flow
- Phase 10: Verification and guardrails
- Phase 11: App integration
- Phase 12: Evals and hardening
- Phase 13: Optional pi-agent-core migration review

Current research-agent test status from the latest status file: **85/85 passing**. Web app tests: **6/6 passing**. Local evals: **5/5 passing**.

## Key decisions and constraints

- Use `@earendil-works/pi-coding-agent` for now, isolated behind `PiResearchAgentRuntime`.
- Always set `noTools: "builtin"` in product runtime.
- Suppress coding-agent context with `agentsFilesOverride`, `skillsOverride`, and `promptsOverride`.
- Only finance `customTools` should be exposed to the product agent.
- LLM setup must remain provider-agnostic: `PiResearchAgentRuntime` uses Pi's `AuthStorage` and `ModelRegistry`; optional `PI_RESEARCH_MODEL` / `PI_MODEL` values use `provider/model-id`.
- Keep tool business logic outside Pi wrappers so it can migrate later.
- SEC filing downloads require `SEC_USER_AGENT`.
- API Ninjas calls require `API_NINJAS_KEY`.
- Tests must use fixtures/mocks and never hit live SEC/API Ninjas endpoints.
- Structured numeric values should come from XBRL facts, not model memory.
- Final answers must be built through `submit_answer` / `buildAnalystAnswer()` so verification runs.
- Personalized buy/sell/hold advice must be refused or reframed.

## Next Recommended Work

All planned checklist items in `STATUS.md` are complete. The next useful work is productionization beyond the original plan:

1. Implement the SQLite + Drizzle persistent repository adapter selected in ADR 0002.
2. Add a real deployment configuration and secret management path for Pi provider credentials, API Ninjas, and SEC user-agent.
3. Expand local evals into scenario-level answer-quality evals once a stable fixture runtime is available.
4. Decide whether transcript retrieval is enabled in production after provider licensing review.

## How to run checks

Run commands from the repo root.

```bash
npm install
npm run build
npm test
npm run check

cd packages/research-agent
npx vitest --run
npm run typecheck
```

The Pi source repo has 3 pre-existing failing tests in `pi-ai` / `pi-coding-agent` related to Node.js 22 `.ts` execution. They are noted as not caused by this finance-agent work.

## Environment

Expected runtime:

```bash
SEC_USER_AGENT="AppName contact@example.com"
API_NINJAS_KEY="..."
DATABASE_URL="postgres://..." # future production target
OPENAI_API_KEY="..." # or any Pi-supported provider credential
PI_RESEARCH_MODEL="openai/gpt-5.4" # optional; provider/model-id
TRANSCRIPT_PROVIDER="fixture"
```

`.replit` has been updated to `nodejs-22`; the shell may need a restart for that to take effect.

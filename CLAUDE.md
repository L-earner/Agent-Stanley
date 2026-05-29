# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

A **financial research analyst engine** built on the Pi coding-agent runtime (Earendil Works). It answers questions about public companies using SEC filings (10-K, 10-Q), XBRL facts, and earnings call transcripts. All 13 planned phases are implemented and passing tests (85/85 research-agent, 6/6 web-app, 5/5 evals).

Reference docs live under `pi/docs/finance-agent/`: `ARCHITECTURE.md`, `HANDOFF.md`, `TODO.md`, ADRs.

## Environment

Node.js 22 (`.replit` updated to nodejs-22). Pi monorepo requires `>=22.19.0`. npm workspaces. Linter: biome (tabs, indent 3, line 120). Test runner: vitest. All work lives in `pi/`.

## Commands (run from `pi/`)

```bash
# Build — tui → ai → agent → coding-agent dependency order
npm run build

# If ai package scripts fail, build ai manually first:
cd packages/ai && npx tsx scripts/generate-models.ts && npx tsx scripts/generate-image-models.ts && npx tsgo -p tsconfig.build.json

# Lint + typecheck
npm run check

# Test all workspaces
npm test

# Test a single package
cd packages/research-agent && npx vitest --run
cd packages/research-db && npx vitest --run
cd packages/sec-ingestion && npx vitest --run
cd packages/web-app && npx vitest --run

# Run a single test file
cd packages/research-agent && npx vitest --run test/runtime.test.ts

# Offline evals (fixture-backed, no LLM calls)
cd packages/research-agent && npm run eval

# Run the web server (dev — hot reload)
npm run dev
# Production
npm start
```

## Package Structure

```
pi/packages/
  research-agent/src/
    runtime/
      ResearchAgentRuntime.ts          ← framework-neutral interface (no Pi import)
      PiResearchAgentRuntime.ts        ← ONLY file that imports @earendil-works/pi-coding-agent
      PiCoreResearchAgentRuntime.ts    ← direct pi-agent-core adapter (migration path, not prod default)
    prompts/financeSystemPrompt.ts
    tools/                             ← one file per tool; core logic separate from Pi defineTool wrapper
    types/                             ← AnalystAnswer, Evidence
    verification/                      ← citationVerifier, financialAdviceGuard, unsupportedClaimChecker
    answerFormatter.ts
    evals/                             ← localEvalRunner + evalCases (fixture-backed)
  sec-ingestion/src/
    ninjasClient.ts                    ← API Ninjas /v1/sec wrapper (API_NINJAS_KEY env)
    rateLimiter.ts                     ← token-bucket, default 10 req/s
    filingDownloader.ts                ← SEC HTML download with User-Agent header
    sectionizer.ts                     ← 10-K (Items 1/1A/7/7A/8/9A) and 10-Q (Part I/II) splitting
    chunker.ts                         ← 700-token target, 100-token overlap, SHA-256 dedup
    xbrlFacts.ts                       ← normalizeCompanyFacts(), CONCEPT_ALIASES, XbrlIngestor
    ingestionPipeline.ts               ← full flow: Ninjas → download → clean → sectionize → chunk → store
    fixtures/                          ← aapl-10k.json, aapl-10q.json (tests use these, never live API)
  transcript-ingestion/src/
    TranscriptProvider.ts              ← interface: searchTranscripts + fetchTranscript
    providers/                         ← NinjasTranscriptProvider (API_NINJAS_KEY), fixture provider
    transcriptParser.ts                ← transcript_split (premium) + raw text fallback
    transcriptIngestor.ts
    transcriptSearch.ts                ← standalone BM25 for TranscriptChunk[]
    fixtures/                          ← aapl-transcript-search.json, aapl-transcript.json
  research-db/src/
    schema.ts                          ← Company, Filing, FilingChunk, XbrlFact, Transcript, TranscriptChunk, Evidence
    repositories/                      ← interfaces + in-memory implementations (7 repos)
    search/
      lexicalSearch.ts                 ← BM25
      vectorSearch.ts                  ← cosine similarity, EmbeddingProvider interface
      hybridSearch.ts                  ← Reciprocal Rank Fusion (RRF, k=60) + pluggable rerank
  web-app/src/
    server.ts                          ← Node HTTP server, /api/research/chat SSE endpoint
    sseSerializer.ts                   ← ResearchAgentEvent → SSE frame
    toolDeps.ts                        ← in-memory repo + provider wiring for all finance tools
    observability.ts                   ← request logging with redacted query metadata
    public/index.html                  ← minimal chat UI with evidence panel and caveats
```

## Architecture

```
User query
  → /api/research/chat (SSE)
  → ResearchAgentRuntime.stream()
  → Pi agent loop (finance prompt, noTools:"builtin", custom tools only)
      resolve_company → Company { companyId, cik }
      list_filings → Filing[]
      ingest_company_filings → filing chunks + XBRL facts stored
      retrieve_filing_passages → Evidence[] (hybrid BM25 + cosine + RRF)
      get_xbrl_facts → XbrlFact[] (EDGAR companyfacts JSON)
      compute_metric → MetricResult { value, inputs[evidenceId] }
      retrieve_transcript_passages → Evidence[] (speaker-attributed)
      submit_answer → AnalystAnswer (triggers verification before emit)
  → AnalystAnswer { answer, keyPoints[], tables[], caveats[], sources[], verification }
  → SSE events: text_delta | tool_start | tool_result | evidence | final
```

## Key Rules

### Pi SDK isolation
- `PiResearchAgentRuntime.ts` is the **only** file that imports `@earendil-works/pi-coding-agent`. All other code depends on `ResearchAgentRuntime` (interface) or Pi-independent core functions.
- Always set `noTools: "builtin"` — disables bash, edit, write, grep in the product runtime.
- Suppress Pi's coding-agent context with `agentsFilesOverride`, `skillsOverride`, `promptsOverride`.
- LLM setup must be provider-agnostic: use Pi's `AuthStorage` + `ModelRegistry`; set model via `PI_RESEARCH_MODEL` or `PI_MODEL` as `provider/model-id`.

### Tool pattern
Keep business logic outside the Pi `defineTool` wrapper so it survives an SDK migration:
```ts
export async function resolveCompanyCore(input, deps): Promise<Output> { ... }  // test this directly
export function createResolveCompanyTool(deps) { return defineTool({ ..., execute: resolveCompanyCore }) }
```

### Data layer
- SEC filing list comes from API Ninjas `/v1/sec` (ticker + form → filing URLs). CIK is extracted from returned URLs for XBRL calls.
- XBRL structured facts are the authoritative source for numeric values (revenue, margins, EPS) — never model memory.
- Every `compute_metric` result returns `inputs[]` with one `evidenceId` per input fact. Missing facts → explicit error, not a silent fallback.
- All `Evidence` objects carry a stable `id`; the final `AnalystAnswer` references only evidence IDs.

### Testing
- All tests use fixtures/mocks. Never make real HTTP calls to SEC EDGAR or API Ninjas in tests.
- Inject `fetch` into clients so tests can substitute a stub without patching globals.
- The Pi source repo has 3 pre-existing failing tests in `pi-ai` / `pi-coding-agent` (require Node 22 for direct `.ts` execution). Not caused by this project.

### Guardrails
- Personalized buy/sell/hold advice must be refused — `financialAdviceGuard` has 13 regex patterns.
- `citationVerifier` checks every `evidenceId` in the answer exists in the retrieved set.
- `unsupportedClaimChecker` flags company-specific numeric or quote claims without evidence.
- All three run via `runVerification()` inside `buildAnalystAnswer()` before the `final` event is emitted.

### Transcript licensing
- `TranscriptProvider` interface only. `NinjasTranscriptProvider` is implemented but requires `API_NINJAS_KEY`. Do not add paid providers without documenting license terms, storage rights, and attribution in an ADR under `docs/finance-agent/adr/`.

## Environment Variables

```
SEC_USER_AGENT="AppName contact@example.com"   # required for EDGAR filing downloads; fail fast if absent
API_NINJAS_KEY="..."                           # required for Ninjas SEC client and transcript provider
OPENAI_API_KEY="..."                           # or any Pi-supported provider credential
PI_RESEARCH_MODEL="openai/gpt-5.4"             # optional; provider/model-id format
TRANSCRIPT_PROVIDER="fixture"                  # default for dev/test
DATABASE_URL="postgres://..."                  # future production target (SQLite + Drizzle selected in ADR 0002)
```

## Session Workflow

- Update `STATUS.md` (root) and `pi/docs/finance-agent/TODO.md` together — keep them in sync.
- Update `pi/docs/finance-agent/HANDOFF.md` at the end of every meaningful session.
- Mark a TODO item complete only after implementation, tests, and docs are updated.

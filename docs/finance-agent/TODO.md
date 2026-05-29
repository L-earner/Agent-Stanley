# Finance Analyst Engine — Implementation Status

> Canonical copy also at: `pi/docs/finance-agent/TODO.md` — keep both in sync when updating.

## Current status
- Phase: **13 complete — all planned status items complete**
- Last completed item: 13.4 — migration decision ADR
- Current item: None
- Known blockers: **None.** `.replit` updated to `nodejs-22`; takes effect after Replit shell restart.
- Note: `pi-ai` and `pi-coding-agent` packages have 3 pre-existing failing tests in the Pi source repo (require Node.js 22 to run `.ts` files directly). Not caused by our code.

## What was done this session (2026-05-29)

### Repo setup
- Cloned `https://github.com/earendil-works/pi` into `workspace/pi/`
- Pi is an npm workspace monorepo: packages `coding-agent` (v0.77.0), `agent-core`, `ai`, `tui`
- Build tool: `tsgo` (TypeScript native preview). Linter: biome (tabs, indent 3, line 120). Tests: vitest.
- `npm install` run successfully from `workspace/pi/`
- Pi packages built in order: tui → ai (via tsx workaround) → agent → coding-agent
- Node.js version: was v20, updated `.replit` to `nodejs-22` (needs shell restart to activate)

### Files created
```
workspace/
  STATUS.md                                    ← this file
  CLAUDE.md                                    ← updated with build commands and architecture

workspace/pi/
  docs/finance-agent/
    IMPLEMENTATION_PLAN.md                     ← copy of root PI_FINANCE_ANALYST_ENGINE_IMPLEMENTATION_PLAN.md
    TODO.md                                    ← canonical task list (mirrors this file)
    HANDOFF.md                                 ← session handoff notes
    ARCHITECTURE.md                            ← architecture overview
    adr/0001-agent-runtime-choice.md           ← decision: use pi-coding-agent SDK

  packages/research-agent/
    package.json                               ← @earendil-works/pi-research-agent v0.1.0
    tsconfig.build.json
    vitest.config.ts
    src/
      index.ts
      runtime/
        ResearchAgentRuntime.ts                ← framework-neutral interface (no Pi import)
        PiResearchAgentRuntime.ts              ← Pi SDK adapter (ONLY file that imports Pi)
      prompts/
        financeSystemPrompt.ts                 ← full finance system prompt
      tools/
        index.ts                               ← buildFinanceTools()
        echoResearchTool.ts                    ← Phase 1 stub tool for smoke testing
      types/
        AgentAnswer.ts                         ← AnalystAnswer type
        Evidence.ts                            ← Evidence type
    test/
      runtime.test.ts                          ← 7 tests, all passing ✓
```

### Phase 1 test results (7/7 passing)
- ✓ Streams a text_delta event from a prompt
- ✓ `noTools: "builtin"` is set — disables bash, edit, write, read
- ✓ customTools contains only `echo_research_tool` — no coding tools
- ✓ Finance system prompt is used (not Pi's coding-agent default)
- ✓ Prompt does not self-identify as a coding agent
- ✓ Prompt requires evidence for claims
- ✓ Prompt prohibits personalized investment advice

## Task list

### Phase 0 — Discovery and docs ✅
- [x] 0.1 Inspect repository structure, package manager, app framework, and test commands.
- [x] 0.2 Identify existing Pi dependency/version and integration points.
- [x] 0.3 Create docs/finance-agent/TODO.md.
- [x] 0.4 Create docs/finance-agent/HANDOFF.md.
- [x] 0.5 Create docs/finance-agent/ARCHITECTURE.md.
- [x] 0.6 Create docs/finance-agent/adr/0001-agent-runtime-choice.md.
- [x] 0.7 Copy implementation plan to docs/finance-agent/IMPLEMENTATION_PLAN.md.

### Phase 1 — Runtime isolation ✅
- [x] 1.1 Create ResearchAgentRuntime interface.
- [x] 1.2 Create PiResearchAgentRuntime adapter.
- [x] 1.3 Add finance system prompt.
- [x] 1.4 Disable built-in Pi coding tools via `noTools: "builtin"`.
- [x] 1.5 Add `echo_research_tool` stub tool.
- [x] 1.6 Tests passing — bash/edit/write confirmed unavailable, finance prompt confirmed active.

### Phase 2 — Data contracts ✅
- [x] 2.1 Add Company, Filing, FilingSection, FilingChunk, XbrlFact, Transcript, TranscriptChunk, Evidence types in `packages/research-db/src/schema.ts`.
- [x] 2.2 Add repository interfaces (CompanyRepository, FilingRepository, FilingChunkRepository, XbrlFactRepository, TranscriptRepository, TranscriptChunkRepository, EvidenceRepository).
- [x] 2.3 Add in-memory implementations for all 7 repositories.
- [x] 2.4 DB adapter decision: SQLite + Drizzle ORM. Recorded in `docs/finance-agent/adr/0002-database-choice.md`.

### Phase 3 — SEC client ✅
> **Design change:** Using API Ninjas `/v1/sec` endpoint (ticker+form → filing URLs) instead of raw EDGAR submissions API. Simpler, no CIK resolution needed upfront. CIK still extracted from filing URLs for XBRL Phase 5.
- [x] 3.1 `NinjasSecClient` — wraps API Ninjas SEC endpoint. API key via `API_NINJAS_KEY` env var (never hard-coded).
- [x] 3.2 `RateLimiter` — token-bucket, configurable req/sec.
- [x] 3.3 `FilingDownloader` — downloads SEC HTML with `User-Agent` header via `SEC_USER_AGENT` env var.
- [x] 3.4 `cikUtils` — `normalizeCik`, `extractCikFromUrl`, `companyFactsUrl`, `submissionsUrl`.
- [x] 3.5 Fixtures: `aapl-10k.json`, `aapl-10q.json` — used in tests, no live API calls.
- [x] 3.6 All implemented with injected `fetch` so tests never make real HTTP calls.
- [x] 3.7 25 fixture-based tests passing.

### Phase 4 — Filing ingestion ✅
- [x] 4.1 `filingParser.ts` — `NinjasFilingResult` → `Filing` row (accession number, CIK, stable hash ID).
- [x] 4.2 `filingDownloader.ts` — downloads SEC HTML (already in Phase 3, wired into pipeline).
- [x] 4.3 `htmlCleaner.ts` — strips script/style/tags, decodes entities, normalises whitespace.
- [x] 4.4 `sectionizer.ts` — 10-K: Items 1, 1A, 1B, 2, 3, 7, 7A, 8, 9A. Line-start anchored to prevent inline-ref false positives.
- [x] 4.5 `sectionizer.ts` — 10-Q: Part I Items 1–4, Part II Items 1 & 1A. Splits on 2nd PART II occurrence to skip TOC.
- [x] 4.6 `chunker.ts` — target 700 tokens / 4 chars-per-token, 100-token overlap, sentence-boundary-aware, SHA-256 dedup hash.
- [x] 4.7 `ingestionPipeline.ts` — full flow: API Ninjas → download → clean → sectionize → chunk → dedup → store. Idempotent.
- [x] 4.8 `SectionizerDiagnostics` returned with every sectionize call: totalMatches, tocSkipped, sectionsExtracted, missingSections.

### Phase 5 — XBRL and metrics ✅
- [x] 5.1 Normalize companyfacts JSON — `normalizeCompanyFacts()` in `xbrlFacts.ts`.
- [x] 5.2 Add common concept aliases — `CONCEPT_ALIASES` map + `resolveAlias()`.
- [x] 5.3 Store XBRL facts — `XbrlIngestor.ingest()` uses `XbrlFactRepository`.
- [x] 5.4 Implement get_xbrl_facts core logic — `getXbrlFactsCore()` with alias resolution.
- [x] 5.5 Implement compute_metric core logic — `computeMetric()` for 5 metrics.
- [x] 5.6 Tests for all 5 metrics — 31 new tests, 125 total passing.

### Phase 6 — Retrieval ✅
- [x] 6.1 `lexicalSearch.ts` — BM25 scoring, tokenization, section/filing/form filters.
- [x] 6.2 `vectorSearch.ts` — `EmbeddingProvider` interface, cosine similarity, in-memory scan. `DeterministicEmbeddingProvider` for tests.
- [x] 6.3 `hybridSearch.ts` — Reciprocal Rank Fusion (RRF, k=60) merges lexical + vector lists.
- [x] 6.4 `RerankFn` hook — pluggable, pass-through by default.
- [x] 6.5 `searchResultToEvidence()` — wraps top-k chunks as `Evidence` objects with metadata.
- [x] 6.6 43 search tests covering BM25, cosine, RRF, section filters, evidence creation.

### Phase 7 — Agent tools ✅
- [x] 7.1 `resolveCompanyTool.ts` — lookup by ticker, name, CIK; returns companyId.
- [x] 7.2 `listFilingsTool.ts` — list available filings by companyId + form filter.
- [x] 7.3 `ingestCompanyFilingsTool.ts` — full flow: Ninjas API → chunks + XBRL; creates Company record.
- [x] 7.4 `retrieveFilingPassagesTool.ts` — hybrid search over chunks; returns passages + evidenceIds.
- [x] 7.5 `getXbrlFactsTool.ts` — alias-based XBRL fact lookup; companyId → CIK resolution.
- [x] 7.6 `computeMetricTool.ts` — 5 metrics with full evidence chain.
- [x] 7.7 28 tool core tests + updated runtime tests for 6 finance tool names.
- [x] Bug fix: `ingestionPipeline.ts` `createdAt` removed from chunkRepo.create call (type error).
- [x] `IngestFilingsResult` now includes `cik`; `XbrlIngestResult` now includes `entityName`.

### Phase 8 — Transcripts ✅
- [x] 8.1 `TranscriptProvider` interface — `searchTranscripts` + `fetchTranscript`.
- [x] 8.2 `NinjasTranscriptProvider` — wraps `/v1/earningstranscriptsearch` + `/v1/earningstranscript`. API key via `API_NINJAS_KEY` env var (never hard-coded).
- [x] 8.3 `transcriptParser.ts` — `transcript_split` path (premium, speaker-attributed) + raw text fallback. Maps `speaker_type`+`role` to `SpeakerRole` (CEO/CFO/Analyst/Operator/Other).
- [x] 8.4 `transcriptIngestor.ts` — fetch + parse + dedup + store. Idempotent, `forceRefresh` supported.
- [x] 8.5 `retrieveTranscriptPassagesTool.ts` — BM25 over transcript chunks, section/role/fiscal filters, evidenceId per passage.
- [x] 8.6 Fixtures: `aapl-transcript-search.json` (8 quarters), `aapl-transcript.json` (Q4 2023 with transcript_split). 26 tests, all passing.
- [x] `transcriptSearch.ts` — standalone BM25 for TranscriptChunk[], reuses `tokenize` from research-db.
- [x] New package: `@earendil-works/pi-transcript-ingestion`. `FinanceToolDeps` extended with transcriptRepo, transcriptChunkRepo, transcriptProvider.

### Phase 9 — Analyst answer flow ✅
- [x] 9.1 `AnalystAnswer` type already in `types/AgentAnswer.ts` — wired into answer flow.
- [x] 9.2 `submitAnswerTool.ts` — `submit_answer` Pi tool. Callback-injection pattern: `onAnswer` fires immediately when agent calls tool, queuing the `final` stream event.
- [x] 9.3 `answerFormatter.ts` — `collectEvidenceIds`, `findOrphanedEvidenceIds`, `annotateOrphanedIds`, `sanitizeSubmitParams`.
- [x] 9.4 `PiResearchAgentRuntime` updated: injects `submit_answer` per-session, emits `{ type: "final", answer: AnalystAnswer }` as soon as tool is called.
- [x] 9.5 Runtime test updated: mock simulates `submit_answer` tool call, 2 new tests verify `final` event content. `tools.test.ts` covers `buildAnalystAnswer` + formatter utilities (8 tests).

### Phase 10 — Verification and guardrails ✅
- [x] 10.1 Implement citation verifier — `verification/citationVerifier.ts`: checks every evidenceId in keyPoints/tables has a matching source entry.
- [x] 10.2 Implement financial advice guard — `verification/financialAdviceGuard.ts`: 13 regex patterns for buy/sell/hold recommendations; sets `supported:false` and adds warning.
- [x] 10.3 Implement unsupported claim checker — `verification/unsupportedClaimChecker.ts`: flags keyPoints with empty evidenceIds.
- [x] 10.4 Integrate verification — `runVerification()` in `verification/index.ts` runs all three checks; wired into `buildAnalystAnswer()`.
- [x] 10.5 Tests — `test/verification.test.ts`: 30 tests covering all three checkers, combined runner, and `buildAnalystAnswer` integration.

### Phase 11 — App integration ✅
- [x] 11.1 Add research chat API endpoint — `packages/web-app/src/server.ts`.
- [x] 11.2 Add streaming events — SSE serialization in `packages/web-app/src/sseSerializer.ts`.
- [x] 11.3 Add minimal chat UI — `packages/web-app/public/index.html`.
- [x] 11.4 Add evidence panel — final answer source toggle/list in the chat UI.
- [x] 11.5 Add UI error and caveat states — error messages, caveats, and verification warnings.

### Phase 12 — Evals and hardening ✅
- [x] 12.1 Add eval cases — `packages/research-agent/src/evals/evalCases.ts`.
- [x] 12.2 Add local eval runner — `packages/research-agent/src/evals/localEvalRunner.ts`, `npm run eval --workspace @earendil-works/pi-research-agent`.
- [x] 12.3 Add logging/observability — `packages/web-app/src/observability.ts`, wired into `/api/research/chat` with request IDs, durations, redacted message length, and event counts.
- [x] 12.4 Add caching strategy — recorded in `docs/finance-agent/adr/0003-caching-and-refresh-strategy.md`.
- [x] 12.5 Add data refresh strategy — recorded in `docs/finance-agent/adr/0003-caching-and-refresh-strategy.md`.
- [x] 12.6 Review transcript licensing — recorded in `docs/finance-agent/adr/0004-transcript-licensing.md`.

### Phase 13 — Optional pi-agent-core migration ✅
- [x] 13.1 Review pi-agent-core API — recorded in `docs/finance-agent/adr/0005-pi-agent-core-migration.md`.
- [x] 13.2 Implement alternate runtime behind ResearchAgentRuntime — `packages/research-agent/src/runtime/PiCoreResearchAgentRuntime.ts`.
- [x] 13.3 Compare behaviour and tests — `packages/research-agent/test/piCoreRuntime.test.ts`.
- [x] 13.4 Record migration decision in ADR — `docs/finance-agent/adr/0005-pi-agent-core-migration.md`.

## Completion log

| Date       | Task | Notes | Tests |
|------------|------|-------|-------|
| 2026-05-28 | 0.1–0.7 | Phase 0 complete. Pi repo cloned. Monorepo explored. All docs created. | N/A |
| 2026-05-28 | 1.1–1.6 | Phase 1 complete. Runtime interface, Pi adapter, finance prompt, echo tool, types. Built Pi packages. `.replit` updated to nodejs-22. | 7/7 ✓ |
| 2026-05-28 | 2.1–2.4 | Phase 2 complete. research-db package created. All 7 schema types + repository interfaces + in-memory impls. ADR 0002 (SQLite+Drizzle). | 31/31 ✓ |
| 2026-05-29 | 3.1–3.7 | Phase 3 complete. sec-ingestion package: NinjasSecClient (API Ninjas /v1/sec), RateLimiter, FilingDownloader, cikUtils. API key via env var. Injected fetch for tests. | 25/25 ✓ |
| 2026-05-29 | 4.1–4.8 | Phase 4 complete. HTML cleaner, 10-K/10-Q sectionizer (line-start anchored), chunker, filing parser, full ingestion pipeline. 2 fixture HTML files. | 56/56 ✓ |
| 2026-05-29 | 5.1–5.6 | Phase 5 complete. XBRL normalization, concept aliases (revenue/gross_profit/etc.), XbrlIngestor, getXbrlFactsCore, computeMetric (5 metrics). Fixed CIK prefix bug in companyFactsUrl. | 87/87 sec-ingestion, 125 total ✓ |
| 2026-05-29 | 6.1–6.6 | Phase 6 complete. BM25 lexical, cosine vector scan, RRF hybrid merge, pluggable rerank, Evidence wrapping. DeterministicEmbeddingProvider for tests. All in research-db/src/search/. | 74/74 research-db, 168 total ✓ |
| 2026-05-29 | 7.1–7.7 | Phase 7 complete. 6 finance tools: resolve_company, list_filings, ingest_company_filings, retrieve_filing_passages, get_xbrl_facts, compute_metric. FinanceToolDeps type. Stub mode for runtime tests. Fixed createdAt type error in ingestion pipeline. | 35/35 research-agent, 196 total ✓ |
| 2026-05-29 | 8.1–8.6 | Phase 8 complete. New package pi-transcript-ingestion. NinjasTranscriptProvider for both Ninjas transcript endpoints. Parser handles premium transcript_split + raw text fallback. BM25 search. retrieve_transcript_passages tool (7th tool). 26 new tests. | 40/40 research-agent, 227 total ✓ |
| 2026-05-29 | 9.1–9.5 | Phase 9 complete. submit_answer tool (per-session, callback injection). answerFormatter utilities. PiResearchAgentRuntime now emits final event. System prompt updated with submit_answer rules. Runtime mock updated for end-to-end flow. | 50/50 research-agent, 237 total ✓ |
| 2026-05-29 | 10.1–10.5 | Phase 10 complete. citationVerifier (orphaned evidenceIds), financialAdviceGuard (13 regex patterns), unsupportedClaimChecker (empty evidenceIds). Combined runVerification() wired into buildAnalystAnswer(). 30 new tests in verification.test.ts. | 80/80 research-agent, 267 total ✓ |
| 2026-05-29 | 11.1–11.5 | Phase 11 complete. Web app package has `/api/research/chat` SSE endpoint, event serializer, runtime/tool dependency wiring, minimal chat UI, evidence panel, caveats, and error states. Added injectable server factory and API/SSE tests. Fixed research-agent build compatibility issues exposed by app integration. | 5/5 web-app, 80/80 research-agent, 272 finance total ✓ |
| 2026-05-29 | LLM setup | Rewired `PiResearchAgentRuntime` to accept provider-agnostic Pi model references via `PI_RESEARCH_MODEL` / `PI_MODEL` and pass the resolved model into `createAgentSession`. Removed Anthropic-only app warning; Pi now uses its normal multi-provider auth/model registry path. | 82/82 research-agent, 5/5 web-app ✓ |
| 2026-05-29 | 12.1–12.6 | Phase 12 complete. Added fixture-backed local eval cases and runner, web request observability, and ADRs for caching, refresh, and transcript licensing. | 85/85 research-agent, 6/6 web-app, eval 5/5 ✓ |
| 2026-05-29 | 13.1–13.4 | Phase 13 complete. Reviewed direct pi-agent-core API, added `PiCoreResearchAgentRuntime`, added comparison smoke test, and recorded migration decision. | 85/85 research-agent ✓ |

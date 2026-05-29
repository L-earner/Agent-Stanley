# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

A **financial research analyst engine** (`agent-stanley`) built on the Pi coding-agent runtime (Earendil Works). It answers questions about public companies using SEC filings (10-K, 10-Q), XBRL facts, and earnings call transcripts. All 13 planned phases are implemented and passing tests (85/85 research-agent, 6/6 web-app, 5/5 evals).

The project ships in two forms:
- **Global CLI binary** (`agent-stanley` on npm) — esbuild-bundled from `packages/web-app/src/cli.ts` into `dist/agent-stanley.js`
- **Publishable npm packages** — `@earendil-works/pi-research-db`, `@earendil-works/pi-sec-ingestion`, `@earendil-works/pi-transcript-ingestion`, `@earendil-works/pi-research-agent`

Reference docs live under `docs/finance-agent/`: `ARCHITECTURE.md`, `HANDOFF.md`, `TODO.md`, and ADRs (5 decisions in `adr/`: agent-runtime-choice, database-choice, caching-and-refresh-strategy, transcript-licensing, pi-agent-core-migration).

Additional development rules are in `AGENTS.md` at the repo root.

## Environment

Node.js `>=22.19.0`. npm workspaces monorepo. Build tool: `tsgo` (`@typescript/native-preview`). Linter: biome (tabs, indent 3, line 120). Test runner: vitest.

## Commands (run from repo root)

```bash
# After ANY code change — lint + typecheck (full output, no tail). Fix all errors before continuing.
npm run check

# Run all tests without API keys (use this, not npm test)
./test.sh

# Run a single package's tests
cd packages/research-agent && node ../../node_modules/vitest/dist/cli.js --run
cd packages/research-db && node ../../node_modules/vitest/dist/cli.js --run
cd packages/sec-ingestion && node ../../node_modules/vitest/dist/cli.js --run
cd packages/web-app && node ../../node_modules/vitest/dist/cli.js --run

# Run a single test file
cd packages/research-agent && node ../../node_modules/vitest/dist/cli.js --run test/runtime.test.ts

# Offline evals (fixture-backed, no LLM calls)
cd packages/research-agent && npm run eval

# Build all workspace packages (tui → ai → agent → coding-agent → finance packages → research-tui)
npm run build

# If the ai package model-generation scripts fail, build ai manually first:
cd packages/ai && npx tsx scripts/generate-models.ts && npx tsx scripts/generate-image-models.ts && npx tsgo -p tsconfig.build.json

# Build the npm-publishable CLI bundle (esbuild → dist/agent-stanley.js)
npm run build:npm

# Run the web server (dev — hot reload via --watch)
npm run dev
# Production
npm start

# Run the terminal UI
npm run tui
```

Do not run `npm run build` or `npm test` unless the user explicitly requests it. `./test.sh` is the correct test command — it unsets all provider API keys and moves auth.json aside to prevent accidental live calls. The full vitest suite includes e2e tests that activate when endpoint/auth env vars are present; `./test.sh` prevents this.

For ad-hoc scripts, write them to `/tmp`, run, edit if needed, then remove. Don't embed multi-line scripts in bash commands.

## Package Structure

```
packages/
  research-agent/src/
    runtime/
      ResearchAgentRuntime.ts          ← framework-neutral interface (no Pi import)
      PiResearchAgentRuntime.ts        ← ONLY file that imports @earendil-works/pi-coding-agent
      PiCoreResearchAgentRuntime.ts    ← direct pi-agent-core adapter (migration path, not prod default)
    prompts/financeSystemPrompt.ts
    tools/
      toolDeps.ts                      ← FinanceToolDeps type (DI contract injected into every tool)
      index.ts                         ← buildFinanceTools()
      resolveCompanyTool.ts            ← and one file per tool (core logic + Pi wrapper separately)
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
    cli.ts                             ← npm package entry point (agent-stanley binary)
    server.ts                          ← Node HTTP server, /api/research/chat SSE endpoint
    sseSerializer.ts                   ← ResearchAgentEvent → SSE frame
    toolDeps.ts                        ← in-memory repo + provider wiring for all finance tools
    observability.ts                   ← request logging with redacted query metadata
    public/index.html                  ← minimal chat UI with evidence panel and caveats
  research-tui/src/
    cli.ts                             ← entry point (npm run tui)
    research-tui.ts                    ← TUI orchestrator: input, streaming loop, turn management
    tool-deps.ts                       ← same wiring as web-app/toolDeps.ts
    theme.ts                           ← ANSI color helpers + MarkdownTheme
    components/                        ← user-message, tool-call, streaming-text, analyst-answer, footer
scripts/
  build-npm-package.mjs               ← esbuild bundle: web-app/src/cli.ts → dist/agent-stanley.js
  publish.mjs                         ← publishes @earendil-works/pi-{ai,agent-core,tui,coding-agent}
  release.mjs                         ← full release flow: bump → changelogs → check → commit → tag → push
  sync-versions.js                    ← syncs inter-package dep versions after version bumps
  run-web-app.mjs                     ← dev/prod runner (loads .env, passes --watch for dev)
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

### TypeScript
- Use only **erasable TypeScript syntax**: no `enum`, `namespace`/`module`, parameter properties, `import =`, `export =`. Node runs `.ts` files directly in strip-only mode; these constructs require JS emit.
- No inline/dynamic imports (`await import()`, `import("pkg").Type`). Top-level imports only.
- Never modify `packages/ai/src/models.generated.ts` directly. Update `packages/ai/scripts/generate-models.ts` and regenerate.

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
- `packages/ai` and `packages/coding-agent` have 3 pre-existing failing tests in the Pi source that require Node 22 to run `.ts` files directly. Not caused by finance-agent code.
- If you create or modify a test file, run it and iterate until it passes before moving on.

### Code changes
- Read files in full before making wide-ranging changes or editing files you have not fully inspected.
- Always ask before removing functionality or code that appears intentional.
- Do not preserve backward compatibility unless the user asks for it.

### Guardrails
- Personalized buy/sell/hold advice must be refused — `financialAdviceGuard` has 13 regex patterns.
- `citationVerifier` checks every `evidenceId` in the answer exists in the retrieved set.
- `unsupportedClaimChecker` flags company-specific numeric or quote claims without evidence.
- All three run via `runVerification()` inside `buildAnalystAnswer()` before the `final` event is emitted.

### Transcript licensing
- `TranscriptProvider` interface only. Do not add paid providers without documenting license terms, storage rights, and attribution in an ADR under `docs/finance-agent/adr/`.

## NPM Package Publishing

### Two separate publish flows

**1. `agent-stanley` CLI (root package, `version: 0.0.x`)**
- Bundled via esbuild: `npm run build:npm` → `dist/agent-stanley.js` (single file, `#!/usr/bin/env node`)
- `prepack` runs `build:npm` automatically before `npm publish`
- External deps listed in `build-npm-package.mjs` are kept unbundled (declared as `dependencies` in root `package.json`)
- Published as `agent-stanley` on npm; users install globally with `npm install -g agent-stanley`

**2. `@earendil-works/pi-*` packages (lockstep versioned, `version: 0.1.x`)**
- Finance packages: `pi-research-db`, `pi-sec-ingestion`, `pi-transcript-ingestion`, `pi-research-agent`
- Pi core packages: `pi-ai`, `pi-agent-core`, `pi-tui`, `pi-coding-agent` (at `0.77.x`, managed by `scripts/publish.mjs`)
- All finance packages must stay at the same version (`scripts/sync-versions.js` enforces this)

### Release flow for `@earendil-works/pi-*`
```bash
node scripts/release.mjs patch    # fixes + additions
node scripts/release.mjs minor    # breaking changes
node scripts/release.mjs 0.2.0    # explicit version (must be > current)
```
This bumps all packages, updates `## [Unreleased]` → `## [version] - date` in each `CHANGELOG.md`, regenerates ai models + coding-agent shrinkwrap, runs `npm run check`, commits `Release vX.Y.Z`, tags it, adds fresh `## [Unreleased]` sections, and pushes. CI then publishes to npm via OIDC (no local `npm publish` needed).

### Dependency management
- Install: `npm install --ignore-scripts`
- A pre-commit hook blocks lockfile commits. Set `PI_ALLOW_LOCKFILE_CHANGE=1` if a lockfile change is intentional.
- After version bumps, run `node scripts/sync-versions.js` to keep inter-package dep versions in sync, then `npm install --package-lock-only --ignore-scripts`.

### Changelog format
Each package has `packages/*/CHANGELOG.md`. New entries go under `## [Unreleased]` with subsections `### Breaking Changes`, `### Added`, `### Changed`, `### Fixed`, `### Removed`. Released version sections are immutable.

## Environment Variables

```
SEC_USER_AGENT="AppName contact@example.com"   # required for EDGAR filing downloads; fail fast if absent
API_NINJAS_KEY="..."                           # required for Ninjas SEC client and transcript provider
OPENAI_API_KEY="..."                           # or any Pi-supported provider credential
PI_RESEARCH_MODEL="openai/gpt-4o"             # optional; provider/model-id format
TRANSCRIPT_PROVIDER="fixture"                  # default for dev/test
DATABASE_URL="postgres://..."                  # future production target (SQLite + Drizzle selected in ADR 0002)
```

## Session Workflow

- Update `STATUS.md` (root) and `docs/finance-agent/TODO.md` together — keep them in sync.
- Update `docs/finance-agent/HANDOFF.md` at the end of every meaningful session.
- Mark a TODO item complete only after implementation, tests, and docs are updated.

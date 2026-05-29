# Implementation Plan: Refactor Pi into a Financial Research Analyst Engine

**Audience:** Coding agent / software engineering team  
**Primary goal:** Transform the Pi-based agent runtime from a coding-agent experience into the core engine of an investment research analyst application.  
**Target user experience:** Users ask questions about a company’s 10-K, 10-Q, or earnings call transcript, and the application answers with evidence-backed, citation-rich analysis.  
**Priority:** Correctness, maintainability, auditability, and source-grounded answers. Speed is secondary.  
**Last verified:** 2026-05-29

---

## 0. Mission Brief for the Coding Agent

You are implementing a product-grade financial research analyst engine. Do **not** rush. Prefer small, reviewed, testable steps. This is expected to take multiple coding sessions.

The existing Pi project should stop behaving like a coding agent in the user-facing product. The reusable value in Pi is the agent runtime: model orchestration, tool calling, event streaming, sessions, context transformation, and extensibility. The product must replace the coding-agent prompt and coding tools with financial-research-specific tools and workflows.

The finished system should answer questions such as:

- “What are the main risks Apple disclosed in its latest 10-K?”
- “How did Microsoft’s revenue growth change between the latest 10-Q and the prior-year quarter?”
- “What did Nvidia management say about data center demand in the latest earnings call?”
- “Compare the latest 10-Q MD&A language with the previous quarter.”
- “What explains the change in gross margin?”

The system must:

1. Resolve company names/tickers to CIKs.
2. Fetch or ingest SEC filings.
3. Parse 10-K and 10-Q sections.
4. Ingest XBRL financial facts.
5. Ingest earnings call transcripts through a licensed/source-approved provider or fixture interface.
6. Retrieve relevant source passages using hybrid retrieval.
7. Compute financial metrics from structured facts, not from model memory.
8. Generate answers that separate facts, interpretation, and uncertainty.
9. Cite all material company-specific claims.
10. Refuse or redirect personalized investment advice.
11. Maintain a persistent TODO and handoff record across sessions.

---

## 1. Mandatory Multi-Session Workflow

Before implementing code, create a persistent TODO file and update it throughout the work.

### 1.1 Required files to create first

Create:

```text
/docs/finance-agent/TODO.md
/docs/finance-agent/HANDOFF.md
/docs/finance-agent/ARCHITECTURE.md
/docs/finance-agent/adr/0001-agent-runtime-choice.md
```

If the repository already has a documentation convention, adapt the path, but keep the same logical files.

### 1.2 TODO.md requirements

The coding agent must create a `TODO.md` with these sections:

```md
# Finance Analyst Engine TODO

## Operating rules
- Work slowly and carefully.
- Do not mark an item complete until implementation, tests, and documentation updates are done.
- After each completed task, update this file with a dated note.
- If a task is blocked, mark it as blocked and explain the blocker.
- Keep changes small enough to review.
- Prefer source-backed financial answers over broad model reasoning.

## Current status
- Phase:
- Last completed item:
- Current item:
- Known blockers:

## Task list
- [ ] 0.1 Inspect repository structure and package manager.
- [ ] 0.2 Identify existing Pi integration points.
- [ ] 0.3 Create initial architecture notes.
- [ ] 0.4 Add finance-agent package/module skeleton.
...

## Completion log
| Date | Task | Notes | Tests |
|---|---|---|---|
```

### 1.3 Handoff.md requirements

`HANDOFF.md` must let another coding agent resume work without re-discovering the entire repository.

It must include:

```md
# Finance Analyst Engine Handoff

## What this project is building

## Current architecture

## Important files

## Decisions made

## How to run checks

## Last session summary

## Next recommended task

## Open questions
```

Update `HANDOFF.md` at the end of every meaningful session.

### 1.4 Architecture and ADR requirements

`ARCHITECTURE.md` should explain the current intended architecture. ADRs should record important decisions, especially:

- Whether the prototype uses `@earendil-works/pi-coding-agent` SDK or `@earendil-works/pi-agent-core` directly.
- Database choice.
- Retrieval strategy.
- Transcript provider strategy.
- Citation format.
- Guardrail strategy.

---

## 2. Source Context and Links

Use the links below as starting points. Confirm details against current docs before implementing if anything appears inconsistent.

### 2.1 Pi links

- Pi site: <https://pi.dev/>
- Pi GitHub mono-repo: <https://github.com/earendil-works/pi>
- Pi SDK docs: <https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md>
- Pi coding-agent package: <https://www.npmjs.com/package/@earendil-works/pi-coding-agent>
- Pi package move announcement: <https://pi.dev/news/2026/5/7/pi-has-a-new-home>

Important facts from the Pi docs:

- Pi is described as a minimal terminal coding harness that can be customized with extensions, skills, prompt templates, themes, and packages.
- The mono-repo includes:
  - `@earendil-works/pi-coding-agent`: interactive coding agent CLI.
  - `@earendil-works/pi-agent-core`: agent runtime with tool calling and state management.
  - `@earendil-works/pi-ai`: unified multi-provider LLM API.
- The SDK can be used to embed Pi in other applications and build custom UIs.
- The SDK exposes `createAgentSession`, `DefaultResourceLoader`, `defineTool`, `SessionManager`, settings, and event subscription.
- The SDK can override the system prompt with `systemPromptOverride`.
- Built-in coding tools include `read`, `bash`, `edit`, `write`, `grep`, `find`, and `ls`.
- `noTools: "builtin"` disables default built-in tools while keeping custom tools enabled.
- `customTools` can be passed into `createAgentSession`.

### 2.2 SEC / EDGAR links

- SEC EDGAR API documentation: <https://www.sec.gov/search-filings/edgar-application-programming-interfaces>
- SEC data API root: <https://data.sec.gov/>
- SEC fair access guidance: <https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data>
- SEC developer resources: <https://www.sec.gov/about/developer-resources>
- SEC ticker to CIK mapping: <https://www.sec.gov/files/company_tickers.json>
- EDGAR archive root: <https://www.sec.gov/Archives/edgar/data/>

Important SEC API facts:

- `data.sec.gov` hosts RESTful JSON APIs for EDGAR data.
- SEC data APIs do not require API keys for public data access.
- Company filing history is available at:

```text
https://data.sec.gov/submissions/CIK##########.json
```

where `##########` is the 10-digit CIK with leading zeroes.

- XBRL company facts are available at:

```text
https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
```

- Company concept facts are available at:

```text
https://data.sec.gov/api/xbrl/companyconcept/CIK##########/{taxonomy}/{concept}.json
```

- Frames are available at:

```text
https://data.sec.gov/api/xbrl/frames/{taxonomy}/{concept}/{unit}/{period}.json
```

- The SEC fair access guideline limits automated users to no more than 10 requests per second total.
- Use efficient scripting and download only what is needed.
- Configure a descriptive `User-Agent` with application and contact information.

### 2.3 Transcript source caution

Earnings call transcripts are often licensed. Do not scrape or redistribute transcript content without confirming source rights. Implement a provider abstraction so the product can use:

- Licensed vendor API.
- Company investor relations pages where terms allow.
- Manually uploaded transcripts.
- Local fixtures for development and tests.

Do not hard-code a paid or copyrighted transcript provider unless credentials and licensing are explicitly available in the project.

---

## 3. Product Definition

### 3.1 Product role

The application is an investment research analyst assistant. It explains company disclosures using source-grounded evidence. It is not a personal financial adviser.

### 3.2 Allowed behaviours

The assistant may:

- Summarize 10-K and 10-Q sections.
- Explain risk factors.
- Compare disclosures between periods.
- Extract management commentary from earnings calls.
- Calculate financial metrics from XBRL facts.
- Identify changes in wording or emphasis.
- Generate diligence questions.
- Explain accounting policies and changes.
- Create source-backed tables.
- State uncertainty when evidence is incomplete.

### 3.3 Disallowed behaviours

The assistant must not:

- Give personalized buy/sell/hold recommendations.
- Claim a stock is suitable for the user’s portfolio.
- Invent facts, citations, or source passages.
- Use model memory as the basis for company-specific claims.
- Present forecasts as facts.
- Hide uncertainty.
- Use coding-agent language in product answers.
- Mention repositories, patches, shell commands, file edits, or coding unless the user asks about the implementation.

### 3.4 User-facing answer principles

Every material answer should include:

1. Direct answer first.
2. Key evidence bullets.
3. Source citations or evidence IDs.
4. Any calculations with source values and periods.
5. Caveats and uncertainty.
6. No personalized investment advice.

---

## 4. Architecture Overview

### 4.1 Target shape

```text
User
  ↓
Web / App UI
  ↓
Research Chat API
  ↓
Finance Analyst Agent Runtime
  - Pi SDK or pi-agent-core
  - finance system prompt
  - custom finance tools only
  - streaming events
  - session persistence
  ↓
Research Tools
  - resolve_company
  - list_filings
  - ingest_company_filings
  - retrieve_filing_passages
  - get_xbrl_facts
  - retrieve_transcript_passages
  - compute_metric
  - compare_periods
  - verify_answer
  ↓
Data Layer
  - company registry
  - filings metadata
  - filing chunks
  - transcript chunks
  - XBRL facts
  - vector index
  - lexical index
  - evidence store
  ↓
External Sources
  - SEC submissions API
  - SEC XBRL APIs
  - EDGAR archive documents
  - transcript provider / uploads / fixtures
```

### 4.2 What to keep from Pi

Keep:

- Agent loop.
- Tool calling.
- Event stream.
- Sessions.
- Model abstraction.
- Context transformation / compaction.
- Custom tools.

Remove or disable in the product runtime:

- Coding system prompt.
- Built-in coding tools: `bash`, `edit`, `write`, etc.
- Terminal/TUI assumptions.
- Project source-file editing workflows.
- Coding-agent UI text.

### 4.3 Initial implementation recommendation

Start with `@earendil-works/pi-coding-agent` SDK for speed, but isolate the usage behind an internal adapter so it can later migrate to `@earendil-works/pi-agent-core`.

Use this shape:

```text
packages/research-agent/src/runtime/PiResearchAgentRuntime.ts
```

This class should be the only place that imports `@earendil-works/pi-coding-agent` directly.

Later, if needed, implement:

```text
packages/research-agent/src/runtime/PiCoreResearchAgentRuntime.ts
```

using `@earendil-works/pi-agent-core` directly.

---

## 5. Recommended Repository Structure

Adapt names to the existing repo, but prefer a modular structure like this:

```text
apps/
  web/
    app/
      api/
        research/
          chat/
            route.ts
    components/
      research/
        ResearchChat.tsx
        EvidencePanel.tsx
        SourceCitation.tsx
        FinancialMetricTable.tsx

packages/
  research-agent/
    src/
      index.ts
      runtime/
        ResearchAgentRuntime.ts
        PiResearchAgentRuntime.ts
      prompts/
        financeSystemPrompt.ts
      tools/
        index.ts
        resolveCompany.ts
        listFilings.ts
        ingestCompanyFilings.ts
        retrieveFilingPassages.ts
        getXbrlFacts.ts
        retrieveTranscriptPassages.ts
        computeMetric.ts
        comparePeriods.ts
        verifyAnswer.ts
      types/
        AgentAnswer.ts
        Evidence.ts
        ToolSchemas.ts
      verification/
        citationVerifier.ts
        financialAdviceGuard.ts
        unsupportedClaimDetector.ts
      evals/
        evalCases.ts
        runEvals.ts

  sec-ingestion/
    src/
      index.ts
      secClient.ts
      rateLimiter.ts
      companyTickers.ts
      submissions.ts
      filingDownloader.ts
      filingParser.ts
      sectionizer10k.ts
      sectionizer10q.ts
      xbrlFacts.ts
      fixtures/

  transcript-ingestion/
    src/
      index.ts
      TranscriptProvider.ts
      providers/
        fixtureTranscriptProvider.ts
        uploadedTranscriptProvider.ts
      parseTranscript.ts
      normalizeSpeakers.ts

  research-db/
    src/
      index.ts
      schema.ts
      migrations/
      repositories/
        companiesRepo.ts
        filingsRepo.ts
        chunksRepo.ts
        xbrlFactsRepo.ts
        transcriptsRepo.ts
      search/
        vectorSearch.ts
        lexicalSearch.ts
        hybridSearch.ts
        rerank.ts

docs/
  finance-agent/
    TODO.md
    HANDOFF.md
    ARCHITECTURE.md
    adr/
      0001-agent-runtime-choice.md
```

If the repo is not a monorepo, implement equivalent directories under `src/finance-agent`.

---

## 6. Runtime Refactor Plan

### 6.1 Create runtime interface

Implement a framework-neutral runtime interface first.

```ts
export type ResearchAgentInput = {
  userId?: string;
  sessionId?: string;
  message: string;
  companyHint?: string;
  sourceScope?: {
    forms?: Array<"10-K" | "10-Q" | "8-K">;
    fiscalPeriods?: string[];
    includeTranscripts?: boolean;
  };
};

export type ResearchAgentEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; toolName: string; inputSummary?: string }
  | { type: "tool_result"; toolName: string; resultSummary?: string }
  | { type: "evidence"; evidenceIds: string[] }
  | { type: "final"; answer: AnalystAnswer }
  | { type: "error"; message: string };

export interface ResearchAgentRuntime {
  stream(input: ResearchAgentInput): AsyncIterable<ResearchAgentEvent>;
}
```

The application should depend on this interface, not directly on Pi.

### 6.2 Implement PiResearchAgentRuntime

Use Pi SDK internally.

Key requirements:

- Override system prompt.
- Disable built-in coding tools.
- Provide only custom finance tools.
- Avoid loading project `AGENTS.md` or coding skills unless intentionally needed for development mode.
- Stream Pi events into `ResearchAgentEvent` events.
- Persist sessions if product sessions are required.

Example skeleton:

```ts
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  defineTool,
} from "@earendil-works/pi-coding-agent";

import { FINANCE_SYSTEM_PROMPT } from "../prompts/financeSystemPrompt";
import { buildFinanceTools } from "../tools";
import type { ResearchAgentRuntime, ResearchAgentInput, ResearchAgentEvent } from "./ResearchAgentRuntime";

export class PiResearchAgentRuntime implements ResearchAgentRuntime {
  constructor(private readonly deps: ResearchAgentRuntimeDeps) {}

  async *stream(input: ResearchAgentInput): AsyncIterable<ResearchAgentEvent> {
    const loader = new DefaultResourceLoader({
      cwd: this.deps.cwd,
      agentDir: this.deps.agentDir,
      systemPromptOverride: () => FINANCE_SYSTEM_PROMPT,

      // Prevent coding-agent project context from leaking into product behavior.
      agentsFilesOverride: () => ({ agentsFiles: [], diagnostics: [] }),
      skillsOverride: () => ({ skills: [], diagnostics: [] }),
      promptsOverride: () => ({ prompts: [], diagnostics: [] }),
    });

    await loader.reload();

    const { session } = await createAgentSession({
      resourceLoader: loader,
      sessionManager: this.deps.sessionManager ?? SessionManager.inMemory(),
      authStorage: this.deps.authStorage,
      modelRegistry: this.deps.modelRegistry,
      model: this.deps.model,

      // Critical: disable Pi's default coding tools.
      noTools: "builtin",

      // Only finance tools should be available.
      customTools: buildFinanceTools(this.deps),
    });

    const queue = createAsyncEventQueue<ResearchAgentEvent>();

    const unsubscribe = session.subscribe((event) => {
      const mapped = mapPiEventToResearchEvent(event);
      if (mapped) queue.push(mapped);
    });

    try {
      await session.prompt(buildPrompt(input));
      queue.close();
      yield* queue;
    } finally {
      unsubscribe?.();
    }
  }
}
```

The above is a directional skeleton. Adjust to the actual Pi SDK event API after inspecting the installed version.

### 6.3 Success criteria

- A test proves that built-in coding tools are not available in production runtime.
- The system prompt no longer references coding.
- The agent can call a fake finance tool and stream the result.
- The app can run a demo answer using fixture data.

---

## 7. Finance System Prompt

Create:

```text
packages/research-agent/src/prompts/financeSystemPrompt.ts
```

Use this as the starting prompt:

```ts
export const FINANCE_SYSTEM_PROMPT = `
You are an investment research analyst assistant.

Your job is to answer questions about public companies using approved source material:
- SEC 10-K filings
- SEC 10-Q filings
- SEC 8-K filings when relevant
- structured SEC XBRL facts
- earnings call transcripts from approved/licensed sources
- user-provided documents

You are not a coding agent. Do not discuss repositories, files, patches, shell commands, terminals, or implementation unless the user explicitly asks about the software system.

Core rules:
1. Every material factual claim about a company must be supported by cited evidence.
2. Prefer primary-source SEC filings and XBRL facts over secondary commentary.
3. Use earnings call transcripts for management commentary, not for audited financial statement facts.
4. Separate facts, interpretation, and uncertainty.
5. When comparing periods, use exact company, fiscal period, form type, filing date, and metric definitions.
6. When numbers come from XBRL, include unit, period, and source fact metadata when available.
7. Do not invent citations, document names, financial values, or management quotes.
8. If evidence is missing, say what is missing and which source would be needed.
9. Do not give personalized investment advice, buy/sell/hold recommendations, or portfolio suitability advice.
10. You may provide neutral, source-grounded research observations.
11. For calculations, call tools to retrieve structured values and compute metrics; do not rely on memory.
12. For source text, call retrieval tools and cite the returned evidence IDs.
13. Before finalizing, ensure that all material claims are supported by evidence.

Answer style:
- Start with a concise direct answer.
- Then provide evidence-backed bullets.
- Include tables for multi-period numbers when useful.
- Include caveats if the evidence is incomplete or ambiguous.
- Keep the tone professional, analytical, and neutral.
`;
```

Add tests to ensure the runtime uses this prompt and not the coding-agent default prompt.

---

## 8. Data Model

Implement models in `packages/research-db/src/schema.ts` or the equivalent location.

### 8.1 Company

```ts
export type Company = {
  id: string;
  cik: string;              // 10 digits with leading zeros
  ticker?: string;
  name: string;
  exchange?: string;
  sic?: string;
  sicDescription?: string;
  createdAt: string;
  updatedAt: string;
};
```

### 8.2 Filing

```ts
export type Filing = {
  id: string;
  companyId: string;
  cik: string;
  accessionNumber: string;       // with dashes
  accessionNumberNoDashes: string;
  form: "10-K" | "10-Q" | "8-K" | string;
  filingDate: string;
  reportDate?: string;
  fiscalYear?: number;
  fiscalPeriod?: "FY" | "Q1" | "Q2" | "Q3" | "Q4";
  primaryDocument?: string;
  primaryDocumentUrl?: string;
  secIndexUrl?: string;
  createdAt: string;
  updatedAt: string;
};
```

### 8.3 FilingSection

```ts
export type FilingSection = {
  id: string;
  filingId: string;
  sectionType:
    | "business"
    | "risk_factors"
    | "mda"
    | "market_risk"
    | "financial_statements"
    | "legal_proceedings"
    | "controls_and_procedures"
    | "other";
  itemLabel?: string;       // e.g. "Item 1A"
  title?: string;
  text: string;
  html?: string;
  charStart?: number;
  charEnd?: number;
  sourceUrl?: string;
};
```

### 8.4 FilingChunk

```ts
export type FilingChunk = {
  id: string;
  companyId: string;
  filingId: string;
  sectionId?: string;
  form: string;
  filingDate: string;
  fiscalYear?: number;
  fiscalPeriod?: string;
  sectionType?: string;
  text: string;
  textHash: string;
  tokenCount?: number;
  embedding?: number[];
  sourceUrl?: string;
  sourceLocator?: string;   // item, anchor, character range, page, etc.
  createdAt: string;
};
```

### 8.5 XbrlFact

```ts
export type XbrlFact = {
  id: string;
  companyId: string;
  cik: string;
  taxonomy: "us-gaap" | "dei" | string;
  concept: string;
  label?: string;
  description?: string;
  unit: string;
  value: number | string;
  startDate?: string;
  endDate?: string;
  instantDate?: string;
  fiscalYear?: number;
  fiscalPeriod?: string;
  form?: string;
  accessionNumber?: string;
  frame?: string;
  filed?: string;
  source: "sec_companyfacts" | "sec_companyconcept" | string;
};
```

### 8.6 Transcript

```ts
export type Transcript = {
  id: string;
  companyId: string;
  eventDate: string;
  fiscalYear?: number;
  fiscalPeriod?: string;
  title?: string;
  provider: string;
  sourceUrl?: string;
  licenseNotes?: string;
  createdAt: string;
};
```

### 8.7 TranscriptChunk

```ts
export type TranscriptChunk = {
  id: string;
  transcriptId: string;
  companyId: string;
  eventDate: string;
  fiscalYear?: number;
  fiscalPeriod?: string;
  section: "prepared_remarks" | "qa" | "unknown";
  speaker?: string;
  speakerRole?: "CEO" | "CFO" | "Analyst" | "Operator" | "Other";
  text: string;
  textHash: string;
  embedding?: number[];
  sourceUrl?: string;
  sourceLocator?: string;
};
```

### 8.8 Evidence

```ts
export type Evidence = {
  id: string;
  sourceType: "filing" | "xbrl_fact" | "transcript" | "uploaded_document";
  companyId: string;
  title: string;
  snippet: string;
  sourceUrl?: string;
  sourceLocator?: string;
  filingId?: string;
  transcriptId?: string;
  xbrlFactId?: string;
  metadata: Record<string, unknown>;
};
```

---

## 9. SEC Client Implementation

Create `packages/sec-ingestion/src/secClient.ts`.

### 9.1 Requirements

- Centralize all SEC HTTP calls.
- Include configurable `User-Agent`.
- Enforce max 10 requests per second globally per process.
- Use retries with exponential backoff for transient failures.
- Respect HTTP status codes.
- Cache responses where appropriate.
- Do not overload SEC servers in tests.
- Use fixtures/mocks for unit tests.

### 9.2 Configuration

```ts
export type SecClientConfig = {
  userAgent: string; // e.g. "YourAppName contact@example.com"
  maxRequestsPerSecond?: number; // default <= 10
  baseDataUrl?: string; // default "https://data.sec.gov"
  baseArchivesUrl?: string; // default "https://www.sec.gov/Archives"
  timeoutMs?: number;
};
```

Fail fast if `userAgent` is missing in production.

### 9.3 Core methods

```ts
export class SecClient {
  async getCompanyTickers(): Promise<SecCompanyTickerEntry[]>;
  async getSubmissions(cik10: string): Promise<SecSubmissionsResponse>;
  async getCompanyFacts(cik10: string): Promise<SecCompanyFactsResponse>;
  async getCompanyConcept(cik10: string, taxonomy: string, concept: string): Promise<SecCompanyConceptResponse>;
  async getFrame(taxonomy: string, concept: string, unit: string, period: string): Promise<SecFrameResponse>;
  async downloadFilingDocument(params: DownloadFilingDocumentParams): Promise<string>;
}
```

### 9.4 SEC archive URL format

Filing primary documents usually resolve to:

```text
https://www.sec.gov/Archives/edgar/data/{cikWithoutLeadingZeros}/{accessionNumberNoDashes}/{primaryDocument}
```

The coding agent must verify this with actual filing metadata and add tests with fixtures.

---

## 10. Filing Ingestion

### 10.1 Ingestion flow

```text
ticker/name
  ↓
resolve CIK
  ↓
fetch submissions JSON
  ↓
select target filings: 10-K / 10-Q
  ↓
download primary HTML document
  ↓
clean HTML
  ↓
sectionize by item labels
  ↓
chunk sections
  ↓
store chunks
  ↓
embed chunks
  ↓
index for lexical and vector retrieval
```

### 10.2 Forms to support first

Phase 1:

- 10-K
- 10-Q

Phase 2:

- 8-K earnings releases
- 20-F for foreign issuers
- 6-K where useful

### 10.3 10-K sections

Map these:

```text
Item 1      Business
Item 1A     Risk Factors
Item 1B     Unresolved Staff Comments
Item 2      Properties
Item 3      Legal Proceedings
Item 7      Management's Discussion and Analysis
Item 7A     Quantitative and Qualitative Disclosures About Market Risk
Item 8      Financial Statements and Supplementary Data
Item 9A     Controls and Procedures
```

### 10.4 10-Q sections

Map these:

```text
Part I Item 1      Financial Statements
Part I Item 2      Management's Discussion and Analysis
Part I Item 3      Quantitative and Qualitative Disclosures About Market Risk
Part I Item 4      Controls and Procedures
Part II Item 1     Legal Proceedings
Part II Item 1A    Risk Factors
```

### 10.5 Parsing cautions

SEC filing HTML is inconsistent. Build robust parsing, not brittle regex-only extraction.

Use layered strategies:

1. Parse HTML to text with structure preserved.
2. Detect item headings with regex patterns.
3. Use anchor/table-of-contents hints where available.
4. Deduplicate repeated table-of-contents labels.
5. Validate extracted section lengths.
6. Keep raw HTML and raw text for debugging.
7. Add fixtures from multiple companies before trusting parser.

### 10.6 Chunking rules

- Chunk within sections, not across arbitrary filing boundaries.
- Preserve section metadata on every chunk.
- Target chunk size should be configurable.
- Include overlap where useful.
- Hash text to avoid duplicates.
- Store source locator metadata.

Suggested defaults:

```ts
export const DEFAULT_CHUNKING_CONFIG = {
  targetTokens: 700,
  overlapTokens: 100,
  minChunkTokens: 100,
};
```

---

## 11. XBRL Facts Ingestion

### 11.1 Why structured facts matter

Do not rely on model extraction for core financial numbers. Revenue, gross profit, operating income, cash, debt, shares, EPS, and margins should come from XBRL facts when available.

### 11.2 First concepts to support

Start with common `us-gaap` concepts:

```text
Revenues
RevenueFromContractWithCustomerExcludingAssessedTax
SalesRevenueNet
CostOfRevenue
CostOfGoodsAndServicesSold
GrossProfit
OperatingIncomeLoss
NetIncomeLoss
Assets
AssetsCurrent
Liabilities
LiabilitiesCurrent
CashAndCashEquivalentsAtCarryingValue
NetCashProvidedByUsedInOperatingActivities
EarningsPerShareBasic
EarningsPerShareDiluted
WeightedAverageNumberOfSharesOutstandingBasic
WeightedAverageNumberOfDilutedSharesOutstanding
```

The coding agent must inspect actual company facts and support concept aliases. Different companies use different concepts for similar line items.

### 11.3 Fact normalization

Normalize facts into query-friendly rows:

```text
companyId
concept
unit
value
periodStart
periodEnd
instantDate
fy
fp
form
filed
accession
frame
```

### 11.4 Metric computation

Implement deterministic metric calculation helpers:

```ts
export type MetricName =
  | "revenue_growth_yoy"
  | "gross_margin"
  | "operating_margin"
  | "net_margin"
  | "current_ratio"
  | "free_cash_flow";
```

Example:

```ts
function grossMargin(grossProfit: number, revenue: number): number {
  if (revenue === 0) throw new Error("Cannot compute gross margin with zero revenue");
  return grossProfit / revenue;
}
```

Every computed metric must return:

```ts
{
  metric: "gross_margin",
  value: 0.431,
  displayValue: "43.1%",
  inputs: [
    { concept: "GrossProfit", value: 100, unit: "USD", period: "FY2025 Q4", evidenceId: "..." },
    { concept: "Revenues", value: 232, unit: "USD", period: "FY2025 Q4", evidenceId: "..." }
  ]
}
```

---

## 12. Transcript Ingestion

### 12.1 Provider abstraction

Create:

```ts
export interface TranscriptProvider {
  listTranscripts(input: ListTranscriptsInput): Promise<TranscriptMetadata[]>;
  getTranscript(input: GetTranscriptInput): Promise<TranscriptDocument>;
}
```

### 12.2 Initial provider

Implement a fixture provider first:

```text
packages/transcript-ingestion/src/providers/fixtureTranscriptProvider.ts
```

This allows development and testing without depending on a licensed vendor.

### 12.3 Transcript parser

The parser should identify:

- Event title.
- Company.
- Event date.
- Fiscal period.
- Prepared remarks.
- Q&A.
- Speakers.
- Speaker roles.

Store speaker metadata with every chunk.

### 12.4 Licensing rule

Before adding a real transcript provider, document:

- Provider name.
- License/terms.
- Whether content can be stored.
- Whether snippets can be shown to users.
- Attribution requirements.

Add this to an ADR.

---

## 13. Retrieval Strategy

### 13.1 Required approach

Use hybrid retrieval:

1. Metadata filtering.
2. Lexical search.
3. Vector search.
4. Reranking.
5. Evidence packaging.

Do not run embedding search over the entire corpus when the question clearly identifies company and period.

### 13.2 Retrieval flow

```text
User query
  ↓
company resolution
  ↓
period/source scope detection
  ↓
metadata filter
  ↓
BM25 / full-text search
  ↓
vector search
  ↓
merge and deduplicate
  ↓
rerank
  ↓
return evidence objects
```

### 13.3 Retrieval input

```ts
export type RetrieveEvidenceInput = {
  companyId: string;
  query: string;
  sourceTypes?: Array<"filing" | "transcript" | "xbrl_fact">;
  forms?: Array<"10-K" | "10-Q" | "8-K">;
  fiscalYears?: number[];
  fiscalPeriods?: string[];
  sectionTypes?: string[];
  topK?: number;
};
```

### 13.4 Retrieval output

```ts
export type RetrieveEvidenceOutput = {
  evidence: Evidence[];
  diagnostics: {
    lexicalHits: number;
    vectorHits: number;
    reranked: boolean;
    filtersApplied: Record<string, unknown>;
  };
};
```

### 13.5 Ranking rules

Prefer:

- Newer filings when the user asks for “latest”.
- Exact section matches.
- Primary sources over transcripts for audited facts.
- Transcript comments for management commentary.
- XBRL facts for numeric values.
- Exact keyword matches for accounting terms.

---

## 14. Custom Agent Tools

All tools must return structured JSON plus human-readable text where Pi expects text content. Every source retrieval tool must return evidence IDs.

### 14.1 Tool: resolve_company

Purpose: map a ticker or company name to canonical company identity.

Input:

```ts
{
  query: string;
}
```

Output:

```ts
{
  matches: Array<{
    companyId: string;
    cik: string;
    ticker?: string;
    name: string;
    exchange?: string;
    confidence: number;
  }>;
}
```

Acceptance criteria:

- `AAPL` resolves to Apple Inc. with a 10-digit CIK.
- Company-name query supports fuzzy matching.
- Ambiguous names return multiple candidates.

### 14.2 Tool: list_filings

Purpose: list available filings for a company.

Input:

```ts
{
  companyId?: string;
  cik?: string;
  forms?: string[];
  limit?: number;
}
```

Output:

```ts
{
  filings: Filing[];
}
```

Acceptance criteria:

- Can return latest 10-K.
- Can return latest 10-Q.
- Results include filing date, report date, accession number, and primary document URL.

### 14.3 Tool: ingest_company_filings

Purpose: ensure target filings are available in the local research store.

Input:

```ts
{
  companyId: string;
  forms: Array<"10-K" | "10-Q">;
  limitPerForm?: number;
  forceRefresh?: boolean;
}
```

Output:

```ts
{
  ingestedFilings: Array<{
    filingId: string;
    form: string;
    filingDate: string;
    chunksCreated: number;
    sectionsCreated: number;
  }>;
  skippedFilings: Array<{
    accessionNumber: string;
    reason: string;
  }>;
}
```

Acceptance criteria:

- Idempotent.
- Does not duplicate chunks.
- Respects SEC rate limiting.
- Uses fixture mode in tests.

### 14.4 Tool: retrieve_filing_passages

Purpose: retrieve source text from filings.

Input:

```ts
{
  companyId: string;
  query: string;
  forms?: Array<"10-K" | "10-Q" | "8-K">;
  fiscalYears?: number[];
  fiscalPeriods?: string[];
  sectionTypes?: string[];
  topK?: number;
}
```

Output:

```ts
{
  evidence: Evidence[];
}
```

Acceptance criteria:

- Returns passages with source metadata.
- Supports section filters such as `risk_factors` and `mda`.
- No answer can cite a passage that was not returned by this or another retrieval tool.

### 14.5 Tool: get_xbrl_facts

Purpose: retrieve structured facts.

Input:

```ts
{
  companyId: string;
  concepts?: string[];
  conceptGroups?: Array<"revenue" | "income" | "cash" | "assets" | "liabilities" | "eps" | "shares">;
  fiscalYears?: number[];
  fiscalPeriods?: string[];
  forms?: string[];
}
```

Output:

```ts
{
  facts: Array<XbrlFact & { evidenceId: string }>;
}
```

Acceptance criteria:

- Returns values with units and periods.
- Handles common concept aliases.
- Does not silently mix duration and instant facts.

### 14.6 Tool: retrieve_transcript_passages

Purpose: retrieve management commentary and analyst Q&A.

Input:

```ts
{
  companyId: string;
  query: string;
  fiscalYears?: number[];
  fiscalPeriods?: string[];
  speakerRoles?: Array<"CEO" | "CFO" | "Analyst" | "Operator" | "Other">;
  sections?: Array<"prepared_remarks" | "qa">;
  topK?: number;
}
```

Output:

```ts
{
  evidence: Evidence[];
}
```

Acceptance criteria:

- Preserves speaker name and role.
- Distinguishes prepared remarks from Q&A where possible.
- Can operate on fixture transcripts.

### 14.7 Tool: compute_metric

Purpose: compute deterministic financial metrics from structured facts.

Input:

```ts
{
  companyId: string;
  metric: "gross_margin" | "operating_margin" | "net_margin" | "revenue_growth_yoy" | "current_ratio";
  fiscalYears?: number[];
  fiscalPeriods?: string[];
}
```

Output:

```ts
{
  metric: string;
  results: Array<{
    period: string;
    value: number;
    displayValue: string;
    inputs: Array<{
      concept: string;
      value: number;
      unit: string;
      evidenceId: string;
    }>;
  }>;
}
```

Acceptance criteria:

- All inputs have evidence IDs.
- Missing required facts produce explicit errors, not guessed values.

### 14.8 Tool: compare_periods

Purpose: compare facts and/or language across periods.

Input:

```ts
{
  companyId: string;
  topic: string;
  sourceType: "filing" | "transcript" | "xbrl_fact";
  periods: string[];
}
```

Output:

```ts
{
  comparison: Array<{
    period: string;
    summary: string;
    evidenceIds: string[];
  }>;
  notableChanges: Array<{
    change: string;
    evidenceIds: string[];
  }>;
}
```

### 14.9 Tool: verify_answer

Purpose: verify that a draft answer is supported by cited evidence.

Input:

```ts
{
  draftAnswer: string;
  evidenceIds: string[];
}
```

Output:

```ts
{
  supported: boolean;
  unsupportedClaims: string[];
  missingCitations: string[];
  adviceRiskFlags: string[];
  requiredRevisions: string[];
}
```

Acceptance criteria:

- Flags claims without evidence.
- Flags buy/sell/hold or personalized advice language.
- Blocks final answer or forces revision when unsupported material claims exist.

---

## 15. Tool Implementation Pattern

Use Pi’s `defineTool` where using the Pi SDK. Keep business logic outside the Pi wrapper so it can be reused after migration.

Example structure:

```ts
// tools/resolveCompany.ts
export async function resolveCompanyCore(input: ResolveCompanyInput, deps: ToolDeps): Promise<ResolveCompanyOutput> {
  return deps.companyResolver.resolve(input.query);
}

export function createResolveCompanyTool(deps: ToolDeps) {
  return defineTool({
    name: "resolve_company",
    label: "Resolve Company",
    description: "Resolve a public company ticker or name to a canonical company and CIK.",
    parameters: Type.Object({
      query: Type.String({ description: "Ticker or company name, e.g. AAPL or Apple" }),
    }),
    execute: async (_toolCallId, params) => {
      const result = await resolveCompanyCore(params, deps);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });
}
```

Tests should target `resolveCompanyCore` first, then the Pi wrapper.

---

## 16. Agent Workflow

The agent must follow this workflow for company research questions:

```text
1. Understand the question.
2. Resolve company identity.
3. Determine source scope:
   - latest 10-K?
   - latest 10-Q?
   - specific period?
   - transcript?
   - XBRL facts?
4. Ensure required source documents/facts are ingested.
5. Retrieve relevant passages/facts.
6. Compute metrics if needed.
7. Draft answer.
8. Verify support and citations.
9. Revise if verification fails.
10. Return final answer.
```

For broad questions, the agent may retrieve multiple sources. For narrow numeric questions, it should go to XBRL facts first.

---

## 17. Answer Contract

Internally represent final answers as structured data.

```ts
export type AnalystAnswer = {
  answer: string;
  keyPoints: Array<{
    claim: string;
    evidenceIds: string[];
  }>;
  tables?: Array<{
    title: string;
    columns: string[];
    rows: string[][];
    evidenceIds: string[];
  }>;
  caveats: string[];
  sources: Array<{
    evidenceId: string;
    title: string;
    sourceType: string;
    url?: string;
    locator?: string;
  }>;
  verification: {
    supported: boolean;
    warnings: string[];
  };
};
```

The UI can render this as chat text plus evidence panels.

---

## 18. API Design

If a web app exists, add a research chat endpoint.

Example:

```text
POST /api/research/chat
```

Request:

```json
{
  "sessionId": "optional-session-id",
  "message": "What are Apple's main risks in the latest 10-K?",
  "companyHint": "AAPL",
  "sourceScope": {
    "forms": ["10-K"],
    "includeTranscripts": false
  }
}
```

Response should support streaming where possible.

For non-streaming fallback:

```json
{
  "answer": {
    "answer": "...",
    "keyPoints": [],
    "tables": [],
    "caveats": [],
    "sources": [],
    "verification": {
      "supported": true,
      "warnings": []
    }
  }
}
```

---

## 19. UI Requirements

Build minimal UI only after the backend can answer from fixtures.

Required components:

- Chat input.
- Streaming answer area.
- Evidence/source panel.
- Source citation component.
- Metric table component.
- Warning/caveat display.

Citation display should include:

- Company.
- Form or transcript event.
- Filing date / event date.
- Section or speaker.
- Snippet.
- Link to SEC filing or source when available.

---

## 20. Verification and Guardrails

### 20.1 Citation verification

Implement deterministic checks:

- Every `evidenceId` in the final answer exists in the current evidence set.
- Every key point has at least one evidence ID.
- Every table has evidence IDs.
- XBRL-derived metrics include input evidence IDs.

### 20.2 Unsupported claim detection

Implement an LLM-assisted verifier or conservative heuristic to identify:

- Company-specific claims without citations.
- Numeric claims without structured inputs.
- Management quotes not sourced from transcript evidence.
- Future predictions stated as facts.

### 20.3 Financial advice guard

Flag and revise language such as:

```text
You should buy...
You should sell...
This is suitable for your portfolio...
Guaranteed return...
Risk-free...
```

Allowed neutral alternatives:

```text
The filing suggests...
The cited evidence indicates...
A diligence question would be...
Investors may want to examine...
```

---

## 21. Testing Strategy

### 21.1 Unit tests

Required unit tests:

- CIK normalization.
- Ticker mapping.
- SEC URL building.
- Rate limiter.
- Filing metadata parsing.
- Filing sectionization.
- Chunking.
- XBRL fact normalization.
- Metric computation.
- Transcript parsing.
- Retrieval filters.
- Tool core functions.
- Citation verifier.
- Advice guard.

### 21.2 Integration tests

Use fixtures, not live SEC calls by default.

Create fixtures for at least:

- One 10-K.
- One 10-Q.
- One companyfacts JSON.
- One earnings call transcript fixture.

Suggested fixture companies for development only:

- Apple Inc. (`AAPL`) because filings are widely known and SEC data is available.
- Microsoft (`MSFT`) or Nvidia (`NVDA`) as second parser-validation company.

Do not hard-code company-specific answers into tests. Assert behaviour and evidence linking.

### 21.3 Agent behaviour tests

Test prompts:

1. “What are the main risks in Apple’s latest 10-K?”
2. “How did revenue change year over year?”
3. “What did management say about gross margin?”
4. “Compare the risk factor language between the latest 10-K and prior 10-K.”
5. “Should I buy Apple stock?”

Expected:

- Questions 1-4 return evidence-backed answers.
- Question 5 refuses personalized advice and offers neutral research framing.

### 21.4 Quality gates

Before marking any TODO item complete, run the relevant checks. Depending on the repo:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

or the equivalent commands. Add exact commands to `HANDOFF.md`.

---

## 22. Phased Implementation Plan

### Phase 0 — Discovery and project setup

Tasks:

- Inspect repository structure.
- Identify package manager and build system.
- Identify current Pi usage.
- Create `TODO.md`, `HANDOFF.md`, `ARCHITECTURE.md`, and ADR folder.
- Add this implementation plan to the repo, preferably at:

```text
docs/finance-agent/IMPLEMENTATION_PLAN.md
```

Acceptance criteria:

- Documentation files exist.
- TODO has initial tasks.
- Handoff explains how to run the repo.
- No runtime code changed yet unless needed for discovery.

### Phase 1 — Runtime isolation

Tasks:

- Create `ResearchAgentRuntime` interface.
- Create `PiResearchAgentRuntime` adapter.
- Override system prompt.
- Disable built-in coding tools with `noTools: "builtin"`.
- Add one fake custom tool, e.g. `echo_research_tool`.
- Add tests verifying coding tools are disabled.

Acceptance criteria:

- Demo prompt can call fake finance tool.
- Runtime does not expose `bash`, `edit`, or `write`.
- Product prompt has no coding-agent identity.

### Phase 2 — Data contracts and repositories

Tasks:

- Add shared types.
- Add DB schema or repository interfaces.
- Choose database adapter.
- Add migrations if a DB exists.
- Add in-memory repositories for tests.

Acceptance criteria:

- Types compile.
- Repositories have tests.
- Schema can represent company, filings, chunks, facts, transcripts, and evidence.

### Phase 3 — SEC client

Tasks:

- Implement SEC client.
- Implement rate limiter.
- Implement ticker mapping fetch.
- Implement submissions fetch.
- Implement companyfacts fetch.
- Implement filing document downloader.
- Add fixture-based tests.

Acceptance criteria:

- SEC client requires User-Agent in production mode.
- Rate limiter enforces max 10 requests/sec or lower.
- Unit tests use mocked HTTP.

### Phase 4 — Filing ingestion

Tasks:

- Parse submissions into `Filing` rows.
- Download primary 10-K/10-Q HTML.
- Clean filing HTML.
- Sectionize 10-K and 10-Q.
- Chunk sections.
- Store chunks.
- Add parser diagnostics.

Acceptance criteria:

- At least one fixture 10-K and 10-Q can be sectionized.
- MD&A and Risk Factors are extracted when present.
- Chunks include section metadata and source locators.

### Phase 5 — XBRL ingestion and metrics

Tasks:

- Parse companyfacts JSON.
- Normalize facts.
- Add concept alias mapping.
- Implement metric calculation helpers.
- Create `get_xbrl_facts` core logic.
- Create `compute_metric` core logic.

Acceptance criteria:

- Revenue and gross profit can be retrieved from fixture companyfacts.
- Gross margin can be calculated with evidence IDs.
- Missing facts return a clear error.

### Phase 6 — Retrieval

Tasks:

- Implement lexical search.
- Implement vector search if embedding infrastructure is available.
- If vector DB is not yet available, implement the interface and use lexical fallback.
- Implement hybrid merge and reranking.
- Return evidence objects.

Acceptance criteria:

- Retrieval supports company, form, period, and section filters.
- Retrieval returns stable evidence IDs.
- Tests prove section-scoped retrieval works.

### Phase 7 — Finance tools

Tasks:

- Implement tool wrappers for:
  - `resolve_company`
  - `list_filings`
  - `ingest_company_filings`
  - `retrieve_filing_passages`
  - `get_xbrl_facts`
  - `compute_metric`
- Keep tool core logic independent from Pi.
- Add tests for tool core logic and wrappers.

Acceptance criteria:

- Agent can resolve a company and retrieve filing evidence from fixtures.
- Tool outputs include structured details.
- Tools return user-readable errors for missing data.

### Phase 8 — Transcript fixtures and retrieval

Tasks:

- Add transcript provider interface.
- Add fixture transcript provider.
- Parse transcript into chunks.
- Preserve speakers and roles.
- Add `retrieve_transcript_passages`.

Acceptance criteria:

- Agent can answer a management-commentary question from a transcript fixture.
- Answer identifies speaker when available.
- Transcript source licensing notes are represented in metadata.

### Phase 9 — End-to-end analyst answers

Tasks:

- Implement final `AnalystAnswer` structure.
- Map Pi stream to app stream.
- Add answer formatting.
- Add evidence panel data.
- Add verification step before final answer.

Acceptance criteria:

- User asks a filing question and receives cited answer.
- User asks a numeric question and receives computed metric with sources.
- User asks a transcript question and receives speaker-attributed commentary.

### Phase 10 — Guardrails and verification

Tasks:

- Implement citation verifier.
- Implement financial advice guard.
- Implement unsupported claim checker.
- Integrate verification into runtime.
- Add failure/revision flow.

Acceptance criteria:

- Unsupported claims are caught.
- Personalized investment advice is refused or reframed.
- Final answer does not include citations that were not retrieved.

### Phase 11 — Web/API integration

Tasks:

- Add research chat API endpoint.
- Add streaming support if available.
- Add minimal chat UI.
- Add evidence/source panel.
- Add error states.

Acceptance criteria:

- Local user can ask a question in the UI.
- Evidence is visible and linked.
- Long-running ingestion/retrieval has understandable progress states.

### Phase 12 — Evals and production hardening

Tasks:

- Add eval cases.
- Add regression suite.
- Add observability: tool calls, retrieval diagnostics, source coverage.
- Add caching.
- Add background ingestion jobs if needed.
- Add data refresh strategy.
- Add permissions/licensing checks for transcripts.

Acceptance criteria:

- Evals can run locally.
- Common prompts have stable, cited answers.
- Failures are logged with enough diagnostics to debug.

### Phase 13 — Optional migration to pi-agent-core

Only do this after the product behaviour is proven.

Tasks:

- Review direct `pi-agent-core` APIs.
- Implement `PiCoreResearchAgentRuntime` behind the same `ResearchAgentRuntime` interface.
- Compare behaviour against SDK implementation.
- Keep SDK implementation until parity is proven.

Acceptance criteria:

- Same tests pass on both runtimes or migration ADR explains differences.
- App code is unchanged because it depends on `ResearchAgentRuntime`.

---

## 23. Configuration and Environment

Add environment variables as needed:

```text
SEC_USER_AGENT="YourAppName contact@example.com"
DATABASE_URL="postgres://..."
OPENAI_API_KEY="..." # or any Pi-supported provider credential
PI_RESEARCH_MODEL="openai/gpt-5.4" # optional; provider/model-id
TRANSCRIPT_PROVIDER="fixture"
```

Never commit secrets.

Production must fail fast if `SEC_USER_AGENT` is not configured.

---

## 24. Observability

Add structured logs for:

- Company resolution.
- SEC requests.
- Ingestion jobs.
- Sectionization diagnostics.
- Retrieval filters and hit counts.
- Tool calls.
- Verification failures.
- Final answer source count.

Avoid logging full user queries or sensitive uploaded documents unless the product policy allows it.

---

## 25. Error Handling

User-facing errors should be clear and actionable.

Examples:

```text
I could not find a 10-K for that company in the local index. I can try to ingest the latest SEC filing first.
```

```text
The filing was found, but the MD&A section could not be parsed reliably. The raw filing is available, but I should not summarize it until the parser is corrected.
```

```text
I found revenue but not gross profit for the requested period, so I cannot compute gross margin from structured XBRL facts.
```

Do not silently degrade into unsupported model answers.

---

## 26. Security and Compliance Notes

- Respect SEC fair access rules.
- Do not scrape transcript sites without permission.
- Validate external URLs to avoid SSRF.
- Keep vendor API keys server-side only.
- Do not expose raw model/tool traces to end users unless sanitized.
- Clearly distinguish research assistance from financial advice.
- Keep source provenance for all answers.
- Consider adding a short UI disclaimer: “This tool summarizes source documents and does not provide personalized investment advice.”

---

## 27. Definition of Done

The refactor is complete when:

- The product runtime no longer behaves like a coding agent.
- Built-in coding tools are disabled in the product agent.
- The system prompt is finance-specific.
- The agent can answer from 10-K and 10-Q fixture data with citations.
- The agent can retrieve and compute XBRL-backed metrics.
- The agent can answer from transcript fixtures with speaker attribution.
- Final answers include evidence IDs/sources for material claims.
- Personalized investment advice is refused or reframed.
- Tests cover ingestion, retrieval, tools, metrics, verification, and end-to-end answering.
- `TODO.md` and `HANDOFF.md` are up to date.
- Architecture and ADR documents describe the implemented choices.

---

## 28. Initial TODO List to Put in TODO.md

The coding agent should start with this list and expand it as discovery reveals repository-specific details.

```md
# Finance Analyst Engine TODO

## Operating rules
- Work slowly and carefully.
- Do not mark an item complete until implementation, tests, and documentation updates are done.
- Update this file after every completed item.
- Add dated notes to the completion log.
- Keep changes small and reviewable.
- Do not let the product agent use coding-agent tools or coding-agent identity.
- Do not allow unsupported financial claims in final answers.

## Current status
- Phase: 0 — Discovery
- Last completed item: None
- Current item: Inspect repository structure
- Known blockers: None yet

## Task list

### Phase 0 — Discovery and docs
- [ ] 0.1 Inspect repository structure, package manager, app framework, and test commands.
- [ ] 0.2 Identify existing Pi dependency/version and integration points.
- [ ] 0.3 Create docs/finance-agent/TODO.md.
- [ ] 0.4 Create docs/finance-agent/HANDOFF.md.
- [ ] 0.5 Create docs/finance-agent/ARCHITECTURE.md.
- [ ] 0.6 Create docs/finance-agent/adr/0001-agent-runtime-choice.md.
- [ ] 0.7 Copy this implementation plan to docs/finance-agent/IMPLEMENTATION_PLAN.md.

### Phase 1 — Runtime isolation
- [ ] 1.1 Create ResearchAgentRuntime interface.
- [ ] 1.2 Create PiResearchAgentRuntime adapter.
- [ ] 1.3 Add finance system prompt.
- [ ] 1.4 Disable built-in Pi coding tools in product runtime.
- [ ] 1.5 Add fake finance tool and smoke test.
- [ ] 1.6 Add tests proving bash/edit/write are unavailable.

### Phase 2 — Data contracts
- [ ] 2.1 Add Company, Filing, FilingSection, FilingChunk, XbrlFact, Transcript, TranscriptChunk, Evidence types.
- [ ] 2.2 Add repository interfaces.
- [ ] 2.3 Add in-memory test repositories.
- [ ] 2.4 Decide DB adapter and record ADR.

### Phase 3 — SEC client
- [ ] 3.1 Implement SecClient config.
- [ ] 3.2 Implement rate limiter.
- [ ] 3.3 Implement company ticker mapping fetch.
- [ ] 3.4 Implement submissions fetch.
- [ ] 3.5 Implement companyfacts fetch.
- [ ] 3.6 Implement filing document downloader.
- [ ] 3.7 Add mocked/fixture tests.

### Phase 4 — Filing ingestion
- [ ] 4.1 Parse filings from submissions JSON.
- [ ] 4.2 Download primary filing HTML.
- [ ] 4.3 Clean filing HTML.
- [ ] 4.4 Sectionize 10-K.
- [ ] 4.5 Sectionize 10-Q.
- [ ] 4.6 Chunk sections.
- [ ] 4.7 Store sections and chunks.
- [ ] 4.8 Add parser diagnostics.

### Phase 5 — XBRL and metrics
- [ ] 5.1 Normalize companyfacts JSON.
- [ ] 5.2 Add common concept aliases.
- [ ] 5.3 Store XBRL facts.
- [ ] 5.4 Implement get_xbrl_facts core logic.
- [ ] 5.5 Implement compute_metric core logic.
- [ ] 5.6 Add tests for gross margin and revenue growth.

### Phase 6 — Retrieval
- [ ] 6.1 Implement lexical search.
- [ ] 6.2 Implement vector search interface.
- [ ] 6.3 Implement hybrid merge.
- [ ] 6.4 Implement reranking hook.
- [ ] 6.5 Return Evidence objects.
- [ ] 6.6 Add section-filtered retrieval tests.

### Phase 7 — Agent tools
- [ ] 7.1 Implement resolve_company tool.
- [ ] 7.2 Implement list_filings tool.
- [ ] 7.3 Implement ingest_company_filings tool.
- [ ] 7.4 Implement retrieve_filing_passages tool.
- [ ] 7.5 Implement get_xbrl_facts tool.
- [ ] 7.6 Implement compute_metric tool.
- [ ] 7.7 Add tool wrapper tests.

### Phase 8 — Transcripts
- [ ] 8.1 Create TranscriptProvider interface.
- [ ] 8.2 Create fixture transcript provider.
- [ ] 8.3 Parse transcript speakers and sections.
- [ ] 8.4 Store transcript chunks.
- [ ] 8.5 Implement retrieve_transcript_passages tool.
- [ ] 8.6 Add transcript fixture tests.

### Phase 9 — Analyst answer flow
- [ ] 9.1 Add AnalystAnswer type.
- [ ] 9.2 Add final answer formatting.
- [ ] 9.3 Add source/citation serialization.
- [ ] 9.4 Integrate retrieval + answer generation.
- [ ] 9.5 Add end-to-end fixture answer tests.

### Phase 10 — Verification and guardrails
- [ ] 10.1 Implement citation verifier.
- [ ] 10.2 Implement financial advice guard.
- [ ] 10.3 Implement unsupported claim checker.
- [ ] 10.4 Integrate verification before final output.
- [ ] 10.5 Add tests for advice refusal and unsupported claims.

### Phase 11 — App integration
- [ ] 11.1 Add research chat API endpoint.
- [ ] 11.2 Add streaming events.
- [ ] 11.3 Add minimal chat UI.
- [ ] 11.4 Add evidence panel.
- [ ] 11.5 Add UI error and caveat states.

### Phase 12 — Evals and hardening
- [ ] 12.1 Add eval cases.
- [ ] 12.2 Add local eval runner.
- [ ] 12.3 Add logging/observability.
- [ ] 12.4 Add caching strategy.
- [ ] 12.5 Add data refresh strategy.
- [ ] 12.6 Review transcript licensing.

### Phase 13 — Optional pi-agent-core migration
- [ ] 13.1 Review pi-agent-core API.
- [ ] 13.2 Implement alternate runtime behind ResearchAgentRuntime.
- [ ] 13.3 Compare behaviour and tests.
- [ ] 13.4 Record migration decision in ADR.

## Completion log
| Date | Task | Notes | Tests |
|---|---|---|---|
```

---

## 29. First Instruction to Give the Coding Agent

Use this exact first message when starting implementation:

```text
We are refactoring Pi so it becomes the core engine behind a financial research analyst application. It should no longer act like a coding agent in the product runtime.

Read docs/finance-agent/IMPLEMENTATION_PLAN.md first. Before changing runtime code, create and maintain docs/finance-agent/TODO.md and docs/finance-agent/HANDOFF.md. Update TODO.md after every completed task and do not mark tasks complete until implementation, tests, and documentation updates are done.

Work slowly and carefully. Prefer small, tested changes. The product must answer questions about 10-Ks, 10-Qs, XBRL facts, and earnings call transcripts with source-backed citations. It must not provide personalized investment advice. It must disable Pi's built-in coding tools in the product runtime and expose only finance research tools.

Start with Phase 0 from the implementation plan.
```

---

## 30. Notes for Human Reviewers

Review each phase for:

- Correctness over speed.
- Source provenance.
- SEC compliance.
- No transcript licensing issues.
- No coding-agent leakage into product behaviour.
- Good tests before moving to the next phase.
- Clear `TODO.md` and `HANDOFF.md` updates.

Do not approve a phase if answers can be generated without evidence for material financial claims.

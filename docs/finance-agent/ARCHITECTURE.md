# Finance Analyst Engine Architecture

## System overview

The finance analyst engine answers questions about public companies using SEC filings, XBRL structured facts, and earnings call transcripts. All material claims must be backed by cited source evidence. The system must not provide personalized investment advice.

## Runtime layer

The Pi SDK (`@earendil-works/pi-coding-agent` v0.77.0) provides the agent loop, tool calling, event streaming, session persistence, and model abstraction. The product builds on Pi by:

- Replacing the system prompt entirely with a finance-specific prompt.
- Disabling all built-in coding tools (`noTools: "builtin"`).
- Providing only custom finance tools via `customTools`.
- Suppressing Pi's coding-agent context files (AGENTS.md, skills, prompts) via resource loader overrides.

The `PiResearchAgentRuntime` class is the only module that imports `@earendil-works/pi-coding-agent`. All application code depends on the `ResearchAgentRuntime` interface. This isolates Pi and makes a future migration to `@earendil-works/pi-agent-core` a local change.

`PiCoreResearchAgentRuntime` is also available as a direct `@earendil-works/pi-agent-core` migration adapter behind the same interface. It is not the production default because direct core usage requires caller-supplied model, auth, and resource-loading wiring that the coding-agent SDK currently provides.

## Package structure

```
packages/
  research-agent/        ← agent runtimes, tools, types, prompts, verification, evals
  sec-ingestion/         ← SEC HTTP client, filing downloader, parser, sectionizer, XBRL normalizer
  transcript-ingestion/  ← TranscriptProvider interface, fixture provider, parser
  research-db/           ← schema, repositories, hybrid search (lexical + vector)
  web-app/               ← API endpoint, SSE streaming, observability, minimal UI
```

## Data flow

```
User query
  ↓
ResearchAgentRuntime.stream(input)
  ↓
Pi agent loop
  ├─ resolve_company      → Company { companyId, cik, name }
  ├─ list_filings         → Filing[]
  ├─ ingest_company_filings → chunks stored in DB
  ├─ retrieve_filing_passages → Evidence[] (text chunks + source metadata)
  ├─ get_xbrl_facts       → XbrlFact[] (structured numeric values)
  ├─ compute_metric       → MetricResult { value, inputs[], evidenceIds }
  ├─ retrieve_transcript_passages → Evidence[] (speaker-attributed)
  ├─ compare_periods      → comparison across filings or transcripts
  └─ verify_answer        → { supported, unsupportedClaims, adviceRiskFlags }
  ↓
AnalystAnswer
  { answer, keyPoints[], tables[], caveats[], sources[], verification }
  ↓
Streaming events → UI (text_delta, tool_start, tool_result, evidence, final)
```

## Evidence model

Every retrievable fact, passage, or computed value is wrapped as an `Evidence` object with a stable `id`. The final `AnalystAnswer` references evidence IDs only — never inline text without a backing ID. The `verify_answer` tool checks this contract before the answer is emitted.

## Finance tool contract

Tools return structured JSON plus a human-readable text representation. Source retrieval tools always return `evidenceId` per result. Metric computation tools always return `inputs[]` with one `evidenceId` per input fact. Missing data is an explicit error, not a silent fallback to model memory.

## Guardrails

1. **Citation verifier**: every `evidenceId` in the answer must exist in the retrieved evidence set.
2. **Advice guard**: scans draft answer for buy/sell/hold and portfolio-suitability language; forces revision.
3. **Unsupported claim detector**: flags company-specific numeric or quote claims without evidence backing.

Verification runs before every final answer emission. If it fails, the agent is required to revise.

## Current state

- `ResearchAgentRuntime` interface defined.
- `PiResearchAgentRuntime` production adapter implemented.
- `PiCoreResearchAgentRuntime` migration adapter implemented.
- Finance system prompt written.
- Finance tools registered behind Pi wrappers with Pi-independent core logic.
- `AnalystAnswer` and `Evidence` types defined.
- Verification, local evals, web SSE API, minimal UI, and observability are implemented.

All planned phases in `TODO.md` are complete.

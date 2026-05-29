# Agent Stanley

A financial research analyst engine that answers questions about public companies using SEC filings (10-K, 10-Q), XBRL structured facts, and earnings call transcripts.

Built on the [Pi coding-agent runtime](https://github.com/earendil-works/pi) by Earendil Works.

---

## What it does

Agent Stanley runs a multi-step research loop:

1. Resolves a company ticker to a CIK
2. Fetches and ingests SEC filings via API Ninjas
3. Retrieves relevant passages using hybrid BM25 + vector search (RRF)
4. Pulls authoritative XBRL numeric facts directly from EDGAR
5. Optionally retrieves earnings transcript passages (speaker-attributed)
6. Computes derived metrics with traceable evidence IDs
7. Returns a verified `AnalystAnswer` with key points, tables, caveats, and citations

All numeric values come from XBRL facts — never from model memory. Every claim in the final answer is verified against retrieved evidence before the response is emitted.

## Packages

| Package | Description |
|---------|-------------|
| `packages/research-agent` | Agent runtime, tools, prompts, verification, and evals |
| `packages/research-db` | Data model, repositories, BM25/vector/hybrid search |
| `packages/sec-ingestion` | SEC filing fetcher, sectionizer, chunker, XBRL ingestor |
| `packages/transcript-ingestion` | Earnings transcript provider, parser, BM25 search |
| `packages/web-app` | Node HTTP server, SSE chat endpoint, browser UI |

## Requirements

- Node.js `>=22.19.0`
- `API_NINJAS_KEY` — SEC filing list and transcript data via [API Ninjas](https://api-ninjas.com)
- `SEC_USER_AGENT` — required by EDGAR (e.g. `"MyApp contact@example.com"`)
- An LLM provider credential: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `OPENROUTER_API_KEY`
- Optional: `PI_RESEARCH_MODEL="provider/model-id"` to pin the model (e.g. `openai/gpt-4o`)

## Install

```bash
npm install --ignore-scripts
```

## Global CLI

After publishing to npm, install and run the web server with:

```bash
npm install -g agent-stanley
agent-stanley
```

Create `~/.agent-stanley` with your keys (loaded automatically on startup):

```
API_NINJAS_KEY=...
SEC_USER_AGENT=AgentStanley contact@example.com
OPENAI_API_KEY=...
```

Then just run:

```bash
agent-stanley
```

A `.env` file in the current working directory is also loaded and takes precedence over `~/.agent-stanley`.

## Run

```bash
# Development (hot reload)
npm run dev

# Production
npm start
```

The web UI starts at `http://localhost:3000`. Type a question about any public company.

## Build & test

```bash
npm run build    # research-db → sec-ingestion → transcript-ingestion → research-agent → web-app
npm test         # all workspaces
npm run check    # biome lint/format + typecheck

# Single package
cd packages/research-agent && npx vitest --run

# Offline evals (no LLM calls, fixture-backed)
cd packages/research-agent && npm run eval
```

## Environment variables

```
SEC_USER_AGENT="AppName contact@example.com"   # required for EDGAR filing downloads
API_NINJAS_KEY="..."                           # required for SEC client and transcripts
OPENAI_API_KEY="..."                           # or any supported provider key
PI_RESEARCH_MODEL="openai/gpt-4o"             # optional; overrides default model
TRANSCRIPT_PROVIDER="fixture"                  # use "fixture" for dev/test (no API calls)
DATABASE_URL="postgres://..."                  # future production target (SQLite selected in ADR 0002)
```

## Guardrails

- Personalized buy/sell/hold advice is refused (`financialAdviceGuard`)
- Every evidence ID in the answer is verified against retrieved passages (`citationVerifier`)
- Company-specific numeric or quote claims without evidence are flagged (`unsupportedClaimChecker`)

## Architecture docs

See `docs/finance-agent/` for `ARCHITECTURE.md`, `HANDOFF.md`, `TODO.md`, and ADRs.

## License

MIT

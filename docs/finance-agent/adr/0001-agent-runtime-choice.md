# ADR 0001 — Agent Runtime Choice

**Date:** 2026-05-28
**Status:** Accepted

## Context

The finance analyst engine needs an agent loop that handles LLM tool calling, event streaming, session persistence, and context compaction. Two options exist within the Pi monorepo:

- `@earendil-works/pi-coding-agent` (v0.77.0): The full coding-agent package with an SDK exported via `createAgentSession`. Includes the TUI, interactive mode, and coding tools, but the SDK allows disabling all built-in tools and overriding the system prompt.
- `@earendil-works/pi-agent-core` (v0.77.0): The lower-level agent runtime without the TUI or CLI layer. Requires more wiring but fewer dependencies.

## Decision

Use `@earendil-works/pi-coding-agent` SDK for the initial implementation.

The `PiResearchAgentRuntime` adapter class will be the only module that imports `@earendil-works/pi-coding-agent`. All application code depends on the `ResearchAgentRuntime` interface.

## Rationale

1. The SDK exposes exactly the hooks needed: `noTools: "builtin"`, `customTools`, `systemPromptOverride`, and the full override set on `DefaultResourceLoader`.
2. Session management, context compaction, and event streaming are production-ready in the SDK without additional wiring.
3. The isolation boundary (`PiResearchAgentRuntime` as the only importer) keeps the migration path open at low cost.

## Trade-offs

| Factor | pi-coding-agent SDK | pi-agent-core direct |
|--------|--------------------|--------------------|
| Setup effort | Low (SDK wires most things) | High (manual wiring) |
| Bundle size | Larger (TUI included) | Smaller |
| API stability | Public SDK surface | Lower-level, may change |
| Migration cost | One class to rewrite | N/A |

## Consequences

- `packages/research-agent` depends on `@earendil-works/pi-coding-agent`.
- No other package in the product imports Pi directly.
- Phase 13 may migrate to `pi-agent-core` once product behaviour is stable. That migration is a rewrite of `PiResearchAgentRuntime` only.

# ADR 0005: pi-agent-core Migration Review

## Status

Accepted — 2026-05-29

## Context

ADR 0001 selected `@earendil-works/pi-coding-agent` for the first implementation because it provided session creation, model registry, auth storage, resource loading, and custom tool registration. Phase 13 required reviewing direct `@earendil-works/pi-agent-core` use and implementing an alternate runtime behind `ResearchAgentRuntime`.

## Findings

`@earendil-works/pi-agent-core` provides the low-level `Agent` runtime, event stream, tool execution, state handling, and provider transport hooks. It does **not** provide the coding SDK's higher-level `ModelRegistry`, `AuthStorage`, `DefaultResourceLoader`, extension loading, settings manager, or built-in tool suppression controls.

## Decision

Keep `PiResearchAgentRuntime` as the production runtime for now and add `PiCoreResearchAgentRuntime` as an alternate adapter for migration testing.

`PiCoreResearchAgentRuntime`:

- Implements the same `ResearchAgentRuntime` interface.
- Imports `@earendil-works/pi-agent-core` directly.
- Requires explicit model/auth/tool dependencies from the caller.
- Uses the finance system prompt.
- Injects a core-compatible `submit_answer` tool.
- Maps core agent events into `ResearchAgentEvent`.

## Comparison

| Capability | PiResearchAgentRuntime | PiCoreResearchAgentRuntime |
|---|---|---|
| Finance system prompt | Yes | Yes |
| `ResearchAgentRuntime` interface | Yes | Yes |
| Built-in coding tool suppression | Yes, via `noTools: "builtin"` | Not applicable; caller supplies tools |
| Pi provider model registry | Yes | Caller must supply model/auth |
| Session/settings/resource loader | Yes | Caller must supply equivalents |
| Final `submit_answer` event | Yes | Yes |

## Consequences

- Application code remains unchanged because both runtimes implement `ResearchAgentRuntime`.
- A full migration still requires replacing model/auth/settings/resource-loader wiring.
- The current production path stays on `pi-coding-agent` until the direct core adapter has equivalent provider/auth ergonomics.

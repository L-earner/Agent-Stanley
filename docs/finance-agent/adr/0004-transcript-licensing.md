# ADR 0004: Transcript Licensing Review

## Status

Accepted — 2026-05-29

## Context

Earnings call transcripts are often licensed. The current implementation includes an API Ninjas transcript provider and fixture files for tests. The product must not scrape, redistribute, or permanently store paid transcript content without confirmed rights.

## Decision

Use the current transcript implementation only under these constraints:

1. **Fixtures are allowed for development and tests.**
   - Fixture content is static and used only for deterministic local tests/evals.
   - Tests must not call live transcript APIs.

2. **API Ninjas is a provisional provider.**
   - The provider name is recorded as `api_ninjas`.
   - Parsed transcripts include `licenseNotes`.
   - Production use requires confirmation of API Ninjas terms for storage, redistribution in snippets, attribution, and retention.

3. **No additional provider may be added without an ADR update.**
   - The ADR update must document provider name, source terms, storage rights, display/snippet rights, attribution requirements, retention/deletion policy, and whether cached transcript content may be indexed for retrieval.

4. **Fallback behavior**
   - If transcript rights are not confirmed, production must disable transcript ingestion/retrieval or use uploaded/customer-owned transcripts only.

## Consequences

- Transcript support remains architecturally ready but legally gated.
- Filing and XBRL functionality can ship independently of transcript provider licensing.
- Any UI displaying transcript snippets must preserve source attribution once a production provider is approved.

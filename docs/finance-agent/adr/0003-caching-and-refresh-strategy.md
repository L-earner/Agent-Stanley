# ADR 0003: Caching and Data Refresh Strategy

## Status

Accepted — 2026-05-29

## Context

The finance analyst engine ingests external SEC filings, SEC companyfacts XBRL, and earnings transcripts. These sources are relatively stable after publication, but the ingestion pipeline must avoid unnecessary external calls, support explicit refresh, and preserve deterministic test behavior.

## Decision

Use a layered cache strategy:

1. **Repository-level idempotency**
   - Filings are keyed by stable filing IDs/accession numbers.
   - Filing chunks are deduplicated by SHA-256 `textHash`.
   - XBRL facts are keyed by deterministic fact IDs from the normalized companyfacts data.
   - Transcript chunks are deduplicated by transcript ID and text hash.

2. **Process-lifetime in-memory cache for the current web prototype**
   - `packages/web-app/src/toolDeps.ts` owns one shared set of in-memory repositories per server process.
   - Data persists across requests while the process is alive.
   - Restarting the process clears cache state.

3. **Explicit refresh controls**
   - `ingest_company_filings` keeps `forceRefresh`.
   - Transcript ingestion keeps `forceRefresh`.
   - A future persistent adapter must preserve these semantics.

4. **Production persistence target**
   - Use SQLite + Drizzle initially, as selected in ADR 0002.
   - Add indexes for `companyId`, `cik`, `form`, `fiscalYear`, `fiscalPeriod`, `sectionType`, transcript period fields, and evidence IDs.

5. **No hidden live calls in tests**
   - Unit/integration tests continue to use fixtures or injected fetch/provider implementations.
   - The local eval runner is fixture-backed and deterministic.

## Refresh Policy

- SEC filing metadata: refresh on explicit user/admin request or scheduled daily scan.
- Filing HTML/chunks: immutable by accession; refresh only for amendments or explicit `forceRefresh`.
- XBRL companyfacts: refresh on ingest and scheduled daily scan for watched companies.
- Transcripts: refresh by fiscal period after provider reports availability; do not refresh licensed transcript content unless storage rights allow it.

## Consequences

- The prototype remains simple and deterministic.
- Production needs a persistent repository adapter before multi-process deployment.
- Refresh jobs must emit observability events for external calls, skipped records, created chunks, and deleted/replaced rows.

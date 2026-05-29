# ADR 0002 — Database Choice

**Date:** 2026-05-28
**Status:** Accepted

## Context

The research data layer needs persistent storage for companies, filings, filing chunks, XBRL facts, transcripts, transcript chunks, and evidence objects. The key requirements are:

- Full-text (lexical) search over chunk text.
- Structured queries with compound filters (companyId + form + fiscalYear + sectionType).
- Optional vector storage for embeddings (Phase 6).
- No external server required for local development.
- Simple schema migrations.

## Decision

**SQLite via Drizzle ORM** for Phase 3+.

For Phase 2 (current), all repositories are backed by in-memory `Map` implementations. These satisfy tests without any DB dependency and remain available as test doubles throughout all phases.

The production adapter will be added in a future task (after Phase 3 SEC client is stable) as a parallel implementation of the same repository interfaces.

## Rationale

| Factor | SQLite + Drizzle | PostgreSQL + Drizzle | Turso (libSQL) |
|--------|-----------------|---------------------|---------------|
| Server required | No | Yes | No (embedded) |
| Full-text search | FTS5 built-in | pg_trgm / tsvector | FTS5 |
| Vector support | sqlite-vec extension | pgvector | libSQL vector |
| Migration tooling | Drizzle Kit | Drizzle Kit | Drizzle Kit |
| Dev complexity | Low | Medium | Low |
| Production scale | Single-node | Multi-node | Edge-capable |

SQLite + Drizzle is the right choice for the initial single-server product. If multi-node or edge requirements emerge later, the repository interfaces allow migration to Turso (wire-compatible with SQLite) or PostgreSQL without changing application code.

## Vector search note

Phase 6 retrieval requires embedding search. Options when the time comes:

1. `sqlite-vec` extension for SQLite — simple, no extra server.
2. Separate vector store (Chroma, Qdrant) accessed via the `vectorSearch` repository interface.
3. pgvector if the product migrates to PostgreSQL.

The `FilingChunkRepository` and `TranscriptChunkRepository` include an `embedding` field on the schema type. The chosen vector approach plugs in at the `search/vectorSearch.ts` layer without touching the chunk repositories.

## Consequences

- Phase 2: in-memory repositories used in all tests.
- Phase 3+: add `packages/research-db/src/sqlite/` with Drizzle schema and SQLite adapter implementations.
- Application code always imports repository interfaces, never concrete adapter classes.
- A `createRepositories(config)` factory function (added in the SQLite phase) returns either in-memory or SQLite implementations based on config.

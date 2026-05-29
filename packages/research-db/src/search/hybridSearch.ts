import { createHash } from "node:crypto";
import type { Evidence, FilingChunk, SectionType } from "../schema.ts";
import { lexicalSearch } from "./lexicalSearch.ts";
import type { EmbeddingProvider } from "./vectorSearch.ts";
import { vectorSearch } from "./vectorSearch.ts";

// ---------------------------------------------------------------------------
// Unified result type
// ---------------------------------------------------------------------------

export type SearchResult = {
	chunk: FilingChunk;
	score: number; // RRF-combined score (or lexical-only if no provider)
	lexicalRank?: number; // 0-indexed rank in lexical list (undefined if not found)
	vectorRank?: number; // 0-indexed rank in vector list (undefined if not found)
};

// ---------------------------------------------------------------------------
// Rerank hook
// ---------------------------------------------------------------------------

/**
 * Optional cross-encoder or LLM-based reranker.
 * Receives the query and current top results; returns reordered results.
 * Phase 6 ships with a pass-through. A real reranker can be plugged in later.
 */
export type RerankFn = (query: string, results: SearchResult[]) => Promise<SearchResult[]>;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export type HybridSearchOptions = {
	topK?: number; // default 10
	rrfK?: number; // RRF constant, default 60
	sectionTypes?: SectionType[];
	filingIds?: string[];
	forms?: string[];
	rerank?: RerankFn;
};

// ---------------------------------------------------------------------------
// Reciprocal Rank Fusion
// ---------------------------------------------------------------------------

/**
 * Merge two ranked lists using Reciprocal Rank Fusion.
 *
 * RRF(d) = Σ 1 / (k + rank(d))  — rank is 1-indexed in the formula.
 *
 * Reference: Cormack, Clarke, Buettcher (2009) "Reciprocal Rank Fusion
 * outperforms Condorcet and individual Rank Learning Methods".
 */
function rrfMerge(lexical: FilingChunk[], vector: FilingChunk[], rrfK: number, topK: number): SearchResult[] {
	const scores = new Map<string, { score: number; lexicalRank?: number; vectorRank?: number; chunk: FilingChunk }>();

	for (let i = 0; i < lexical.length; i++) {
		const c = lexical[i];
		const entry = scores.get(c.id) ?? { score: 0, chunk: c };
		entry.lexicalRank = i;
		entry.score += 1 / (rrfK + i + 1);
		scores.set(c.id, entry);
	}

	for (let i = 0; i < vector.length; i++) {
		const c = vector[i];
		const entry = scores.get(c.id) ?? { score: 0, chunk: c };
		entry.vectorRank = i;
		entry.score += 1 / (rrfK + i + 1);
		scores.set(c.id, entry);
	}

	return Array.from(scores.values())
		.sort((a, b) => b.score - a.score)
		.slice(0, topK)
		.map((e) => ({ chunk: e.chunk, score: e.score, lexicalRank: e.lexicalRank, vectorRank: e.vectorRank }));
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Hybrid retrieval: BM25 lexical + cosine vector, merged with RRF.
 *
 * If `provider` is null, falls back to lexical-only search.
 * If a chunk has no `embedding`, it participates in lexical results only.
 *
 * All filtering (sectionTypes, filingIds, forms) is applied before scoring.
 */
export async function hybridSearch(
	query: string,
	chunks: FilingChunk[],
	provider: EmbeddingProvider | null,
	options: HybridSearchOptions = {},
): Promise<SearchResult[]> {
	const { topK = 10, rrfK = 60, sectionTypes, filingIds, forms, rerank } = options;
	const filterOpts = { topK: topK * 2, sectionTypes, filingIds, forms };

	const lexicalResults = lexicalSearch(query, chunks, filterOpts);
	const lexicalChunks = lexicalResults.map((r) => r.chunk);

	let results: SearchResult[];

	if (provider !== null) {
		const queryEmbedding = await provider.embed(query);
		const vectorResults = vectorSearch(queryEmbedding, chunks, filterOpts);
		const vectorChunks = vectorResults.map((r) => r.chunk);
		results = rrfMerge(lexicalChunks, vectorChunks, rrfK, topK);
	} else {
		// Lexical-only fallback — wrap in SearchResult shape
		results = lexicalChunks.slice(0, topK).map((chunk, i) => ({
			chunk,
			score: lexicalResults[i].score,
			lexicalRank: i,
		}));
	}

	return rerank ? rerank(query, results) : results;
}

// ---------------------------------------------------------------------------
// Evidence creation
// ---------------------------------------------------------------------------

const SNIPPET_LENGTH = 300;

/**
 * Convert a SearchResult into an Evidence object ready for storage.
 * The caller is responsible for assigning a final `id` (e.g. via the repo).
 */
export function searchResultToEvidence(result: SearchResult, snippetLength = SNIPPET_LENGTH): Omit<Evidence, "id"> {
	const { chunk } = result;

	const snippet = chunk.text.length > snippetLength ? `${chunk.text.slice(0, snippetLength).trimEnd()}…` : chunk.text;

	const title = [
		chunk.form,
		chunk.filingDate ? `(${chunk.filingDate.slice(0, 7)})` : undefined,
		chunk.sectionType ? `— ${chunk.sectionType.replace(/_/g, " ")}` : undefined,
	]
		.filter(Boolean)
		.join(" ");

	return {
		sourceType: "filing",
		companyId: chunk.companyId,
		title,
		snippet,
		sourceUrl: chunk.sourceUrl,
		sourceLocator: chunk.sourceLocator,
		filingId: chunk.filingId,
		filingChunkId: chunk.id,
		metadata: {
			score: result.score,
			lexicalRank: result.lexicalRank,
			vectorRank: result.vectorRank,
			sectionType: chunk.sectionType,
			form: chunk.form,
			filingDate: chunk.filingDate,
			textHash: chunk.textHash,
		},
	};
}

/** Generate a stable Evidence id from a chunk id + query (for dedup). */
export function evidenceIdForChunk(chunkId: string, query: string): string {
	return createHash("sha256").update(`ev:${chunkId}:${query}`).digest("hex").slice(0, 16);
}

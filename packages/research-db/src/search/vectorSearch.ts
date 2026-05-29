import { createHash } from "node:crypto";
import type { FilingChunk, SectionType } from "../schema.ts";

// ---------------------------------------------------------------------------
// EmbeddingProvider interface
// ---------------------------------------------------------------------------

/**
 * Abstraction over embedding models.
 * Implementations: OpenAI text-embedding-3-small, local Ollama, test fakes.
 */
export interface EmbeddingProvider {
	readonly dimensions: number;
	embed(text: string): Promise<number[]>;
	embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * Deterministic embedding provider for tests.
 *
 * Produces a stable unit vector from the SHA-256 hash of the input text.
 * Not semantically meaningful — use it to test search plumbing, not ranking quality.
 * Assign known embeddings directly to test chunks for quality tests.
 */
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
	readonly dimensions: number;

	constructor(dimensions = 8) {
		this.dimensions = dimensions;
	}

	async embed(text: string): Promise<number[]> {
		return deterministicVector(text, this.dimensions);
	}

	async embedBatch(texts: string[]): Promise<number[][]> {
		return Promise.all(texts.map((t) => this.embed(t)));
	}
}

function deterministicVector(text: string, dims: number): number[] {
	const hash = createHash("sha256").update(text, "utf8").digest();
	const raw: number[] = [];
	for (let i = 0; i < dims; i++) {
		raw.push((hash[i % hash.length] / 255) * 2 - 1);
	}
	// Normalise to unit vector
	const mag = Math.sqrt(raw.reduce((s, v) => s + v * v, 0));
	return mag === 0 ? raw : raw.map((v) => v / mag);
}

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dot = 0;
	let magA = 0;
	let magB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		magA += a[i] * a[i];
		magB += b[i] * b[i];
	}
	const mag = Math.sqrt(magA) * Math.sqrt(magB);
	return mag === 0 ? 0 : dot / mag;
}

// ---------------------------------------------------------------------------
// In-memory vector search
// ---------------------------------------------------------------------------

export type VectorSearchOptions = {
	topK?: number;
	sectionTypes?: SectionType[];
	filingIds?: string[];
	forms?: string[];
	minScore?: number; // default 0 — filter out negative cosine scores
};

export type VectorResult = {
	chunk: FilingChunk;
	score: number; // cosine similarity [-1, 1]
};

/**
 * Linear cosine-similarity scan over chunks that have `embedding` set.
 * Chunks without embeddings are silently skipped.
 *
 * For production-scale corpora, replace this with a sqlite-vec or pgvector
 * adapter behind the same interface.
 */
export function vectorSearch(
	queryEmbedding: number[],
	chunks: FilingChunk[],
	options: VectorSearchOptions = {},
): VectorResult[] {
	const { topK = 10, sectionTypes, filingIds, forms, minScore = 0 } = options;

	let corpus = chunks.filter((c) => c.embedding && c.embedding.length > 0);
	if (sectionTypes?.length) corpus = corpus.filter((c) => c.sectionType && sectionTypes.includes(c.sectionType));
	if (filingIds?.length) corpus = corpus.filter((c) => filingIds.includes(c.filingId));
	if (forms?.length) corpus = corpus.filter((c) => forms.includes(c.form));

	return corpus
		.map((chunk) => ({ chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding!) }))
		.filter((r) => r.score > minScore)
		.sort((a, b) => b.score - a.score)
		.slice(0, topK);
}

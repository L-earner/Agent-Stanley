import type { FilingChunk, SectionType } from "../schema.ts";

// ---------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------

/** Lowercase alphanumeric tokens, drop single characters. */
export function tokenize(text: string): string[] {
	return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1);
}

// ---------------------------------------------------------------------------
// BM25 scoring
// ---------------------------------------------------------------------------

const BM25_K1 = 1.5;
const BM25_B = 0.75;

type CorpusStats = {
	idf: Map<string, number>;
	avgDl: number;
};

function buildCorpusStats(tokenizedDocs: string[][]): CorpusStats {
	const N = tokenizedDocs.length;
	const df = new Map<string, number>();
	let totalLen = 0;

	for (const terms of tokenizedDocs) {
		totalLen += terms.length;
		for (const term of new Set(terms)) {
			df.set(term, (df.get(term) ?? 0) + 1);
		}
	}

	const idf = new Map<string, number>();
	for (const [term, freq] of df) {
		idf.set(term, Math.log((N - freq + 0.5) / (freq + 0.5) + 1));
	}

	return { idf, avgDl: N === 0 ? 1 : totalLen / N };
}

function bm25Score(queryTerms: string[], docTerms: string[], stats: CorpusStats): number {
	const tf = new Map<string, number>();
	for (const t of docTerms) tf.set(t, (tf.get(t) ?? 0) + 1);

	const dl = docTerms.length;
	let score = 0;
	for (const term of queryTerms) {
		const termIdf = stats.idf.get(term) ?? 0;
		if (termIdf === 0) continue;
		const termTf = tf.get(term) ?? 0;
		score += termIdf * ((termTf * (BM25_K1 + 1)) / (termTf + BM25_K1 * (1 - BM25_B + BM25_B * (dl / stats.avgDl))));
	}
	return score;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type LexicalSearchOptions = {
	topK?: number;
	sectionTypes?: SectionType[];
	filingIds?: string[];
	forms?: string[];
};

export type LexicalResult = {
	chunk: FilingChunk;
	score: number;
};

/**
 * BM25 lexical search over a list of FilingChunks.
 *
 * Accepts pre-loaded chunks (no repo dependency) so the caller decides
 * what corpus to search over. Returns up to `topK` results sorted by score.
 */
export function lexicalSearch(
	query: string,
	chunks: FilingChunk[],
	options: LexicalSearchOptions = {},
): LexicalResult[] {
	const { topK = 10, sectionTypes, filingIds, forms } = options;

	let corpus = chunks;
	if (sectionTypes?.length) corpus = corpus.filter((c) => c.sectionType && sectionTypes.includes(c.sectionType));
	if (filingIds?.length) corpus = corpus.filter((c) => filingIds.includes(c.filingId));
	if (forms?.length) corpus = corpus.filter((c) => forms.includes(c.form));

	if (corpus.length === 0) return [];

	const queryTerms = tokenize(query);
	if (queryTerms.length === 0) return [];

	const tokenizedDocs = corpus.map((c) => tokenize(c.text));
	const stats = buildCorpusStats(tokenizedDocs);

	const scored = corpus
		.map((chunk, i) => ({ chunk, score: bm25Score(queryTerms, tokenizedDocs[i], stats) }))
		.filter((r) => r.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, topK);

	return scored;
}

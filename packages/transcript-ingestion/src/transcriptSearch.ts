import type { SpeakerRole, TranscriptChunk, TranscriptSection } from "@earendil-works/pi-research-db";
import { tokenize } from "@earendil-works/pi-research-db";

// ---------------------------------------------------------------------------
// BM25 over TranscriptChunk[]
// Reuses tokenize() from research-db but operates on TranscriptChunk shape.
// ---------------------------------------------------------------------------

const BM25_K1 = 1.5;
const BM25_B = 0.75;

function buildCorpusStats(tokenizedDocs: string[][]): { idf: Map<string, number>; avgDl: number } {
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

function bm25Score(queryTerms: string[], docTerms: string[], idf: Map<string, number>, avgDl: number): number {
	const tf = new Map<string, number>();
	for (const t of docTerms) tf.set(t, (tf.get(t) ?? 0) + 1);

	const dl = docTerms.length;
	let score = 0;
	for (const term of queryTerms) {
		const termIdf = idf.get(term) ?? 0;
		if (termIdf === 0) continue;
		const termTf = tf.get(term) ?? 0;
		score += termIdf * ((termTf * (BM25_K1 + 1)) / (termTf + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgDl))));
	}
	return score;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type TranscriptSearchOptions = {
	topK?: number;
	sections?: TranscriptSection[];
	speakerRoles?: SpeakerRole[];
	transcriptIds?: string[];
};

export type TranscriptSearchResult = {
	chunk: TranscriptChunk;
	score: number;
};

/**
 * BM25 lexical search over a list of TranscriptChunks.
 * Applies optional pre-filters before scoring.
 */
export function searchTranscriptChunks(
	query: string,
	chunks: TranscriptChunk[],
	options: TranscriptSearchOptions = {},
): TranscriptSearchResult[] {
	const { topK = 10, sections, speakerRoles, transcriptIds } = options;

	let corpus = chunks;
	if (sections?.length) corpus = corpus.filter((c) => sections.includes(c.section));
	if (speakerRoles?.length) corpus = corpus.filter((c) => c.speakerRole && speakerRoles.includes(c.speakerRole));
	if (transcriptIds?.length) corpus = corpus.filter((c) => transcriptIds.includes(c.transcriptId));

	if (corpus.length === 0) return [];

	const queryTerms = tokenize(query);
	if (queryTerms.length === 0) return [];

	const tokenizedDocs = corpus.map((c) => tokenize(c.text));
	const stats = buildCorpusStats(tokenizedDocs);

	return corpus
		.map((chunk, i) => ({ chunk, score: bm25Score(queryTerms, tokenizedDocs[i], stats.idf, stats.avgDl) }))
		.filter((r) => r.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, topK);
}

import { describe, expect, it, vi } from "vitest";
import type { FilingChunk } from "../src/schema.ts";
import { evidenceIdForChunk, hybridSearch, searchResultToEvidence } from "../src/search/hybridSearch.ts";
import { lexicalSearch, tokenize } from "../src/search/lexicalSearch.ts";
import type { EmbeddingProvider } from "../src/search/vectorSearch.ts";
import { cosineSimilarity, DeterministicEmbeddingProvider, vectorSearch } from "../src/search/vectorSearch.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _chunkSeq = 0;

function makeChunk(overrides: Partial<FilingChunk> & { text: string }): FilingChunk {
	const id = `chunk-${++_chunkSeq}`;
	const { text, ...rest } = overrides;
	return {
		id,
		companyId: "aapl-id",
		filingId: "filing-1",
		form: "10-K",
		filingDate: "2023-11-03",
		sectionType: "mda",
		text,
		textHash: `hash-${id}`,
		createdAt: "2026-01-01T00:00:00.000Z",
		...rest,
	};
}

// Three test chunks covering different topics
const chunkRevenue = makeChunk({
	text: "Apple revenue grew 5% to 394 billion dollars in fiscal year 2022 reflecting strong iPhone demand",
	sectionType: "mda",
});
const chunkRisk = makeChunk({
	text: "Risk factors include supply chain disruptions and competitive pressures in smartphone markets",
	sectionType: "risk_factors",
});
const chunkRevenue2 = makeChunk({
	text: "Total revenue increased year over year driven by iPhone and Services growth",
	sectionType: "mda",
});
const chunkCash = makeChunk({
	text: "The company maintains strong cash reserves and short-term investments for operational purposes",
	sectionType: "mda",
});

// Assign explicit embeddings for vector search tests
// Dimensions: 8. "Revenue" direction = [1,0,...], "Risk" direction = [0,1,...]
const DIM = 8;
function unit(d: number[]): number[] {
	const mag = Math.sqrt(d.reduce((s, v) => s + v * v, 0));
	return d.map((v) => v / mag);
}
chunkRevenue.embedding = unit([1, 0, 0, 0, 0, 0, 0, 0]);
chunkRisk.embedding = unit([0, 1, 0, 0, 0, 0, 0, 0]);
chunkRevenue2.embedding = unit([0.9, 0.1, 0, 0, 0, 0, 0, 0]);
chunkCash.embedding = unit([0.5, 0.2, 0, 0, 0, 0, 0, 0]);

const allChunks = [chunkRevenue, chunkRisk, chunkRevenue2, chunkCash];

// Mock provider always returns the "revenue" query vector
function mockProvider(queryVector: number[]): EmbeddingProvider {
	return {
		dimensions: DIM,
		embed: vi.fn().mockResolvedValue(queryVector),
		embedBatch: vi.fn().mockResolvedValue([queryVector]),
	};
}

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

describe("tokenize", () => {
	it("lowercases and splits on non-alphanumeric", () => {
		expect(tokenize("Apple's Revenue!")).toEqual(["apple", "revenue"]);
	});

	it("drops single-character tokens", () => {
		expect(tokenize("a big deal")).toEqual(["big", "deal"]);
	});

	it("handles empty string", () => {
		expect(tokenize("")).toEqual([]);
	});

	it("handles numbers", () => {
		const tokens = tokenize("Revenue grew 5% in Q3 2023");
		expect(tokens).toContain("revenue");
		expect(tokens).toContain("2023");
	});
});

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------

describe("cosineSimilarity", () => {
	it("returns 1.0 for identical unit vectors", () => {
		const v = [1, 0, 0, 0];
		expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
	});

	it("returns 0.0 for orthogonal vectors", () => {
		expect(cosineSimilarity([1, 0, 0, 0], [0, 1, 0, 0])).toBeCloseTo(0.0);
	});

	it("returns -1.0 for opposite vectors", () => {
		expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
	});

	it("handles non-unit vectors correctly", () => {
		expect(cosineSimilarity([2, 0], [5, 0])).toBeCloseTo(1.0);
	});

	it("returns 0 for zero vector", () => {
		expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
	});

	it("returns 0 for mismatched lengths", () => {
		expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// lexicalSearch
// ---------------------------------------------------------------------------

describe("lexicalSearch", () => {
	it("returns chunks containing query terms", () => {
		const results = lexicalSearch("apple revenue", allChunks);
		const ids = results.map((r) => r.chunk.id);
		expect(ids).toContain(chunkRevenue.id);
		expect(ids).toContain(chunkRevenue2.id);
	});

	it("ranks chunks with more matching terms higher", () => {
		// "apple revenue" — chunkRevenue has both; chunkRevenue2 has only "revenue"
		const results = lexicalSearch("apple revenue", allChunks);
		const revenueIdx = results.findIndex((r) => r.chunk.id === chunkRevenue.id);
		const revenue2Idx = results.findIndex((r) => r.chunk.id === chunkRevenue2.id);
		expect(revenueIdx).toBeLessThan(revenue2Idx);
	});

	it("returns empty for a query with no matching terms", () => {
		const results = lexicalSearch("blockchain ethereum defi", allChunks);
		expect(results).toHaveLength(0);
	});

	it("filters by sectionType", () => {
		const results = lexicalSearch("revenue", allChunks, { sectionTypes: ["risk_factors"] });
		for (const r of results) {
			expect(r.chunk.sectionType).toBe("risk_factors");
		}
	});

	it("filters by filingId", () => {
		const extraChunk = makeChunk({ text: "Revenue from other filing", filingId: "filing-2" });
		const results = lexicalSearch("revenue", [...allChunks, extraChunk], { filingIds: ["filing-2"] });
		expect(results.every((r) => r.chunk.filingId === "filing-2")).toBe(true);
	});

	it("respects topK", () => {
		const results = lexicalSearch("revenue", allChunks, { topK: 1 });
		expect(results).toHaveLength(1);
	});

	it("all results have a positive score", () => {
		const results = lexicalSearch("revenue growth", allChunks);
		for (const r of results) {
			expect(r.score).toBeGreaterThan(0);
		}
	});
});

// ---------------------------------------------------------------------------
// vectorSearch
// ---------------------------------------------------------------------------

describe("vectorSearch", () => {
	const revenueQueryVec = unit([1, 0, 0, 0, 0, 0, 0, 0]);

	it("returns chunks sorted by cosine similarity", () => {
		const results = vectorSearch(revenueQueryVec, allChunks);
		expect(results[0].chunk.id).toBe(chunkRevenue.id); // cos = 1.0
	});

	it("includes chunkRevenue2 but excludes orthogonal chunkRisk for revenue query", () => {
		const results = vectorSearch(revenueQueryVec, allChunks);
		const ids = results.map((r) => r.chunk.id);
		// chunkRevenue2 has cosine ≈ 0.99 — should appear
		expect(ids).toContain(chunkRevenue2.id);
		// chunkRisk is orthogonal (cosine = 0) — filtered out by default minScore > 0
		expect(ids).not.toContain(chunkRisk.id);
	});

	it("skips chunks without embeddings", () => {
		const noEmbedding = makeChunk({ text: "Some filing text without embedding" });
		const results = vectorSearch(revenueQueryVec, [...allChunks, noEmbedding]);
		const ids = results.map((r) => r.chunk.id);
		expect(ids).not.toContain(noEmbedding.id);
	});

	it("filters by sectionType", () => {
		const results = vectorSearch(revenueQueryVec, allChunks, { sectionTypes: ["risk_factors"] });
		for (const r of results) {
			expect(r.chunk.sectionType).toBe("risk_factors");
		}
	});

	it("respects topK", () => {
		const results = vectorSearch(revenueQueryVec, allChunks, { topK: 2 });
		expect(results).toHaveLength(2);
	});

	it("all returned scores are > minScore (default 0)", () => {
		const results = vectorSearch(revenueQueryVec, allChunks);
		for (const r of results) {
			expect(r.score).toBeGreaterThan(0);
		}
	});
});

// ---------------------------------------------------------------------------
// DeterministicEmbeddingProvider
// ---------------------------------------------------------------------------

describe("DeterministicEmbeddingProvider", () => {
	it("returns a vector of the configured dimension", async () => {
		const provider = new DeterministicEmbeddingProvider(16);
		const v = await provider.embed("hello");
		expect(v).toHaveLength(16);
	});

	it("returns a unit vector", async () => {
		const provider = new DeterministicEmbeddingProvider(8);
		const v = await provider.embed("apple revenue");
		const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
		expect(mag).toBeCloseTo(1.0);
	});

	it("is deterministic — same text produces same vector", async () => {
		const provider = new DeterministicEmbeddingProvider(8);
		const a = await provider.embed("fiscal year 2023");
		const b = await provider.embed("fiscal year 2023");
		expect(a).toEqual(b);
	});

	it("produces different vectors for different inputs", async () => {
		const provider = new DeterministicEmbeddingProvider(8);
		const a = await provider.embed("revenue");
		const b = await provider.embed("risk factors");
		expect(a).not.toEqual(b);
	});

	it("embedBatch returns one vector per text", async () => {
		const provider = new DeterministicEmbeddingProvider(8);
		const results = await provider.embedBatch(["text one", "text two", "text three"]);
		expect(results).toHaveLength(3);
		for (const v of results) expect(v).toHaveLength(8);
	});
});

// ---------------------------------------------------------------------------
// hybridSearch
// ---------------------------------------------------------------------------

describe("hybridSearch", () => {
	it("returns results from both lexical and vector sources", async () => {
		const provider = mockProvider(unit([1, 0, 0, 0, 0, 0, 0, 0]));
		const results = await hybridSearch("apple revenue", allChunks, provider);
		expect(results.length).toBeGreaterThan(0);
		// At least one result should appear in both (chunkRevenue matches lexically and vectorally)
		const rrfBoth = results.filter((r) => r.lexicalRank !== undefined && r.vectorRank !== undefined);
		expect(rrfBoth.length).toBeGreaterThan(0);
	});

	it("top result for revenue query is a revenue chunk", async () => {
		const provider = mockProvider(unit([1, 0, 0, 0, 0, 0, 0, 0]));
		const results = await hybridSearch("apple revenue", allChunks, provider);
		expect([chunkRevenue.id, chunkRevenue2.id]).toContain(results[0].chunk.id);
	});

	it("falls back to lexical-only when provider is null", async () => {
		const results = await hybridSearch("revenue growth", allChunks, null);
		expect(results.length).toBeGreaterThan(0);
		for (const r of results) {
			expect(r.lexicalRank).toBeDefined();
			expect(r.vectorRank).toBeUndefined();
		}
	});

	it("filters by sectionType", async () => {
		const provider = mockProvider(unit([1, 0, 0, 0, 0, 0, 0, 0]));
		const results = await hybridSearch("risk revenue supply", allChunks, provider, {
			sectionTypes: ["risk_factors"],
		});
		for (const r of results) {
			expect(r.chunk.sectionType).toBe("risk_factors");
		}
	});

	it("respects topK", async () => {
		const provider = mockProvider(unit([1, 0, 0, 0, 0, 0, 0, 0]));
		const results = await hybridSearch("revenue", allChunks, provider, { topK: 2 });
		expect(results.length).toBeLessThanOrEqual(2);
	});

	it("calls rerank when provided", async () => {
		const provider = mockProvider(unit([1, 0, 0, 0, 0, 0, 0, 0]));
		const rerank = vi.fn().mockImplementation(async (_q, r) => r);
		await hybridSearch("revenue", allChunks, provider, { rerank });
		expect(rerank).toHaveBeenCalledOnce();
	});

	it("RRF scores are higher for chunks appearing in both lists", async () => {
		const provider = mockProvider(unit([1, 0, 0, 0, 0, 0, 0, 0]));
		const results = await hybridSearch("apple revenue", allChunks, provider);
		const bothLists = results.filter((r) => r.lexicalRank !== undefined && r.vectorRank !== undefined);
		const onlyOne = results.filter((r) => (r.lexicalRank === undefined) !== (r.vectorRank === undefined));
		if (bothLists.length > 0 && onlyOne.length > 0) {
			expect(bothLists[0].score).toBeGreaterThan(onlyOne[onlyOne.length - 1].score);
		}
	});
});

// ---------------------------------------------------------------------------
// searchResultToEvidence + evidenceIdForChunk
// ---------------------------------------------------------------------------

describe("searchResultToEvidence", () => {
	it("produces an Evidence object with filing sourceType", () => {
		const result = { chunk: chunkRevenue, score: 0.9, lexicalRank: 0 };
		const ev = searchResultToEvidence(result);
		expect(ev.sourceType).toBe("filing");
		expect(ev.companyId).toBe(chunkRevenue.companyId);
		expect(ev.filingChunkId).toBe(chunkRevenue.id);
		expect(ev.filingId).toBe(chunkRevenue.filingId);
	});

	it("truncates long snippet to snippetLength", () => {
		const longChunk = makeChunk({ text: "word ".repeat(200) });
		const result = { chunk: longChunk, score: 0.5 };
		const ev = searchResultToEvidence(result, 100);
		expect(ev.snippet.length).toBeLessThanOrEqual(105); // 100 + "…"
	});

	it("does not truncate short text", () => {
		const result = { chunk: chunkRevenue, score: 0.9 };
		const ev = searchResultToEvidence(result);
		expect(ev.snippet).toBe(chunkRevenue.text);
	});

	it("includes score and rank in metadata", () => {
		const result = { chunk: chunkRevenue, score: 0.75, lexicalRank: 2, vectorRank: 1 };
		const ev = searchResultToEvidence(result);
		expect(ev.metadata.score).toBe(0.75);
		expect(ev.metadata.lexicalRank).toBe(2);
		expect(ev.metadata.vectorRank).toBe(1);
	});

	it("title includes form and filing date", () => {
		const result = { chunk: chunkRevenue, score: 0.9 };
		const ev = searchResultToEvidence(result);
		expect(ev.title).toContain("10-K");
		expect(ev.title).toContain("2023-11");
	});
});

describe("evidenceIdForChunk", () => {
	it("returns a 16-char hex ID", () => {
		const id = evidenceIdForChunk("chunk-1", "what is revenue?");
		expect(id).toHaveLength(16);
		expect(id).toMatch(/^[0-9a-f]+$/);
	});

	it("is deterministic", () => {
		const a = evidenceIdForChunk("chunk-1", "what is revenue?");
		const b = evidenceIdForChunk("chunk-1", "what is revenue?");
		expect(a).toBe(b);
	});

	it("differs for different queries on the same chunk", () => {
		const a = evidenceIdForChunk("chunk-1", "revenue?");
		const b = evidenceIdForChunk("chunk-1", "risk factors?");
		expect(a).not.toBe(b);
	});
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryTranscriptChunkRepository, InMemoryTranscriptRepository } from "@earendil-works/pi-research-db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NinjasTranscriptProvider } from "../src/providers/ninjasTranscriptProvider.ts";
import type { RawTranscript } from "../src/TranscriptProvider.ts";
import { ingestAllTranscripts, ingestTranscript } from "../src/transcriptIngestor.ts";
import { parseTranscript } from "../src/transcriptParser.ts";
import { searchTranscriptChunks } from "../src/transcriptSearch.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function fixture(name: string): string {
	return readFileSync(join(__dirname, "../src/fixtures", name), "utf-8");
}

function loadTranscript(): RawTranscript {
	const raw = JSON.parse(fixture("aapl-transcript.json"));
	return {
		date: raw.date,
		timestamp: raw.timestamp,
		ticker: raw.ticker,
		cik: raw.cik,
		year: Number(raw.year),
		quarter: Number(raw.quarter),
		earningsTiming: raw.earnings_timing,
		transcript: raw.transcript,
		transcriptSplit: raw.transcript_split?.map((t: any) => ({
			speaker: t.speaker,
			company: t.company,
			role: t.role,
			text: t.text,
			speakerType: t.speaker_type,
			isQa: t.is_qa,
			sentiment: t.sentiment,
		})),
	};
}

const COMPANY_ID = "aapl-test-id";

// ---------------------------------------------------------------------------
// NinjasTranscriptProvider
// ---------------------------------------------------------------------------

describe("NinjasTranscriptProvider", () => {
	function makeMockProvider(searchData: unknown, transcriptData: unknown) {
		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => searchData })
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => transcriptData });
		return new NinjasTranscriptProvider({ apiKey: "test-key", fetch: mockFetch as unknown as typeof fetch });
	}

	it("searchTranscripts returns normalised results", async () => {
		const searchData = JSON.parse(fixture("aapl-transcript-search.json"));
		const provider = makeMockProvider(searchData, {});
		const results = await provider.searchTranscripts({ ticker: "AAPL" });
		expect(results.length).toBe(8);
		expect(results[0]).toMatchObject({ ticker: "AAPL", year: 2024, quarter: 4 });
	});

	it("year and quarter are Numbers not strings", async () => {
		const searchData = JSON.parse(fixture("aapl-transcript-search.json"));
		const provider = makeMockProvider(searchData, {});
		const results = await provider.searchTranscripts({ ticker: "AAPL" });
		for (const r of results) {
			expect(typeof r.year).toBe("number");
			expect(typeof r.quarter).toBe("number");
		}
	});

	it("fetchTranscript returns normalised RawTranscript", async () => {
		const transcriptData = JSON.parse(fixture("aapl-transcript.json"));
		const provider = makeMockProvider([], transcriptData);
		await provider.searchTranscripts({ ticker: "AAPL" }); // consume first mock
		const result = await provider.fetchTranscript("AAPL", 2023, 4);
		expect(result.ticker).toBe("AAPL");
		expect(result.year).toBe(2023);
		expect(result.quarter).toBe(4);
		expect(result.transcriptSplit?.length).toBeGreaterThan(0);
	});

	it("normalises transcript_split snake_case to camelCase", async () => {
		const transcriptData = JSON.parse(fixture("aapl-transcript.json"));
		const provider = makeMockProvider([], transcriptData);
		await provider.searchTranscripts({ ticker: "AAPL" });
		const result = await provider.fetchTranscript("AAPL", 2023, 4);
		const firstTurn = result.transcriptSplit![0];
		expect(firstTurn).toHaveProperty("speakerType");
		expect(firstTurn).toHaveProperty("isQa");
		expect(firstTurn).not.toHaveProperty("speaker_type");
	});

	it("throws on non-OK HTTP responses", async () => {
		const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });
		const provider = new NinjasTranscriptProvider({ apiKey: "bad-key", fetch: mockFetch as unknown as typeof fetch });
		await expect(provider.searchTranscripts({ ticker: "AAPL" })).rejects.toThrow("403");
	});
});

// ---------------------------------------------------------------------------
// parseTranscript — transcript_split path
// ---------------------------------------------------------------------------

describe("parseTranscript (transcript_split)", () => {
	it("returns a Transcript record and chunks", () => {
		const raw = loadTranscript();
		const { transcript, chunks } = parseTranscript(raw, COMPANY_ID);
		expect(transcript.companyId).toBe(COMPANY_ID);
		expect(transcript.fiscalPeriod).toBe("Q4");
		expect(transcript.fiscalYear).toBe(2023);
		expect(chunks.length).toBeGreaterThan(0);
	});

	it("assigns prepared_remarks section to pre-QA turns", () => {
		const raw = loadTranscript();
		const { chunks } = parseTranscript(raw, COMPANY_ID);
		const prepChunks = chunks.filter((c) => c.section === "prepared_remarks");
		expect(prepChunks.length).toBeGreaterThan(0);
	});

	it("assigns qa section to Q&A turns", () => {
		const raw = loadTranscript();
		const { chunks } = parseTranscript(raw, COMPANY_ID);
		const qaChunks = chunks.filter((c) => c.section === "qa");
		expect(qaChunks.length).toBeGreaterThan(0);
	});

	it("assigns CEO role to Tim Cook", () => {
		const raw = loadTranscript();
		const { chunks } = parseTranscript(raw, COMPANY_ID);
		const cookChunks = chunks.filter((c) => c.speaker === "Tim Cook");
		expect(cookChunks.length).toBeGreaterThan(0);
		expect(cookChunks[0].speakerRole).toBe("CEO");
	});

	it("assigns CFO role to Luca Maestri", () => {
		const raw = loadTranscript();
		const { chunks } = parseTranscript(raw, COMPANY_ID);
		const maestriChunks = chunks.filter((c) => c.speaker === "Luca Maestri");
		expect(maestriChunks[0].speakerRole).toBe("CFO");
	});

	it("assigns Analyst role to investor speakers", () => {
		const raw = loadTranscript();
		const { chunks } = parseTranscript(raw, COMPANY_ID);
		const analystChunks = chunks.filter((c) => c.speakerRole === "Analyst");
		expect(analystChunks.length).toBeGreaterThan(0);
	});

	it("assigns Operator role to operator speaker", () => {
		const raw = loadTranscript();
		const { chunks } = parseTranscript(raw, COMPANY_ID);
		const opChunks = chunks.filter((c) => c.speakerRole === "Operator");
		expect(opChunks.length).toBeGreaterThan(0);
	});

	it("each chunk has a non-empty textHash", () => {
		const raw = loadTranscript();
		const { chunks } = parseTranscript(raw, COMPANY_ID);
		for (const c of chunks) {
			expect(c.textHash).toMatch(/^[0-9a-f]{64}$/);
		}
	});

	it("chunk IDs are unique", () => {
		const raw = loadTranscript();
		const { chunks } = parseTranscript(raw, COMPANY_ID);
		const ids = chunks.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("transcript ID is deterministic", () => {
		const raw = loadTranscript();
		const a = parseTranscript(raw, COMPANY_ID);
		const b = parseTranscript(raw, COMPANY_ID);
		expect(a.transcript.id).toBe(b.transcript.id);
	});
});

// ---------------------------------------------------------------------------
// parseTranscript — raw text fallback path
// ---------------------------------------------------------------------------

describe("parseTranscript (raw text fallback)", () => {
	it("parses when transcript_split is absent", () => {
		const raw = { ...loadTranscript(), transcriptSplit: undefined };
		const { chunks } = parseTranscript(raw, COMPANY_ID);
		expect(chunks.length).toBeGreaterThan(0);
	});

	it("chunks have section: unknown when no split available", () => {
		const raw = { ...loadTranscript(), transcriptSplit: undefined };
		const { chunks } = parseTranscript(raw, COMPANY_ID);
		for (const c of chunks) {
			expect(c.section).toBe("unknown");
		}
	});
});

// ---------------------------------------------------------------------------
// searchTranscriptChunks
// ---------------------------------------------------------------------------

describe("searchTranscriptChunks", () => {
	let chunks: ReturnType<typeof parseTranscript>["chunks"];

	beforeEach(() => {
		const raw = loadTranscript();
		chunks = parseTranscript(raw, COMPANY_ID).chunks;
	});

	it("returns chunks matching the query", () => {
		const results = searchTranscriptChunks("revenue growth services record", chunks);
		expect(results.length).toBeGreaterThan(0);
	});

	it("Services revenue chunk scores high for relevant query", () => {
		const results = searchTranscriptChunks("services revenue record subscription", chunks);
		// Luca Maestri's Services answer should rank in top 3
		const hasServicesChunk = results
			.slice(0, 3)
			.some((r) => r.chunk.text.toLowerCase().includes("services") && r.chunk.text.toLowerCase().includes("record"));
		expect(hasServicesChunk).toBe(true);
	});

	it("filters by section", () => {
		const results = searchTranscriptChunks("revenue", chunks, { sections: ["qa"] });
		for (const r of results) {
			expect(r.chunk.section).toBe("qa");
		}
	});

	it("filters by speakerRole", () => {
		const results = searchTranscriptChunks("revenue", chunks, { speakerRoles: ["CEO"] });
		for (const r of results) {
			expect(r.chunk.speakerRole).toBe("CEO");
		}
	});

	it("returns empty for unknown query", () => {
		const results = searchTranscriptChunks("blockchain defi nft", chunks);
		expect(results).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// ingestTranscript
// ---------------------------------------------------------------------------

describe("ingestTranscript", () => {
	function makeMockProvider() {
		const transcriptData = JSON.parse(fixture("aapl-transcript.json"));
		const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => transcriptData });
		return new NinjasTranscriptProvider({ apiKey: "test-key", fetch: mockFetch as unknown as typeof fetch });
	}

	it("ingests and creates chunks", async () => {
		const provider = makeMockProvider();
		const transcriptRepo = new InMemoryTranscriptRepository();
		const chunkRepo = new InMemoryTranscriptChunkRepository();

		const result = await ingestTranscript({ ticker: "AAPL", year: 2023, quarter: 4 }, COMPANY_ID, provider, {
			transcriptRepo,
			chunkRepo,
		});

		expect(result.skipped).toBe(false);
		expect(result.chunksCreated).toBeGreaterThan(0);

		const storedTranscript = await transcriptRepo.findById(result.transcriptId);
		expect(storedTranscript).toBeDefined();
		expect(storedTranscript!.fiscalYear).toBe(2023);
	});

	it("is idempotent — re-ingest skips", async () => {
		const provider = makeMockProvider();
		const transcriptRepo = new InMemoryTranscriptRepository();
		const chunkRepo = new InMemoryTranscriptChunkRepository();
		const deps = { transcriptRepo, chunkRepo };

		await ingestTranscript({ ticker: "AAPL", year: 2023, quarter: 4 }, COMPANY_ID, provider, deps);
		const second = await ingestTranscript({ ticker: "AAPL", year: 2023, quarter: 4 }, COMPANY_ID, provider, deps);

		expect(second.skipped).toBe(true);
		expect(second.skipReason).toBe("already ingested");
	});

	it("forceRefresh re-creates chunks", async () => {
		const provider = makeMockProvider();
		const transcriptRepo = new InMemoryTranscriptRepository();
		const chunkRepo = new InMemoryTranscriptChunkRepository();
		const deps = { transcriptRepo, chunkRepo };

		const first = await ingestTranscript({ ticker: "AAPL", year: 2023, quarter: 4 }, COMPANY_ID, provider, deps);
		const second = await ingestTranscript(
			{ ticker: "AAPL", year: 2023, quarter: 4, forceRefresh: true },
			COMPANY_ID,
			provider,
			deps,
		);

		expect(second.skipped).toBe(false);
		expect(second.chunksCreated).toBe(first.chunksCreated);
	});
});

// ---------------------------------------------------------------------------
// ingestAllTranscripts
// ---------------------------------------------------------------------------

describe("ingestAllTranscripts", () => {
	it("ingests multiple transcripts from search results", async () => {
		const searchData = JSON.parse(fixture("aapl-transcript-search.json"));
		const transcriptData = JSON.parse(fixture("aapl-transcript.json"));
		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => searchData })
			.mockResolvedValue({ ok: true, status: 200, json: async () => transcriptData });

		const provider = new NinjasTranscriptProvider({
			apiKey: "test-key",
			fetch: mockFetch as unknown as typeof fetch,
		});
		const transcriptRepo = new InMemoryTranscriptRepository();
		const chunkRepo = new InMemoryTranscriptChunkRepository();

		const results = await ingestAllTranscripts(
			"AAPL",
			COMPANY_ID,
			provider,
			{ transcriptRepo, chunkRepo },
			{ limit: 2 },
		);

		expect(results).toHaveLength(2);
		expect(results.every((r) => !r.skipped)).toBe(true);
	});
});

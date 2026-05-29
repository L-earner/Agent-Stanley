import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryFilingChunkRepository, InMemoryFilingRepository } from "@earendil-works/pi-research-db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chunkText } from "../src/chunker.ts";
import { FilingDownloader } from "../src/filingDownloader.ts";
import { parseAccessionNumber, parseFilingResult, parseFilingResults } from "../src/filingParser.ts";
import { cleanHtml } from "../src/htmlCleaner.ts";
import { ingestFilings } from "../src/ingestionPipeline.ts";
import { NinjasSecClient } from "../src/ninjasClient.ts";
import { sectionize10K, sectionize10Q } from "../src/sectionizer.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function fixture(name: string): string {
	return readFileSync(join(__dirname, "../src/fixtures", name), "utf-8");
}

// ---------------------------------------------------------------------------
// htmlCleaner
// ---------------------------------------------------------------------------

describe("cleanHtml", () => {
	it("strips script and style tags entirely", () => {
		const html =
			"<html><head><style>body{color:red}</style><script>var x=1;</script></head><body><p>Hello</p></body></html>";
		const text = cleanHtml(html);
		expect(text).not.toContain("color:red");
		expect(text).not.toContain("var x");
		expect(text).toContain("Hello");
	});

	it("preserves paragraph content as separate lines", () => {
		const html = "<p>First paragraph.</p><p>Second paragraph.</p>";
		const text = cleanHtml(html);
		expect(text).toContain("First paragraph.");
		expect(text).toContain("Second paragraph.");
	});

	it("decodes HTML entities", () => {
		const html = "<p>Apple&#39;s revenue was $394 billion &amp; growing.</p>";
		const text = cleanHtml(html);
		expect(text).toContain("Apple's");
		expect(text).toContain("&");
	});

	it("decodes numeric entities", () => {
		const html = "<p>Revenue&#160;grew.</p>";
		const text = cleanHtml(html);
		expect(text).toContain("Revenue");
		expect(text).toContain("grew");
	});

	it("handles the mock 10-K fixture", () => {
		const html = fixture("mock-10k.html");
		const text = cleanHtml(html);
		expect(text).toContain("Apple Inc.");
		expect(text).toContain("ITEM 1A");
		expect(text).not.toContain("<script");
		expect(text).not.toContain("<style");
	});

	it("removes very short lines (noise filter)", () => {
		const html = "<p>OK</p><p>This is a real sentence with sufficient length.</p>";
		const text = cleanHtml(html, { minLineLength: 4 });
		expect(text).not.toContain("OK");
		expect(text).toContain("This is a real sentence");
	});
});

// ---------------------------------------------------------------------------
// sectionizer — 10-K
// ---------------------------------------------------------------------------

describe("sectionize10K", () => {
	it("extracts at least the four main sections from mock fixture", () => {
		const html = fixture("mock-10k.html");
		const text = cleanHtml(html);
		const result = sectionize10K(text, "filing-1");
		const labels = result.sections.map((s) => s.itemLabel);

		expect(labels).toContain("Item 1");
		expect(labels).toContain("Item 1A");
		expect(labels).toContain("Item 7");
		expect(labels).toContain("Item 8");
	});

	it("assigns correct sectionType to each section", () => {
		const html = fixture("mock-10k.html");
		const text = cleanHtml(html);
		const { sections } = sectionize10K(text, "filing-1");

		const item1A = sections.find((s) => s.itemLabel === "Item 1A");
		expect(item1A?.sectionType).toBe("risk_factors");

		const item7 = sections.find((s) => s.itemLabel === "Item 7");
		expect(item7?.sectionType).toBe("mda");

		const item8 = sections.find((s) => s.itemLabel === "Item 8");
		expect(item8?.sectionType).toBe("financial_statements");
	});

	it("section text has meaningful content (not just a TOC entry)", () => {
		const html = fixture("mock-10k.html");
		const text = cleanHtml(html);
		const { sections } = sectionize10K(text, "filing-1");

		for (const section of sections) {
			expect(section.text.length).toBeGreaterThan(200);
		}
	});

	it("skips TOC entries in diagnostics", () => {
		const html = fixture("mock-10k.html");
		const text = cleanHtml(html);
		const { diagnostics } = sectionize10K(text, "filing-1");

		// TOC has 4 item headings, actual sections also have 4 → 4 TOC entries skipped
		expect(diagnostics.tocSkipped).toBeGreaterThan(0);
	});

	it("attaches filingId to each section", () => {
		const html = fixture("mock-10k.html");
		const text = cleanHtml(html);
		const { sections } = sectionize10K(text, "my-filing-id");

		for (const section of sections) {
			expect(section.filingId).toBe("my-filing-id");
		}
	});
});

// ---------------------------------------------------------------------------
// sectionizer — 10-Q
// ---------------------------------------------------------------------------

describe("sectionize10Q", () => {
	it("extracts Part I and Part II sections from mock fixture", () => {
		const html = fixture("mock-10q.html");
		const text = cleanHtml(html);
		const { sections } = sectionize10Q(text, "filing-q");
		const labels = sections.map((s) => s.itemLabel);

		expect(labels).toContain("Part I Item 1");
		expect(labels).toContain("Part I Item 2");
		expect(labels).toContain("Part II Item 1");
		expect(labels).toContain("Part II Item 1A");
	});

	it("assigns correct sectionType to Part I Item 2 (MD&A)", () => {
		const html = fixture("mock-10q.html");
		const text = cleanHtml(html);
		const { sections } = sectionize10Q(text, "filing-q");

		const mda = sections.find((s) => s.itemLabel === "Part I Item 2");
		expect(mda?.sectionType).toBe("mda");
	});

	it("assigns correct sectionType to Part II Item 1A (risk_factors)", () => {
		const html = fixture("mock-10q.html");
		const text = cleanHtml(html);
		const { sections } = sectionize10Q(text, "filing-q");

		const riskFactors = sections.find((s) => s.itemLabel === "Part II Item 1A");
		expect(riskFactors?.sectionType).toBe("risk_factors");
	});
});

// ---------------------------------------------------------------------------
// chunker
// ---------------------------------------------------------------------------

describe("chunkText", () => {
	it("returns a single chunk for short text", () => {
		const text = "This is a short piece of financial disclosure text.";
		const chunks = chunkText(text);
		expect(chunks).toHaveLength(1);
		expect(chunks[0].text).toBe(text);
	});

	it("splits long text into multiple chunks", () => {
		// Generate ~5000 chars of text
		const text = "Apple reported strong revenue growth. ".repeat(140);
		const chunks = chunkText(text, { targetTokens: 100, overlapTokens: 20 });
		expect(chunks.length).toBeGreaterThan(1);
	});

	it("each chunk has a textHash", () => {
		const text = "Revenue grew significantly. ".repeat(50);
		const chunks = chunkText(text, { targetTokens: 50 });
		for (const chunk of chunks) {
			expect(chunk.textHash).toMatch(/^[0-9a-f]{64}$/);
		}
	});

	it("hashes are unique per chunk (no duplicates)", () => {
		// Use distinct enough text so each chunk has different content
		const words = Array.from({ length: 500 }, (_, i) => `word${i}`).join(" ");
		const chunks = chunkText(words, { targetTokens: 50, overlapTokens: 10 });
		const hashes = chunks.map((c) => c.textHash);
		const unique = new Set(hashes);
		expect(unique.size).toBe(hashes.length);
	});

	it("minimum token size filters out tiny trailing chunks", () => {
		const text = `${"A".repeat(2800)} tiny`;
		const chunks = chunkText(text, { targetTokens: 700, minTokens: 100 });
		// The tiny tail should be merged into the last chunk, not created as separate
		for (const c of chunks) {
			expect(c.text.length).toBeGreaterThanOrEqual(400);
		}
	});

	it("tokenCount is approximately text.length / 4", () => {
		const text = "Word ".repeat(200); // 1000 chars
		const chunks = chunkText(text, { targetTokens: 700 });
		for (const c of chunks) {
			const expected = Math.ceil(c.text.length / 4);
			expect(c.tokenCount).toBe(expected);
		}
	});
});

// ---------------------------------------------------------------------------
// filingParser
// ---------------------------------------------------------------------------

describe("parseAccessionNumber", () => {
	it("parses accession number from EDGAR archive URL", () => {
		const url = "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm";
		const result = parseAccessionNumber(url);
		expect(result?.withoutDashes).toBe("000032019324000123");
		expect(result?.withDashes).toBe("0000320193-24-000123");
	});

	it("returns undefined for URLs without an accession number", () => {
		expect(parseAccessionNumber("https://www.sec.gov/")).toBeUndefined();
		expect(parseAccessionNumber("https://example.com/foo/bar.htm")).toBeUndefined();
	});
});

describe("parseFilingResult", () => {
	it("converts a NinjasFilingResult to a Filing row", () => {
		const result = {
			ticker: "AAPL",
			filing_date: "2024-11-01",
			filing_url: "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm",
			form_type: "10-K",
		};

		const filing = parseFilingResult(result);

		expect(filing).toBeDefined();
		expect(filing!.cik).toBe("0000320193");
		expect(filing!.accessionNumber).toBe("0000320193-24-000123");
		expect(filing!.accessionNumberNoDashes).toBe("000032019324000123");
		expect(filing!.form).toBe("10-K");
		expect(filing!.filingDate).toBe("2024-11-01");
		expect(filing!.primaryDocumentUrl).toContain("aapl-20240928.htm");
		expect(filing!.id).toHaveLength(16);
	});

	it("returns undefined for a URL without a parseable accession number", () => {
		const result = {
			ticker: "AAPL",
			filing_date: "2024-11-01",
			filing_url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany",
			form_type: "10-K",
		};
		expect(parseFilingResult(result)).toBeUndefined();
	});

	it("generates a stable id — same input always produces the same id", () => {
		const result = {
			ticker: "AAPL",
			filing_date: "2024-11-01",
			filing_url: "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm",
			form_type: "10-K",
		};
		const a = parseFilingResult(result);
		const b = parseFilingResult(result);
		expect(a!.id).toBe(b!.id);
	});
});

describe("parseFilingResults", () => {
	it("skips entries that cannot be parsed", () => {
		const results = [
			{
				ticker: "AAPL",
				filing_date: "2024-11-01",
				filing_url: "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm",
				form_type: "10-K",
			},
			{
				ticker: "AAPL",
				filing_date: "2024-01-01",
				filing_url: "https://bad-url.com/no-accession",
				form_type: "10-K",
			},
		];
		const filings = parseFilingResults(results);
		expect(filings).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// ingestionPipeline
// ---------------------------------------------------------------------------

describe("ingestFilings", () => {
	let filingRepo: InMemoryFilingRepository;
	let chunkRepo: InMemoryFilingChunkRepository;
	let ninjasClient: NinjasSecClient;
	let downloader: FilingDownloader;

	beforeEach(() => {
		filingRepo = new InMemoryFilingRepository();
		chunkRepo = new InMemoryFilingChunkRepository();

		const aaplFixture = JSON.parse(fixture("aapl-10k.json"));
		ninjasClient = new NinjasSecClient({
			apiKey: "test-key",
			fetch: vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				headers: { get: () => "application/json" },
				json: async () => aaplFixture,
				text: async () => JSON.stringify(aaplFixture),
			}) as unknown as typeof fetch,
		});

		const htmlContent = fixture("mock-10k.html");
		downloader = new FilingDownloader({
			userAgent: "TestApp test@example.com",
			fetch: vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				headers: { get: () => "text/html" },
				text: async () => htmlContent,
			}) as unknown as typeof fetch,
		});
	});

	it("ingests filings and creates chunks in the repository", async () => {
		const result = await ingestFilings(
			{ ticker: "AAPL", forms: ["10-K"] },
			{ ninjasClient, downloader, filingRepo, chunkRepo },
		);

		expect(result.ingestedFilings.length).toBeGreaterThan(0);
		expect(result.ingestedFilings[0].chunksCreated).toBeGreaterThan(0);
		expect(result.ingestedFilings[0].sectionsCreated).toBeGreaterThan(0);

		const filings = await filingRepo.find({ form: "10-K" });
		expect(filings.length).toBeGreaterThan(0);

		const chunks = await chunkRepo.find({ filingId: result.ingestedFilings[0].filingId });
		expect(chunks.length).toBeGreaterThan(0);
	});

	it("is idempotent — re-ingesting skips already-stored filings", async () => {
		const deps = { ninjasClient, downloader, filingRepo, chunkRepo };

		await ingestFilings({ ticker: "AAPL", forms: ["10-K"] }, deps);
		const firstChunkCount = (await chunkRepo.find()).length;

		// Second run — same data
		const result2 = await ingestFilings({ ticker: "AAPL", forms: ["10-K"] }, deps);

		expect(result2.skippedFilings.length).toBeGreaterThan(0);
		expect(result2.skippedFilings[0].reason).toBe("already ingested");
		expect((await chunkRepo.find()).length).toBe(firstChunkCount);
	});

	it("chunks have sectionType metadata set", async () => {
		await ingestFilings({ ticker: "AAPL", forms: ["10-K"] }, { ninjasClient, downloader, filingRepo, chunkRepo });

		const allChunks = await chunkRepo.find();
		const riskChunks = allChunks.filter((c) => c.sectionType === "risk_factors");
		expect(riskChunks.length).toBeGreaterThan(0);
	});

	it("does not duplicate chunks — second forceRefresh still stores unique hashes", async () => {
		const deps = { ninjasClient, downloader, filingRepo, chunkRepo };

		await ingestFilings({ ticker: "AAPL", forms: ["10-K"] }, deps);
		const firstCount = (await chunkRepo.find()).length;

		await ingestFilings({ ticker: "AAPL", forms: ["10-K"], forceRefresh: true }, deps);

		// forceRefresh deletes old chunks and re-creates them; count should be same
		expect((await chunkRepo.find()).length).toBe(firstCount);
	});

	it("handles download failures gracefully", async () => {
		const failingDownloader = new FilingDownloader({
			userAgent: "TestApp test@example.com",
			fetch: vi.fn().mockResolvedValue({
				ok: false,
				status: 503,
				headers: { get: () => null },
				text: async () => "Service Unavailable",
			}) as unknown as typeof fetch,
		});

		const result = await ingestFilings(
			{ ticker: "AAPL", forms: ["10-K"] },
			{ ninjasClient, downloader: failingDownloader, filingRepo, chunkRepo },
		);

		expect(result.skippedFilings.length).toBeGreaterThan(0);
		expect(result.skippedFilings[0].reason).toContain("download failed");
		expect(result.ingestedFilings).toHaveLength(0);
	});
});

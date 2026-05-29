import { beforeEach, describe, expect, it, vi } from "vitest";

// Prevent undici (Node 22-only) from loading on Node 20 — we only test core functions,
// not the Pi wrapper layer. defineTool is the entry point that triggers the load.
vi.mock("@earendil-works/pi-coding-agent", () => ({ defineTool: (def: unknown) => def }));

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	InMemoryCompanyRepository,
	InMemoryEvidenceRepository,
	InMemoryFilingChunkRepository,
	InMemoryFilingRepository,
	InMemoryTranscriptChunkRepository,
	InMemoryTranscriptRepository,
	InMemoryXbrlFactRepository,
} from "@earendil-works/pi-research-db";
import type { CompanyFactsRaw } from "@earendil-works/pi-sec-ingestion";
import {
	FilingDownloader,
	NinjasSecClient,
	normalizeCompanyFacts,
	XbrlIngestor,
} from "@earendil-works/pi-sec-ingestion";
import { NinjasTranscriptProvider, parseTranscript } from "@earendil-works/pi-transcript-ingestion";
import { annotateOrphanedIds, collectEvidenceIds, findOrphanedEvidenceIds } from "../src/answerFormatter.ts";
import { computeMetricToolCore } from "../src/tools/computeMetricTool.ts";
import { getXbrlFactsToolCore } from "../src/tools/getXbrlFactsTool.ts";
import { ingestCompanyFilingsCore } from "../src/tools/ingestCompanyFilingsTool.ts";
import { listFilingsCore } from "../src/tools/listFilingsTool.ts";
import { resolveCompanyCore } from "../src/tools/resolveCompanyTool.ts";
import { retrieveFilingPassagesCore } from "../src/tools/retrieveFilingPassagesTool.ts";
import { retrieveTranscriptPassagesCore } from "../src/tools/retrieveTranscriptPassagesTool.ts";
import { buildAnalystAnswer } from "../src/tools/submitAnswerTool.ts";
import type { FinanceToolDeps } from "../src/tools/toolDeps.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function secFixture(name: string): string {
	return readFileSync(join(__dirname, "../../sec-ingestion/src/fixtures", name), "utf-8");
}

function makeNinjasClient(fixtureFile: string): NinjasSecClient {
	const data = JSON.parse(secFixture(fixtureFile));
	return new NinjasSecClient({
		apiKey: "test-key",
		fetch: vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			headers: { get: () => "application/json" },
			json: async () => data,
			text: async () => JSON.stringify(data),
		}) as unknown as typeof fetch,
	});
}

function makeDownloader(): FilingDownloader {
	const html = secFixture("mock-10k.html");
	return new FilingDownloader({
		userAgent: "TestApp test@example.com",
		fetch: vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			headers: { get: () => "text/html" },
			text: async () => html,
		}) as unknown as typeof fetch,
	});
}

function makeXbrlIngestor(fixtureFile = "aapl-companyfacts.json"): XbrlIngestor {
	const data = JSON.parse(secFixture(fixtureFile));
	return new XbrlIngestor({
		userAgent: "TestApp test@example.com",
		fetch: vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => data,
		}) as unknown as typeof fetch,
	});
}

function makeTranscriptProvider(): NinjasTranscriptProvider {
	const transcriptData = JSON.parse(
		readFileSync(join(__dirname, "../../transcript-ingestion/src/fixtures/aapl-transcript.json"), "utf-8"),
	);
	return new NinjasTranscriptProvider({
		apiKey: "test-key",
		fetch: vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => transcriptData,
		}) as unknown as typeof fetch,
	});
}

function makeDeps(): FinanceToolDeps {
	return {
		companyRepo: new InMemoryCompanyRepository(),
		filingRepo: new InMemoryFilingRepository(),
		chunkRepo: new InMemoryFilingChunkRepository(),
		xbrlRepo: new InMemoryXbrlFactRepository(),
		evidenceRepo: new InMemoryEvidenceRepository(),
		transcriptRepo: new InMemoryTranscriptRepository(),
		transcriptChunkRepo: new InMemoryTranscriptChunkRepository(),
		ninjasClient: makeNinjasClient("aapl-10k.json"),
		downloader: makeDownloader(),
		xbrlIngestor: makeXbrlIngestor(),
		transcriptProvider: makeTranscriptProvider(),
		embeddingProvider: null,
	};
}

// ---------------------------------------------------------------------------
// resolveCompanyCore
// ---------------------------------------------------------------------------

describe("resolveCompanyCore", () => {
	let deps: ReturnType<typeof makeDeps>;

	beforeEach(async () => {
		deps = makeDeps();
		await deps.companyRepo.create({
			id: "aapl-id",
			cik: "0000320193",
			ticker: "AAPL",
			name: "Apple Inc.",
		});
	});

	it("finds a company by ticker", async () => {
		const result = await resolveCompanyCore({ query: "AAPL" }, deps);
		expect(result.status).toBe("found");
		expect(result.company?.ticker).toBe("AAPL");
		expect(result.company?.name).toBe("Apple Inc.");
	});

	it("finds a company by lowercase ticker", async () => {
		const result = await resolveCompanyCore({ query: "aapl" }, deps);
		expect(result.status).toBe("found");
	});

	it("finds a company by name substring", async () => {
		const result = await resolveCompanyCore({ query: "Apple" }, deps);
		expect(result.status).toBe("found");
		expect(result.company?.id).toBe("aapl-id");
	});

	it("finds a company by CIK", async () => {
		const result = await resolveCompanyCore({ query: "320193" }, deps);
		expect(result.status).toBe("found");
	});

	it("returns not_found with helpful message for unknown ticker", async () => {
		const result = await resolveCompanyCore({ query: "ZZZZ" }, deps);
		expect(result.status).toBe("not_found");
		expect(result.message).toContain("ingest_company_filings");
	});
});

// ---------------------------------------------------------------------------
// listFilingsCore
// ---------------------------------------------------------------------------

describe("listFilingsCore", () => {
	let deps: ReturnType<typeof makeDeps>;

	beforeEach(async () => {
		deps = makeDeps();
		await deps.filingRepo.create({
			id: "f1",
			companyId: "aapl-id",
			cik: "0000320193",
			accessionNumber: "0000320193-23-000106",
			accessionNumberNoDashes: "000032019323000106",
			form: "10-K",
			filingDate: "2023-11-03",
			fiscalYear: 2023,
			fiscalPeriod: "FY",
		});
		await deps.filingRepo.create({
			id: "f2",
			companyId: "aapl-id",
			cik: "0000320193",
			accessionNumber: "0000320193-24-000011",
			accessionNumberNoDashes: "000032019324000011",
			form: "10-Q",
			filingDate: "2024-02-02",
			fiscalYear: 2024,
			fiscalPeriod: "Q1",
		});
	});

	it("returns all filings for a company", async () => {
		const result = await listFilingsCore({ companyId: "aapl-id" }, deps);
		expect(result.count).toBe(2);
	});

	it("filters by form type", async () => {
		const result = await listFilingsCore({ companyId: "aapl-id", forms: ["10-K"] }, deps);
		expect(result.count).toBe(1);
		expect(result.filings[0].form).toBe("10-K");
	});

	it("sorts most recent first", async () => {
		const result = await listFilingsCore({ companyId: "aapl-id" }, deps);
		expect(result.filings[0].filingDate).toBe("2024-02-02");
	});

	it("respects limit", async () => {
		const result = await listFilingsCore({ companyId: "aapl-id", limit: 1 }, deps);
		expect(result.count).toBe(1);
	});

	it("returns empty when no filings found", async () => {
		const result = await listFilingsCore({ companyId: "unknown-id" }, deps);
		expect(result.count).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// ingestCompanyFilingsCore
// ---------------------------------------------------------------------------

describe("ingestCompanyFilingsCore", () => {
	it("ingests filings and creates a Company record", async () => {
		const deps = makeDeps();
		const result = await ingestCompanyFilingsCore({ ticker: "AAPL", forms: ["10-K"], includeXbrl: false }, deps);

		expect(result.ticker).toBe("AAPL");
		expect(result.companyId).toBeTruthy();
		expect(result.cik).toBe("0000320193");
		expect(result.ingestedFilings).toBeGreaterThan(0);

		const company = await deps.companyRepo.findById(result.companyId);
		expect(company).toBeDefined();
		expect(company!.cik).toBe("0000320193");
	});

	it("also ingests XBRL facts when includeXbrl is true", async () => {
		const deps = makeDeps();
		const result = await ingestCompanyFilingsCore({ ticker: "AAPL", forms: ["10-K"], includeXbrl: true }, deps);

		expect(result.xbrlFactsIngested).toBeGreaterThan(0);
		const facts = await deps.xbrlRepo.find({ companyId: result.companyId });
		expect(facts.length).toBeGreaterThan(0);
	});

	it("sets entityName from XBRL when includeXbrl is true", async () => {
		const deps = makeDeps();
		const result = await ingestCompanyFilingsCore({ ticker: "AAPL", forms: ["10-K"], includeXbrl: true }, deps);

		expect(result.name).toBe("Apple Inc.");
	});

	it("is idempotent — re-running skips already ingested filings", async () => {
		const deps = makeDeps();
		await ingestCompanyFilingsCore({ ticker: "AAPL", forms: ["10-K"], includeXbrl: false }, deps);
		const result2 = await ingestCompanyFilingsCore({ ticker: "AAPL", forms: ["10-K"], includeXbrl: false }, deps);

		expect(result2.skippedFilings).toBeGreaterThan(0);
		expect(result2.ingestedFilings).toBe(0);
	});

	it("throws when no filings found for ticker", async () => {
		const deps = makeDeps();
		const emptyClient = new NinjasSecClient({
			apiKey: "test-key",
			fetch: vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				headers: { get: () => "application/json" },
				json: async () => [],
				text: async () => "[]",
			}) as unknown as typeof fetch,
		});
		deps.ninjasClient = emptyClient;

		await expect(ingestCompanyFilingsCore({ ticker: "FAKE", forms: ["10-K"] }, deps)).rejects.toThrow(
			"No filings found",
		);
	});
});

// ---------------------------------------------------------------------------
// retrieveFilingPassagesCore
// ---------------------------------------------------------------------------

describe("retrieveFilingPassagesCore", () => {
	let deps: ReturnType<typeof makeDeps>;
	const COMPANY_ID = "aapl-id";

	beforeEach(async () => {
		deps = makeDeps();
		const now = new Date().toISOString();
		// Seed chunks
		const chunks = [
			{
				id: "c1",
				companyId: COMPANY_ID,
				filingId: "f1",
				form: "10-K",
				filingDate: "2023-11-03",
				sectionType: "mda" as const,
				text: "Apple revenue grew 5% to 394 billion in fiscal year 2022 driven by iPhone and Services",
				textHash: "hash-c1",
				createdAt: now,
			},
			{
				id: "c2",
				companyId: COMPANY_ID,
				filingId: "f1",
				form: "10-K",
				filingDate: "2023-11-03",
				sectionType: "risk_factors" as const,
				text: "Supply chain disruptions and competitive pressures represent significant risk factors",
				textHash: "hash-c2",
				createdAt: now,
			},
			{
				id: "c3",
				companyId: COMPANY_ID,
				filingId: "f1",
				form: "10-K",
				filingDate: "2023-11-03",
				sectionType: "mda" as const,
				text: "Total net sales increased year over year reflecting strong demand for iPhone models",
				textHash: "hash-c3",
				createdAt: now,
			},
		];
		for (const c of chunks) await deps.chunkRepo.create(c);
	});

	it("returns passages matching the query", async () => {
		const result = await retrieveFilingPassagesCore({ companyId: COMPANY_ID, query: "apple revenue growth" }, deps);
		expect(result.passages.length).toBeGreaterThan(0);
	});

	it("each passage has a non-empty evidenceId", async () => {
		const result = await retrieveFilingPassagesCore({ companyId: COMPANY_ID, query: "revenue" }, deps);
		for (const p of result.passages) {
			expect(p.evidenceId).toBeTruthy();
		}
	});

	it("filters by sectionType", async () => {
		const result = await retrieveFilingPassagesCore(
			{ companyId: COMPANY_ID, query: "risk", sectionTypes: ["risk_factors"] },
			deps,
		);
		for (const p of result.passages) {
			expect(p.sectionType).toBe("risk_factors");
		}
	});

	it("respects topK", async () => {
		const result = await retrieveFilingPassagesCore(
			{ companyId: COMPANY_ID, query: "revenue growth", topK: 1 },
			deps,
		);
		expect(result.passages.length).toBeLessThanOrEqual(1);
	});

	it("reports totalChunksSearched", async () => {
		const result = await retrieveFilingPassagesCore({ companyId: COMPANY_ID, query: "revenue" }, deps);
		expect(result.totalChunksSearched).toBe(3);
	});

	it("returns empty for unknown companyId", async () => {
		const result = await retrieveFilingPassagesCore({ companyId: "unknown", query: "revenue" }, deps);
		expect(result.passages).toHaveLength(0);
		expect(result.totalChunksSearched).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// getXbrlFactsToolCore
// ---------------------------------------------------------------------------

describe("getXbrlFactsToolCore", () => {
	let deps: ReturnType<typeof makeDeps>;
	const COMPANY_ID = "aapl-id";

	beforeEach(async () => {
		deps = makeDeps();
		await deps.companyRepo.create({ id: COMPANY_ID, cik: "0000320193", ticker: "AAPL", name: "Apple Inc." });
		const raw: CompanyFactsRaw = JSON.parse(secFixture("aapl-companyfacts.json"));
		const facts = normalizeCompanyFacts(raw, COMPANY_ID);
		await deps.xbrlRepo.createBatch(facts);
	});

	it("returns facts by alias", async () => {
		const result = await getXbrlFactsToolCore(
			{ companyId: COMPANY_ID, aliases: ["revenue"], fiscalYear: 2023, fiscalPeriod: "FY" },
			deps,
		);
		expect(result.count).toBe(1);
		expect(result.facts[0].value).toBe(383285000000);
	});

	it("includes evidenceId for each fact", async () => {
		const result = await getXbrlFactsToolCore({ companyId: COMPANY_ID, aliases: ["revenue"] }, deps);
		for (const f of result.facts) {
			expect(f.evidenceId).toBeTruthy();
		}
	});

	it("throws when company not found", async () => {
		await expect(getXbrlFactsToolCore({ companyId: "unknown", aliases: ["revenue"] }, deps)).rejects.toThrow(
			"Company not found",
		);
	});
});

// ---------------------------------------------------------------------------
// computeMetricToolCore
// ---------------------------------------------------------------------------

describe("computeMetricToolCore", () => {
	let deps: ReturnType<typeof makeDeps>;
	const COMPANY_ID = "aapl-id";

	beforeEach(async () => {
		deps = makeDeps();
		await deps.companyRepo.create({ id: COMPANY_ID, cik: "0000320193", ticker: "AAPL", name: "Apple Inc." });
		const raw: CompanyFactsRaw = JSON.parse(secFixture("aapl-companyfacts.json"));
		const facts = normalizeCompanyFacts(raw, COMPANY_ID);
		await deps.xbrlRepo.createBatch(facts);
	});

	it("computes gross_margin for AAPL FY2023", async () => {
		const result = await computeMetricToolCore(
			{ companyId: COMPANY_ID, metric: "gross_margin", fiscalYear: 2023, fiscalPeriod: "FY" },
			deps,
		);
		expect(result.metric).toBe("gross_margin");
		expect(result.value).toBeCloseTo(44.13, 1);
		expect(result.unit).toBe("%");
	});

	it("result inputs include evidence IDs", async () => {
		const result = await computeMetricToolCore(
			{ companyId: COMPANY_ID, metric: "gross_margin", fiscalYear: 2023, fiscalPeriod: "FY" },
			deps,
		);
		for (const inp of result.inputs) {
			expect(inp.evidenceId).toBeTruthy();
		}
	});

	it("throws when company not found", async () => {
		await expect(
			computeMetricToolCore(
				{ companyId: "unknown", metric: "gross_margin", fiscalYear: 2023, fiscalPeriod: "FY" },
				deps,
			),
		).rejects.toThrow("Company not found");
	});

	it("throws with clear message when data is missing", async () => {
		await expect(
			computeMetricToolCore(
				{ companyId: COMPANY_ID, metric: "gross_margin", fiscalYear: 2099, fiscalPeriod: "FY" },
				deps,
			),
		).rejects.toThrow("Missing XBRL fact");
	});
});

// ---------------------------------------------------------------------------
// retrieveTranscriptPassagesCore
// ---------------------------------------------------------------------------

describe("retrieveTranscriptPassagesCore", () => {
	const TC_COMPANY_ID = "aapl-id";
	let tcDeps: { chunkRepo: InMemoryTranscriptChunkRepository };

	beforeEach(async () => {
		const transcriptData = JSON.parse(
			readFileSync(join(__dirname, "../../transcript-ingestion/src/fixtures/aapl-transcript.json"), "utf-8"),
		);
		const raw = {
			date: transcriptData.date,
			timestamp: transcriptData.timestamp,
			ticker: transcriptData.ticker,
			cik: transcriptData.cik,
			year: Number(transcriptData.year),
			quarter: Number(transcriptData.quarter),
			transcript: transcriptData.transcript,
			transcriptSplit: transcriptData.transcript_split?.map((t: any) => ({
				speaker: t.speaker,
				company: t.company,
				role: t.role,
				text: t.text,
				speakerType: t.speaker_type,
				isQa: t.is_qa,
				sentiment: t.sentiment,
			})),
		};
		const { chunks } = parseTranscript(raw, TC_COMPANY_ID);
		const chunkRepo = new InMemoryTranscriptChunkRepository();
		for (const c of chunks) await chunkRepo.create(c);
		tcDeps = { chunkRepo };
	});

	it("returns passages matching the query", async () => {
		const result = await retrieveTranscriptPassagesCore(
			{ companyId: TC_COMPANY_ID, query: "services revenue record" },
			tcDeps,
		);
		expect(result.passages.length).toBeGreaterThan(0);
	});

	it("each passage has an evidenceId", async () => {
		const result = await retrieveTranscriptPassagesCore(
			{ companyId: TC_COMPANY_ID, query: "iphone revenue growth" },
			tcDeps,
		);
		for (const p of result.passages) {
			expect(p.evidenceId).toBeTruthy();
		}
	});

	it("passages have speaker attribution", async () => {
		const result = await retrieveTranscriptPassagesCore(
			{ companyId: TC_COMPANY_ID, query: "services revenue subscriptions" },
			tcDeps,
		);
		const withSpeaker = result.passages.filter((p) => p.speaker);
		expect(withSpeaker.length).toBeGreaterThan(0);
	});

	it("filters by section", async () => {
		const result = await retrieveTranscriptPassagesCore(
			{ companyId: TC_COMPANY_ID, query: "revenue", sections: ["qa"] },
			tcDeps,
		);
		for (const p of result.passages) {
			expect(p.section).toBe("qa");
		}
	});

	it("returns empty for unknown companyId", async () => {
		const result = await retrieveTranscriptPassagesCore({ companyId: "unknown", query: "revenue" }, tcDeps);
		expect(result.passages).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// buildAnalystAnswer + answerFormatter
// ---------------------------------------------------------------------------

const SAMPLE_PARAMS = {
	answer: "Apple revenue was $89.5 billion in Q4 2023.",
	keyPoints: [
		{ claim: "Revenue was $89.5 billion", evidenceIds: ["ev-1"] },
		{ claim: "Services set an all-time record", evidenceIds: ["ev-2", "ev-3"] },
	],
	caveats: ["Based on Q4 2023 10-K filing"],
	sources: [
		{ evidenceId: "ev-1", title: "Apple 10-K FY2023 — MD&A", sourceType: "filing" },
		{ evidenceId: "ev-2", title: "Apple 10-K FY2023 — Services", sourceType: "filing" },
		{ evidenceId: "ev-3", title: "Apple Q4 2023 XBRL — Revenues", sourceType: "xbrl_fact" },
	],
};

describe("buildAnalystAnswer", () => {
	it("produces a valid AnalystAnswer with default verification", () => {
		const answer = buildAnalystAnswer(SAMPLE_PARAMS);
		expect(answer.answer).toBe(SAMPLE_PARAMS.answer);
		expect(answer.keyPoints).toHaveLength(2);
		expect(answer.sources).toHaveLength(3);
		expect(answer.verification.supported).toBe(true);
		expect(answer.verification.warnings).toHaveLength(0);
	});

	it("preserves caveats", () => {
		const answer = buildAnalystAnswer(SAMPLE_PARAMS);
		expect(answer.caveats).toContain("Based on Q4 2023 10-K filing");
	});
});

describe("collectEvidenceIds", () => {
	it("collects all unique evidence IDs from keyPoints and sources", () => {
		const answer = buildAnalystAnswer(SAMPLE_PARAMS);
		const ids = collectEvidenceIds(answer);
		expect(ids).toContain("ev-1");
		expect(ids).toContain("ev-2");
		expect(ids).toContain("ev-3");
	});

	it("deduplicates IDs", () => {
		const answer = buildAnalystAnswer({
			...SAMPLE_PARAMS,
			keyPoints: [{ claim: "X", evidenceIds: ["ev-1", "ev-1"] }],
			sources: [{ evidenceId: "ev-1", title: "A", sourceType: "filing" }],
		});
		const ids = collectEvidenceIds(answer);
		expect(ids.filter((id) => id === "ev-1")).toHaveLength(1);
	});
});

describe("findOrphanedEvidenceIds", () => {
	it("returns empty when all evidenceIds are in sources", () => {
		const answer = buildAnalystAnswer(SAMPLE_PARAMS);
		expect(findOrphanedEvidenceIds(answer)).toHaveLength(0);
	});

	it("detects evidenceIds in keyPoints not in sources", () => {
		const answer = buildAnalystAnswer({
			...SAMPLE_PARAMS,
			keyPoints: [{ claim: "X", evidenceIds: ["ev-missing"] }],
		});
		const orphaned = findOrphanedEvidenceIds(answer);
		expect(orphaned).toContain("ev-missing");
	});
});

describe("annotateOrphanedIds", () => {
	it("adds no warning when all IDs are sourced", () => {
		const answer = buildAnalystAnswer(SAMPLE_PARAMS);
		const annotated = annotateOrphanedIds(answer);
		expect(annotated.verification.warnings).toHaveLength(0);
	});

	it("adds a warning when orphaned IDs are found", () => {
		const answer = buildAnalystAnswer({
			...SAMPLE_PARAMS,
			keyPoints: [{ claim: "X", evidenceIds: ["ev-missing"] }],
		});
		const annotated = annotateOrphanedIds(answer);
		expect(annotated.verification.warnings.length).toBeGreaterThan(0);
		expect(annotated.verification.warnings[0]).toContain("ev-missing");
	});
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryXbrlFactRepository } from "@earendil-works/pi-research-db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeMetric } from "../src/metrics.ts";
import type { CompanyFactsRaw } from "../src/xbrlFacts.ts";
import { getXbrlFactsCore, normalizeCompanyFacts, resolveAlias, XbrlIngestor } from "../src/xbrlFacts.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(): CompanyFactsRaw {
	return JSON.parse(readFileSync(join(__dirname, "../src/fixtures/aapl-companyfacts.json"), "utf-8"));
}

const TEST_COMPANY_ID = "aapl-test-id";
const TEST_CIK = "0000320193";

// ---------------------------------------------------------------------------
// normalizeCompanyFacts
// ---------------------------------------------------------------------------

describe("normalizeCompanyFacts", () => {
	it("produces a flat list of XbrlFact rows", () => {
		const raw = loadFixture();
		const facts = normalizeCompanyFacts(raw, TEST_COMPANY_ID);
		expect(facts.length).toBeGreaterThan(5);
	});

	it("sets companyId and cik on every fact", () => {
		const raw = loadFixture();
		const facts = normalizeCompanyFacts(raw, TEST_COMPANY_ID);
		for (const fact of facts) {
			expect(fact.companyId).toBe(TEST_COMPANY_ID);
			expect(fact.cik).toBe(TEST_CIK);
		}
	});

	it("sets startDate + endDate for duration facts (income statement)", () => {
		const raw = loadFixture();
		const facts = normalizeCompanyFacts(raw, TEST_COMPANY_ID);
		const revFacts = facts.filter((f) => f.concept === "RevenueFromContractWithCustomerExcludingAssessedTax");
		expect(revFacts.length).toBeGreaterThan(0);
		for (const f of revFacts) {
			expect(f.startDate).toBeDefined();
			expect(f.endDate).toBeDefined();
			expect(f.instantDate).toBeUndefined();
		}
	});

	it("sets instantDate (not startDate/endDate) for instant facts (balance sheet)", () => {
		const raw = loadFixture();
		const facts = normalizeCompanyFacts(raw, TEST_COMPANY_ID);
		const bsFacts = facts.filter((f) => f.concept === "AssetsCurrent");
		expect(bsFacts.length).toBeGreaterThan(0);
		for (const f of bsFacts) {
			expect(f.instantDate).toBeDefined();
			expect(f.startDate).toBeUndefined();
			expect(f.endDate).toBeUndefined();
		}
	});

	it("normalizes taxonomy correctly (us-gaap vs dei)", () => {
		const raw = loadFixture();
		const facts = normalizeCompanyFacts(raw, TEST_COMPANY_ID);
		const usGaap = facts.filter((f) => f.taxonomy === "us-gaap");
		const dei = facts.filter((f) => f.taxonomy === "dei");
		expect(usGaap.length).toBeGreaterThan(0);
		expect(dei.length).toBeGreaterThan(0);
	});

	it("generates deterministic IDs — same input always produces the same IDs", () => {
		const raw = loadFixture();
		const a = normalizeCompanyFacts(raw, TEST_COMPANY_ID);
		const b = normalizeCompanyFacts(raw, TEST_COMPANY_ID);
		const idsA = a.map((f) => f.id).sort();
		const idsB = b.map((f) => f.id).sort();
		expect(idsA).toEqual(idsB);
	});

	it("IDs are unique within the normalized set", () => {
		const raw = loadFixture();
		const facts = normalizeCompanyFacts(raw, TEST_COMPANY_ID);
		const ids = facts.map((f) => f.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("sets fiscalYear and fiscalPeriod correctly", () => {
		const raw = loadFixture();
		const facts = normalizeCompanyFacts(raw, TEST_COMPANY_ID);
		const fy2023 = facts.filter((f) => f.fiscalYear === 2023 && f.fiscalPeriod === "FY");
		expect(fy2023.length).toBeGreaterThan(0);
	});

	it("sets source to sec_companyfacts", () => {
		const raw = loadFixture();
		const facts = normalizeCompanyFacts(raw, TEST_COMPANY_ID);
		for (const fact of facts) {
			expect(fact.source).toBe("sec_companyfacts");
		}
	});
});

// ---------------------------------------------------------------------------
// CONCEPT_ALIASES / resolveAlias
// ---------------------------------------------------------------------------

describe("resolveAlias", () => {
	it("resolves 'revenue' to a list containing RevenueFromContractWithCustomerExcludingAssessedTax first", () => {
		const concepts = resolveAlias("revenue");
		expect(concepts[0]).toBe("RevenueFromContractWithCustomerExcludingAssessedTax");
		expect(concepts).toContain("Revenues");
	});

	it("resolves 'gross_profit' to GrossProfit", () => {
		expect(resolveAlias("gross_profit")).toEqual(["GrossProfit"]);
	});

	it("returns an array containing the input unchanged for unknown aliases", () => {
		expect(resolveAlias("SomeUnknownConcept")).toEqual(["SomeUnknownConcept"]);
	});
});

// ---------------------------------------------------------------------------
// XbrlIngestor
// ---------------------------------------------------------------------------

describe("XbrlIngestor", () => {
	it("fetches and normalizes company facts via injected fetch", async () => {
		const raw = loadFixture();
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => raw,
		}) as unknown as typeof fetch;

		const ingestor = new XbrlIngestor({ fetch: mockFetch, userAgent: "TestApp test@example.com" });
		const repo = new InMemoryXbrlFactRepository();

		const result = await ingestor.ingest("320193", TEST_COMPANY_ID, repo);

		expect(result.factsIngested).toBeGreaterThan(0);
		expect(result.cik).toBe(TEST_CIK);
		expect(result.taxonomies).toContain("us-gaap");

		const stored = await repo.find({ companyId: TEST_COMPANY_ID });
		expect(stored.length).toBe(result.factsIngested);
	});

	it("is idempotent — re-ingesting skips already-stored facts", async () => {
		const raw = loadFixture();
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => raw,
		}) as unknown as typeof fetch;

		const ingestor = new XbrlIngestor({ fetch: mockFetch, userAgent: "TestApp test@example.com" });
		const repo = new InMemoryXbrlFactRepository();

		const first = await ingestor.ingest("320193", TEST_COMPANY_ID, repo);
		const second = await ingestor.ingest("320193", TEST_COMPANY_ID, repo);

		expect(second.factsIngested).toBe(0); // all already exist
		const stored = await repo.find({ companyId: TEST_COMPANY_ID });
		expect(stored.length).toBe(first.factsIngested);
	});

	it("throws on non-OK HTTP responses", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 404,
			json: async () => ({}),
		}) as unknown as typeof fetch;

		const ingestor = new XbrlIngestor({ fetch: mockFetch, userAgent: "TestApp test@example.com" });
		const repo = new InMemoryXbrlFactRepository();

		await expect(ingestor.ingest("320193", TEST_COMPANY_ID, repo)).rejects.toThrow("404");
	});

	it("builds the correct XBRL URL with CIK prefix", async () => {
		const raw = loadFixture();
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => raw,
		}) as unknown as typeof fetch;

		const ingestor = new XbrlIngestor({ fetch: mockFetch, userAgent: "TestApp test@example.com" });
		const repo = new InMemoryXbrlFactRepository();
		await ingestor.ingest("320193", TEST_COMPANY_ID, repo);

		const calledUrl = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(calledUrl).toBe("https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json");
	});
});

// ---------------------------------------------------------------------------
// getXbrlFactsCore
// ---------------------------------------------------------------------------

describe("getXbrlFactsCore", () => {
	let repo: InMemoryXbrlFactRepository;

	beforeEach(async () => {
		repo = new InMemoryXbrlFactRepository();
		const raw = loadFixture();
		const facts = normalizeCompanyFacts(raw, TEST_COMPANY_ID);
		await repo.createBatch(facts);
	});

	it("returns facts by explicit concept name", async () => {
		const result = await getXbrlFactsCore({ cik: "320193", concepts: ["GrossProfit"] }, repo);
		expect(result.facts.length).toBeGreaterThan(0);
		expect(result.facts.every((f) => f.concept === "GrossProfit")).toBe(true);
	});

	it("returns facts by alias", async () => {
		const result = await getXbrlFactsCore({ cik: "320193", aliases: ["revenue"] }, repo);
		expect(result.facts.length).toBeGreaterThan(0);
	});

	it("filters by fiscalYear and fiscalPeriod", async () => {
		const result = await getXbrlFactsCore(
			{ cik: "320193", aliases: ["revenue"], fiscalYear: 2023, fiscalPeriod: "FY" },
			repo,
		);
		expect(result.facts.length).toBe(1);
		expect(result.facts[0].fiscalYear).toBe(2023);
		expect(result.facts[0].fiscalPeriod).toBe("FY");
	});

	it("returns evidence IDs for each fact", async () => {
		const result = await getXbrlFactsCore({ cik: "320193", aliases: ["revenue"] }, repo);
		expect(result.evidenceIds).toHaveLength(result.facts.length);
		expect(result.evidenceIds).toEqual(result.facts.map((f) => f.id));
	});

	it("returns empty when no facts match", async () => {
		const result = await getXbrlFactsCore({ cik: "320193", concepts: ["NonExistentConcept"] }, repo);
		expect(result.facts).toHaveLength(0);
		expect(result.evidenceIds).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// computeMetric
// ---------------------------------------------------------------------------

describe("computeMetric — gross_margin", () => {
	let repo: InMemoryXbrlFactRepository;

	beforeEach(async () => {
		repo = new InMemoryXbrlFactRepository();
		const raw = loadFixture();
		const facts = normalizeCompanyFacts(raw, TEST_COMPANY_ID);
		await repo.createBatch(facts);
	});

	it("computes AAPL FY2023 gross margin ≈ 44.13%", async () => {
		const result = await computeMetric(
			{ metric: "gross_margin", cik: "320193", fiscalYear: 2023, fiscalPeriod: "FY" },
			repo,
		);
		expect(result.metric).toBe("gross_margin");
		expect(result.unit).toBe("%");
		// 169148 / 383285 * 100 ≈ 44.13
		expect(result.value).toBeCloseTo(44.13, 1);
	});

	it("includes two inputs with evidence IDs", async () => {
		const result = await computeMetric(
			{ metric: "gross_margin", cik: "320193", fiscalYear: 2023, fiscalPeriod: "FY" },
			repo,
		);
		expect(result.inputs).toHaveLength(2);
		for (const inp of result.inputs) {
			expect(inp.evidenceId).toBeTruthy();
			expect(inp.evidenceId.length).toBe(16);
			expect(inp.fiscalYear).toBe(2023);
		}
	});

	it("throws when data is missing", async () => {
		await expect(
			computeMetric({ metric: "gross_margin", cik: "320193", fiscalYear: 2099, fiscalPeriod: "FY" }, repo),
		).rejects.toThrow("Missing XBRL fact");
	});
});

describe("computeMetric — operating_margin", () => {
	let repo: InMemoryXbrlFactRepository;

	beforeEach(async () => {
		repo = new InMemoryXbrlFactRepository();
		const facts = normalizeCompanyFacts(loadFixture(), TEST_COMPANY_ID);
		await repo.createBatch(facts);
	});

	it("computes AAPL FY2023 operating margin ≈ 29.82%", async () => {
		const result = await computeMetric(
			{ metric: "operating_margin", cik: "320193", fiscalYear: 2023, fiscalPeriod: "FY" },
			repo,
		);
		// 114301 / 383285 * 100 ≈ 29.82
		expect(result.value).toBeCloseTo(29.82, 1);
		expect(result.unit).toBe("%");
	});
});

describe("computeMetric — net_margin", () => {
	let repo: InMemoryXbrlFactRepository;

	beforeEach(async () => {
		repo = new InMemoryXbrlFactRepository();
		const facts = normalizeCompanyFacts(loadFixture(), TEST_COMPANY_ID);
		await repo.createBatch(facts);
	});

	it("computes AAPL FY2023 net margin ≈ 25.31%", async () => {
		const result = await computeMetric(
			{ metric: "net_margin", cik: "320193", fiscalYear: 2023, fiscalPeriod: "FY" },
			repo,
		);
		// 96995 / 383285 * 100 ≈ 25.31
		expect(result.value).toBeCloseTo(25.31, 1);
		expect(result.unit).toBe("%");
	});
});

describe("computeMetric — revenue_growth_yoy", () => {
	let repo: InMemoryXbrlFactRepository;

	beforeEach(async () => {
		repo = new InMemoryXbrlFactRepository();
		const facts = normalizeCompanyFacts(loadFixture(), TEST_COMPANY_ID);
		await repo.createBatch(facts);
	});

	it("computes AAPL FY2023 revenue growth YoY ≈ -2.80%", async () => {
		const result = await computeMetric(
			{ metric: "revenue_growth_yoy", cik: "320193", fiscalYear: 2023, fiscalPeriod: "FY" },
			repo,
		);
		// (383285 - 394328) / 394328 * 100 ≈ -2.80
		expect(result.value).toBeCloseTo(-2.8, 1);
		expect(result.unit).toBe("%");
	});

	it("includes both current and prior year as inputs", async () => {
		const result = await computeMetric(
			{ metric: "revenue_growth_yoy", cik: "320193", fiscalYear: 2023, fiscalPeriod: "FY" },
			repo,
		);
		expect(result.inputs).toHaveLength(2);
		const years = result.inputs.map((i) => i.fiscalYear);
		expect(years).toContain(2023);
		expect(years).toContain(2022);
	});

	it("throws when prior year data is missing", async () => {
		await expect(
			computeMetric({ metric: "revenue_growth_yoy", cik: "320193", fiscalYear: 2021, fiscalPeriod: "FY" }, repo),
		).rejects.toThrow("Missing XBRL fact");
	});
});

describe("computeMetric — current_ratio", () => {
	let repo: InMemoryXbrlFactRepository;

	beforeEach(async () => {
		repo = new InMemoryXbrlFactRepository();
		const facts = normalizeCompanyFacts(loadFixture(), TEST_COMPANY_ID);
		await repo.createBatch(facts);
	});

	it("computes AAPL FY2023 current ratio ≈ 0.9880", async () => {
		const result = await computeMetric(
			{ metric: "current_ratio", cik: "320193", fiscalYear: 2023, fiscalPeriod: "FY" },
			repo,
		);
		// 143566 / 145308 ≈ 0.9880
		expect(result.value).toBeCloseTo(0.988, 2);
		expect(result.unit).toBe("ratio");
	});

	it("includes current assets and liabilities as inputs", async () => {
		const result = await computeMetric(
			{ metric: "current_ratio", cik: "320193", fiscalYear: 2023, fiscalPeriod: "FY" },
			repo,
		);
		expect(result.inputs).toHaveLength(2);
		const concepts = result.inputs.map((i) => i.concept);
		expect(concepts).toContain("AssetsCurrent");
		expect(concepts).toContain("LiabilitiesCurrent");
	});
});

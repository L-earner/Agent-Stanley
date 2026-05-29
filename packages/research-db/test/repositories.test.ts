import { beforeEach, describe, expect, it } from "vitest";
import {
	InMemoryCompanyRepository,
	InMemoryEvidenceRepository,
	InMemoryFilingChunkRepository,
	InMemoryFilingRepository,
	InMemoryTranscriptChunkRepository,
	InMemoryTranscriptRepository,
	InMemoryXbrlFactRepository,
} from "../src/repositories/index.ts";
import type { Company, Evidence, Filing, FilingChunk, Transcript, TranscriptChunk, XbrlFact } from "../src/schema.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const company: Omit<Company, "createdAt" | "updatedAt"> = {
	id: "co-1",
	cik: "0000320193",
	ticker: "AAPL",
	name: "Apple Inc.",
	exchange: "NASDAQ",
};

const filing: Omit<Filing, "createdAt" | "updatedAt"> = {
	id: "fi-1",
	companyId: "co-1",
	cik: "0000320193",
	accessionNumber: "0000320193-23-000077",
	accessionNumberNoDashes: "0000320193230000077",
	form: "10-K",
	filingDate: "2023-11-03",
	reportDate: "2023-09-30",
	fiscalYear: 2023,
	fiscalPeriod: "FY",
};

const chunk: Omit<FilingChunk, "createdAt"> = {
	id: "chunk-1",
	companyId: "co-1",
	filingId: "fi-1",
	form: "10-K",
	filingDate: "2023-11-03",
	fiscalYear: 2023,
	fiscalPeriod: "FY",
	sectionType: "risk_factors",
	text: "The Company faces competition from a variety of sources.",
	textHash: "abc123",
};

const xbrlFact: XbrlFact = {
	id: "xbrl-1",
	companyId: "co-1",
	cik: "0000320193",
	taxonomy: "us-gaap",
	concept: "Revenues",
	unit: "USD",
	value: 394328000000,
	endDate: "2023-09-30",
	fiscalYear: 2023,
	fiscalPeriod: "FY",
	form: "10-K",
	source: "sec_companyfacts",
};

const transcript: Omit<Transcript, "createdAt"> = {
	id: "tr-1",
	companyId: "co-1",
	eventDate: "2023-11-02",
	fiscalYear: 2023,
	fiscalPeriod: "Q4",
	title: "Apple Q4 2023 Earnings Call",
	provider: "fixture",
};

const transcriptChunk: TranscriptChunk = {
	id: "trc-1",
	transcriptId: "tr-1",
	companyId: "co-1",
	eventDate: "2023-11-02",
	fiscalYear: 2023,
	fiscalPeriod: "Q4",
	section: "prepared_remarks",
	speaker: "Tim Cook",
	speakerRole: "CEO",
	text: "We are very pleased with our Q4 results.",
	textHash: "def456",
};

const evidence: Evidence = {
	id: "ev-1",
	sourceType: "filing",
	companyId: "co-1",
	title: "Apple 10-K 2023 — Risk Factors",
	snippet: "The Company faces competition from a variety of sources.",
	filingId: "fi-1",
	filingChunkId: "chunk-1",
	metadata: {},
};

// ---------------------------------------------------------------------------
// CompanyRepository
// ---------------------------------------------------------------------------

describe("InMemoryCompanyRepository", () => {
	let repo: InMemoryCompanyRepository;

	beforeEach(() => {
		repo = new InMemoryCompanyRepository();
	});

	it("creates and retrieves a company by id", async () => {
		await repo.create(company);
		const found = await repo.findById("co-1");
		expect(found?.name).toBe("Apple Inc.");
		expect(found?.createdAt).toBeDefined();
	});

	it("finds by CIK", async () => {
		await repo.create(company);
		const found = await repo.findByCik("0000320193");
		expect(found?.ticker).toBe("AAPL");
	});

	it("finds by ticker (case-insensitive)", async () => {
		await repo.create(company);
		expect(await repo.findByTicker("aapl")).toBeDefined();
		expect(await repo.findByTicker("AAPL")).toBeDefined();
	});

	it("filters by name substring", async () => {
		await repo.create(company);
		await repo.create({ ...company, id: "co-2", cik: "0000789019", ticker: "MSFT", name: "Microsoft Corp." });
		const results = await repo.find({ name: "apple" });
		expect(results).toHaveLength(1);
		expect(results[0].ticker).toBe("AAPL");
	});

	it("updates a company", async () => {
		await repo.create(company);
		const updated = await repo.update("co-1", { exchange: "NYSE" });
		expect(updated?.exchange).toBe("NYSE");
		expect((await repo.findById("co-1"))?.exchange).toBe("NYSE");
	});

	it("deletes a company", async () => {
		await repo.create(company);
		await repo.delete("co-1");
		expect(await repo.findById("co-1")).toBeUndefined();
	});

	it("returns undefined for missing id", async () => {
		expect(await repo.findById("nonexistent")).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// FilingRepository
// ---------------------------------------------------------------------------

describe("InMemoryFilingRepository", () => {
	let repo: InMemoryFilingRepository;

	beforeEach(() => {
		repo = new InMemoryFilingRepository();
	});

	it("creates and retrieves a filing", async () => {
		await repo.create(filing);
		const found = await repo.findById("fi-1");
		expect(found?.form).toBe("10-K");
	});

	it("finds by accession number with dashes", async () => {
		await repo.create(filing);
		expect(await repo.findByAccessionNumber("0000320193-23-000077")).toBeDefined();
	});

	it("finds by accession number without dashes", async () => {
		await repo.create(filing);
		expect(await repo.findByAccessionNumber("0000320193230000077")).toBeDefined();
	});

	it("finds latest filing for a company and form", async () => {
		await repo.create(filing);
		await repo.create({
			...filing,
			id: "fi-2",
			filingDate: "2022-11-04",
			fiscalYear: 2022,
			accessionNumber: "0000320193-22-000099",
			accessionNumberNoDashes: "0000320193220000099",
		});
		const latest = await repo.findLatest("co-1", "10-K");
		expect(latest?.id).toBe("fi-1"); // 2023 > 2022
	});

	it("filters by form and fiscal year", async () => {
		await repo.create(filing);
		await repo.create({
			...filing,
			id: "fi-3",
			form: "10-Q",
			fiscalPeriod: "Q1",
			accessionNumber: "0000320193-24-000001",
			accessionNumberNoDashes: "0000320193240000001",
		});
		const tenKs = await repo.find({ form: "10-K" });
		expect(tenKs).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// FilingChunkRepository
// ---------------------------------------------------------------------------

describe("InMemoryFilingChunkRepository", () => {
	let repo: InMemoryFilingChunkRepository;

	beforeEach(() => {
		repo = new InMemoryFilingChunkRepository();
	});

	it("creates and retrieves a chunk", async () => {
		await repo.create(chunk);
		const found = await repo.findById("chunk-1");
		expect(found?.sectionType).toBe("risk_factors");
	});

	it("finds by text hash (deduplication check)", async () => {
		await repo.create(chunk);
		expect(await repo.findByTextHash("abc123")).toBeDefined();
		expect(await repo.findByTextHash("notexist")).toBeUndefined();
	});

	it("batch creates chunks", async () => {
		const c2: Omit<FilingChunk, "createdAt"> = { ...chunk, id: "chunk-2", textHash: "xyz789" };
		await repo.createBatch([chunk, c2]);
		expect((await repo.find({ filingId: "fi-1" })).length).toBe(2);
	});

	it("filters by sectionType", async () => {
		await repo.create(chunk);
		await repo.create({ ...chunk, id: "chunk-3", sectionType: "mda", textHash: "mda001" });
		const riskChunks = await repo.find({ sectionType: "risk_factors" });
		expect(riskChunks).toHaveLength(1);
	});

	it("deletes by filingId and returns count", async () => {
		await repo.create(chunk);
		await repo.create({ ...chunk, id: "chunk-4", textHash: "hash2" });
		const deleted = await repo.deleteByFilingId("fi-1");
		expect(deleted).toBe(2);
		expect(await repo.find({ filingId: "fi-1" })).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// XbrlFactRepository
// ---------------------------------------------------------------------------

describe("InMemoryXbrlFactRepository", () => {
	let repo: InMemoryXbrlFactRepository;

	beforeEach(() => {
		repo = new InMemoryXbrlFactRepository();
	});

	it("creates and retrieves a fact", async () => {
		await repo.create(xbrlFact);
		const found = await repo.findById("xbrl-1");
		expect(found?.concept).toBe("Revenues");
		expect(found?.value).toBe(394328000000);
	});

	it("filters by concept list", async () => {
		await repo.create(xbrlFact);
		await repo.create({ ...xbrlFact, id: "xbrl-2", concept: "GrossProfit", value: 169148000000 });
		const results = await repo.find({ concepts: ["Revenues", "GrossProfit"] });
		expect(results).toHaveLength(2);
	});

	it("filters by fiscalYear and fiscalPeriod", async () => {
		await repo.create(xbrlFact);
		await repo.create({ ...xbrlFact, id: "xbrl-3", fiscalYear: 2022, concept: "Revenues", value: 394000000000 });
		const fy2023 = await repo.find({ fiscalYear: 2023 });
		expect(fy2023).toHaveLength(1);
	});

	it("deletes all facts for a company", async () => {
		await repo.create(xbrlFact);
		const deleted = await repo.deleteByCompanyId("co-1");
		expect(deleted).toBe(1);
		expect(await repo.find({ companyId: "co-1" })).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// TranscriptRepository
// ---------------------------------------------------------------------------

describe("InMemoryTranscriptRepository", () => {
	let repo: InMemoryTranscriptRepository;

	beforeEach(() => {
		repo = new InMemoryTranscriptRepository();
	});

	it("creates and retrieves a transcript", async () => {
		await repo.create(transcript);
		const found = await repo.findById("tr-1");
		expect(found?.title).toBe("Apple Q4 2023 Earnings Call");
		expect(found?.createdAt).toBeDefined();
	});

	it("finds latest transcript for a company", async () => {
		await repo.create(transcript);
		await repo.create({ ...transcript, id: "tr-2", eventDate: "2023-08-03", fiscalPeriod: "Q3" });
		const latest = await repo.findLatest("co-1");
		expect(latest?.id).toBe("tr-1"); // Nov > Aug
	});
});

// ---------------------------------------------------------------------------
// TranscriptChunkRepository
// ---------------------------------------------------------------------------

describe("InMemoryTranscriptChunkRepository", () => {
	let repo: InMemoryTranscriptChunkRepository;

	beforeEach(() => {
		repo = new InMemoryTranscriptChunkRepository();
	});

	it("creates and retrieves a transcript chunk", async () => {
		await repo.create(transcriptChunk);
		const found = await repo.findById("trc-1");
		expect(found?.speaker).toBe("Tim Cook");
		expect(found?.speakerRole).toBe("CEO");
	});

	it("filters by section and speakerRole", async () => {
		await repo.create(transcriptChunk);
		await repo.create({
			...transcriptChunk,
			id: "trc-2",
			section: "qa",
			speaker: "Analyst",
			speakerRole: "Analyst",
			textHash: "qa001",
		});
		const remarks = await repo.find({ section: "prepared_remarks" });
		expect(remarks).toHaveLength(1);
		const ceoChunks = await repo.find({ speakerRole: "CEO" });
		expect(ceoChunks).toHaveLength(1);
	});

	it("deduplicates via textHash lookup", async () => {
		await repo.create(transcriptChunk);
		expect(await repo.findByTextHash("def456")).toBeDefined();
		expect(await repo.findByTextHash("notexist")).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// EvidenceRepository
// ---------------------------------------------------------------------------

describe("InMemoryEvidenceRepository", () => {
	let repo: InMemoryEvidenceRepository;

	beforeEach(() => {
		repo = new InMemoryEvidenceRepository();
	});

	it("creates and retrieves evidence by id", async () => {
		await repo.create(evidence);
		const found = await repo.findById("ev-1");
		expect(found?.sourceType).toBe("filing");
	});

	it("retrieves multiple evidence by ids", async () => {
		await repo.create(evidence);
		await repo.create({
			...evidence,
			id: "ev-2",
			sourceType: "xbrl_fact",
			xbrlFactId: "xbrl-1",
			filingId: undefined,
		});
		const results = await repo.findByIds(["ev-1", "ev-2"]);
		expect(results).toHaveLength(2);
	});

	it("returns only found ids (skips missing)", async () => {
		await repo.create(evidence);
		const results = await repo.findByIds(["ev-1", "ev-missing"]);
		expect(results).toHaveLength(1);
	});

	it("filters by sourceType", async () => {
		await repo.create(evidence);
		await repo.create({
			...evidence,
			id: "ev-3",
			sourceType: "transcript",
			transcriptId: "tr-1",
			filingId: undefined,
		});
		const filingEvidence = await repo.find({ sourceType: "filing" });
		expect(filingEvidence).toHaveLength(1);
	});

	it("deletes by filingId", async () => {
		await repo.create(evidence);
		const deleted = await repo.deleteByFilingId("fi-1");
		expect(deleted).toBe(1);
		expect(await repo.findById("ev-1")).toBeUndefined();
	});
});

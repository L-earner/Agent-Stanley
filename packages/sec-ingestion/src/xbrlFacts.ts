import { createHash } from "node:crypto";
import type { XbrlFact, XbrlFactRepository } from "@earendil-works/pi-research-db";
import { companyFactsUrl, normalizeCik } from "./cikUtils.ts";
import type { RateLimiter } from "./rateLimiter.ts";

// ---------------------------------------------------------------------------
// Concept aliases — maps logical names to ordered lists of us-gaap concepts.
// Earlier entries take priority; the first concept found in the repository wins.
// ---------------------------------------------------------------------------

export const CONCEPT_ALIASES: Record<string, string[]> = {
	revenue: [
		"RevenueFromContractWithCustomerExcludingAssessedTax",
		"RevenueFromContractWithCustomerIncludingAssessedTax",
		"Revenues",
		"SalesRevenueNet",
		"SalesRevenueGoodsNet",
		"RevenueNotFromContractWithCustomer",
	],
	gross_profit: ["GrossProfit"],
	operating_income: ["OperatingIncomeLoss"],
	net_income: ["NetIncomeLoss"],
	current_assets: ["AssetsCurrent"],
	current_liabilities: ["LiabilitiesCurrent"],
	total_assets: ["Assets"],
	total_liabilities: ["Liabilities"],
	ebit: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"],
};

export function resolveAlias(alias: string): string[] {
	return CONCEPT_ALIASES[alias] ?? [alias];
}

// ---------------------------------------------------------------------------
// Raw EDGAR companyfacts JSON shape
// ---------------------------------------------------------------------------

type FactEntry = {
	start?: string; // present for duration facts (income statement)
	end: string; // always present
	val: number;
	accn: string; // accession number (no dashes)
	fy?: number;
	fp?: string; // "FY" | "Q1" | "Q2" | "Q3" | "Q4"
	form?: string;
	filed?: string;
	frame?: string;
};

export type CompanyFactsRaw = {
	cik: number;
	entityName: string;
	facts: Record<string, Record<string, { label?: string; description?: string; units: Record<string, FactEntry[]> }>>;
};

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function factId(cik: string, taxonomy: string, concept: string, unit: string, accn: string, end: string): string {
	return createHash("sha256")
		.update(`${cik}:${taxonomy}:${concept}:${unit}:${accn}:${end}`)
		.digest("hex")
		.slice(0, 16);
}

/**
 * Flatten the nested companyfacts JSON into a list of XbrlFact rows.
 * Instant facts (balance sheet) have no `start` field — they get `instantDate`.
 * Duration facts (income statement) have both `start` and `end` — they get `startDate`/`endDate`.
 */
export function normalizeCompanyFacts(raw: CompanyFactsRaw, companyId: string): XbrlFact[] {
	const cik = normalizeCik(raw.cik);
	const facts: XbrlFact[] = [];

	for (const [taxonomy, concepts] of Object.entries(raw.facts)) {
		for (const [concept, conceptData] of Object.entries(concepts)) {
			const { label, description, units } = conceptData;
			for (const [unit, entries] of Object.entries(units)) {
				for (const entry of entries) {
					const isDuration = entry.start !== undefined;
					facts.push({
						id: factId(cik, taxonomy, concept, unit, entry.accn, entry.end),
						companyId,
						cik,
						taxonomy,
						concept,
						label,
						description,
						unit,
						value: entry.val,
						startDate: isDuration ? entry.start : undefined,
						endDate: isDuration ? entry.end : undefined,
						instantDate: isDuration ? undefined : entry.end,
						fiscalYear: entry.fy,
						fiscalPeriod: entry.fp,
						form: entry.form,
						accessionNumber: entry.accn,
						frame: entry.frame,
						filed: entry.filed,
						source: "sec_companyfacts",
					});
				}
			}
		}
	}

	return facts;
}

// ---------------------------------------------------------------------------
// Ingestor
// ---------------------------------------------------------------------------

export type XbrlIngestResult = {
	companyId: string;
	cik: string;
	entityName: string;
	factsIngested: number;
	taxonomies: string[];
};

export type XbrlIngestorConfig = {
	userAgent?: string;
	fetch?: typeof fetch;
	rateLimiter?: RateLimiter;
};

export class XbrlIngestor {
	private readonly fetch: typeof fetch;
	private readonly userAgent: string;
	private readonly rateLimiter?: RateLimiter;

	constructor(config: XbrlIngestorConfig = {}) {
		this.fetch = config.fetch ?? globalThis.fetch;
		this.userAgent = config.userAgent ?? process.env.SEC_USER_AGENT ?? "";
		this.rateLimiter = config.rateLimiter;
	}

	async fetchCompanyFacts(cik: string): Promise<CompanyFactsRaw> {
		if (this.rateLimiter) await this.rateLimiter.throttle();
		const url = companyFactsUrl(cik);
		const response = await this.fetch(url, {
			headers: {
				"User-Agent": this.userAgent,
				Accept: "application/json",
			},
		});
		if (!response.ok) {
			throw new Error(`XBRL fetch failed: ${response.status} ${url}`);
		}
		return response.json() as Promise<CompanyFactsRaw>;
	}

	async ingest(
		cik: string,
		companyId: string,
		repo: XbrlFactRepository,
		forceRefresh = false,
	): Promise<XbrlIngestResult> {
		if (forceRefresh) {
			await repo.deleteByCompanyId(companyId);
		}

		const raw = await this.fetchCompanyFacts(cik);
		const facts = normalizeCompanyFacts(raw, companyId);

		const existing = await repo.find({ companyId });
		const existingIds = new Set(existing.map((f) => f.id));
		const toInsert = facts.filter((f) => !existingIds.has(f.id));

		if (toInsert.length > 0) {
			await repo.createBatch(toInsert);
		}

		const taxonomies = [...new Set(facts.map((f) => f.taxonomy))];
		return {
			companyId,
			cik: normalizeCik(cik),
			entityName: raw.entityName,
			factsIngested: toInsert.length,
			taxonomies,
		};
	}
}

// ---------------------------------------------------------------------------
// Core retrieval logic (used by Phase 7 tool wrapper)
// ---------------------------------------------------------------------------

export type GetXbrlFactsInput = {
	cik: string;
	concepts?: string[]; // exact us-gaap concept names
	aliases?: string[]; // logical aliases e.g. "revenue", "gross_profit"
	fiscalYear?: number;
	fiscalPeriod?: string;
	unit?: string;
};

export type GetXbrlFactsResult = {
	facts: XbrlFact[];
	evidenceIds: string[];
};

export async function getXbrlFactsCore(
	input: GetXbrlFactsInput,
	repo: XbrlFactRepository,
): Promise<GetXbrlFactsResult> {
	const resolvedConcepts: string[] = [...(input.concepts ?? [])];
	for (const alias of input.aliases ?? []) {
		resolvedConcepts.push(...resolveAlias(alias));
	}

	const filters = {
		cik: normalizeCik(input.cik),
		...(resolvedConcepts.length ? { concepts: resolvedConcepts } : {}),
		...(input.fiscalYear != null ? { fiscalYear: input.fiscalYear } : {}),
		...(input.fiscalPeriod ? { fiscalPeriod: input.fiscalPeriod } : {}),
		...(input.unit ? { unit: input.unit } : {}),
	};

	const facts = await repo.find(filters);
	return { facts, evidenceIds: facts.map((f) => f.id) };
}

import type { XbrlFact, XbrlFactRepository } from "@earendil-works/pi-research-db";
import { normalizeCik } from "./cikUtils.ts";
import { resolveAlias } from "./xbrlFacts.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MetricName = "gross_margin" | "operating_margin" | "net_margin" | "revenue_growth_yoy" | "current_ratio";

export type MetricInput = {
	concept: string;
	value: number;
	fiscalYear: number;
	fiscalPeriod: string;
	evidenceId: string;
};

export type MetricResult = {
	metric: MetricName;
	value: number; // rounded to 4 decimal places
	unit: "%" | "ratio";
	inputs: MetricInput[];
};

export type ComputeMetricInput = {
	metric: MetricName;
	cik: string;
	fiscalYear: number;
	fiscalPeriod: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find the best fact for a logical alias + period combination.
 * Tries concept aliases in order; if multiple results, prefers the most
 * recently filed (so amendments override originals).
 */
async function findFactByAlias(
	repo: XbrlFactRepository,
	cik: string,
	alias: string,
	fiscalYear: number,
	fiscalPeriod: string,
): Promise<XbrlFact | undefined> {
	const concepts = resolveAlias(alias);
	for (const concept of concepts) {
		const results = await repo.find({ cik, concept, fiscalYear, fiscalPeriod, unit: "USD" });
		if (results.length === 0) continue;
		// Sort descending by filed date; fall back to stable id sort if filed is missing.
		results.sort((a, b) => {
			if (a.filed && b.filed) return b.filed.localeCompare(a.filed);
			return b.id.localeCompare(a.id);
		});
		return results[0];
	}
	return undefined;
}

function toInput(fact: XbrlFact): MetricInput {
	return {
		concept: fact.concept,
		value: fact.value as number,
		fiscalYear: fact.fiscalYear!,
		fiscalPeriod: fact.fiscalPeriod!,
		evidenceId: fact.id,
	};
}

function round4(n: number): number {
	return Math.round(n * 10000) / 10000;
}

function requireFact(fact: XbrlFact | undefined, label: string, fy: number, fp: string): XbrlFact {
	if (!fact) throw new Error(`Missing XBRL fact: ${label} for FY${fy} ${fp}`);
	return fact;
}

// ---------------------------------------------------------------------------
// Metric computations
// ---------------------------------------------------------------------------

async function grossMargin(
	cik: string,
	fiscalYear: number,
	fiscalPeriod: string,
	repo: XbrlFactRepository,
): Promise<MetricResult> {
	const revenue = requireFact(
		await findFactByAlias(repo, cik, "revenue", fiscalYear, fiscalPeriod),
		"revenue",
		fiscalYear,
		fiscalPeriod,
	);
	const grossProfit = requireFact(
		await findFactByAlias(repo, cik, "gross_profit", fiscalYear, fiscalPeriod),
		"gross_profit",
		fiscalYear,
		fiscalPeriod,
	);

	const rev = revenue.value as number;
	if (rev === 0) throw new Error("Cannot compute gross_margin: revenue is zero");

	return {
		metric: "gross_margin",
		value: round4(((grossProfit.value as number) / rev) * 100),
		unit: "%",
		inputs: [toInput(revenue), toInput(grossProfit)],
	};
}

async function operatingMargin(
	cik: string,
	fiscalYear: number,
	fiscalPeriod: string,
	repo: XbrlFactRepository,
): Promise<MetricResult> {
	const revenue = requireFact(
		await findFactByAlias(repo, cik, "revenue", fiscalYear, fiscalPeriod),
		"revenue",
		fiscalYear,
		fiscalPeriod,
	);
	const opIncome = requireFact(
		await findFactByAlias(repo, cik, "operating_income", fiscalYear, fiscalPeriod),
		"operating_income",
		fiscalYear,
		fiscalPeriod,
	);

	const rev = revenue.value as number;
	if (rev === 0) throw new Error("Cannot compute operating_margin: revenue is zero");

	return {
		metric: "operating_margin",
		value: round4(((opIncome.value as number) / rev) * 100),
		unit: "%",
		inputs: [toInput(revenue), toInput(opIncome)],
	};
}

async function netMargin(
	cik: string,
	fiscalYear: number,
	fiscalPeriod: string,
	repo: XbrlFactRepository,
): Promise<MetricResult> {
	const revenue = requireFact(
		await findFactByAlias(repo, cik, "revenue", fiscalYear, fiscalPeriod),
		"revenue",
		fiscalYear,
		fiscalPeriod,
	);
	const netIncome = requireFact(
		await findFactByAlias(repo, cik, "net_income", fiscalYear, fiscalPeriod),
		"net_income",
		fiscalYear,
		fiscalPeriod,
	);

	const rev = revenue.value as number;
	if (rev === 0) throw new Error("Cannot compute net_margin: revenue is zero");

	return {
		metric: "net_margin",
		value: round4(((netIncome.value as number) / rev) * 100),
		unit: "%",
		inputs: [toInput(revenue), toInput(netIncome)],
	};
}

async function revenueGrowthYoY(
	cik: string,
	fiscalYear: number,
	fiscalPeriod: string,
	repo: XbrlFactRepository,
): Promise<MetricResult> {
	const current = requireFact(
		await findFactByAlias(repo, cik, "revenue", fiscalYear, fiscalPeriod),
		"revenue (current year)",
		fiscalYear,
		fiscalPeriod,
	);
	const prior = requireFact(
		await findFactByAlias(repo, cik, "revenue", fiscalYear - 1, fiscalPeriod),
		"revenue (prior year)",
		fiscalYear - 1,
		fiscalPeriod,
	);

	const priorVal = prior.value as number;
	if (priorVal === 0) throw new Error("Cannot compute revenue_growth_yoy: prior year revenue is zero");

	return {
		metric: "revenue_growth_yoy",
		value: round4((((current.value as number) - priorVal) / priorVal) * 100),
		unit: "%",
		inputs: [toInput(current), toInput(prior)],
	};
}

async function currentRatio(
	cik: string,
	fiscalYear: number,
	fiscalPeriod: string,
	repo: XbrlFactRepository,
): Promise<MetricResult> {
	const currentAssets = requireFact(
		await findFactByAlias(repo, cik, "current_assets", fiscalYear, fiscalPeriod),
		"current_assets",
		fiscalYear,
		fiscalPeriod,
	);
	const currentLiab = requireFact(
		await findFactByAlias(repo, cik, "current_liabilities", fiscalYear, fiscalPeriod),
		"current_liabilities",
		fiscalYear,
		fiscalPeriod,
	);

	const liab = currentLiab.value as number;
	if (liab === 0) throw new Error("Cannot compute current_ratio: current liabilities is zero");

	return {
		metric: "current_ratio",
		value: round4((currentAssets.value as number) / liab),
		unit: "ratio",
		inputs: [toInput(currentAssets), toInput(currentLiab)],
	};
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function computeMetric(input: ComputeMetricInput, repo: XbrlFactRepository): Promise<MetricResult> {
	const cik = normalizeCik(input.cik);
	const { fiscalYear, fiscalPeriod, metric } = input;

	switch (metric) {
		case "gross_margin":
			return grossMargin(cik, fiscalYear, fiscalPeriod, repo);
		case "operating_margin":
			return operatingMargin(cik, fiscalYear, fiscalPeriod, repo);
		case "net_margin":
			return netMargin(cik, fiscalYear, fiscalPeriod, repo);
		case "revenue_growth_yoy":
			return revenueGrowthYoY(cik, fiscalYear, fiscalPeriod, repo);
		case "current_ratio":
			return currentRatio(cik, fiscalYear, fiscalPeriod, repo);
	}
}

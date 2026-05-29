import { defineTool } from "@earendil-works/pi-coding-agent";
import type { CompanyRepository, XbrlFactRepository } from "@earendil-works/pi-research-db";
import type { MetricName, MetricResult } from "@earendil-works/pi-sec-ingestion";
import { computeMetric } from "@earendil-works/pi-sec-ingestion";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export type ComputeMetricToolInput = {
	companyId: string;
	metric: MetricName;
	fiscalYear: number;
	fiscalPeriod: string;
};

export async function computeMetricToolCore(
	input: ComputeMetricToolInput,
	deps: { companyRepo: CompanyRepository; xbrlRepo: XbrlFactRepository },
) {
	const company = await deps.companyRepo.findById(input.companyId);
	if (!company) {
		throw new Error(`Company not found: ${input.companyId}. Call ingest_company_filings first.`);
	}

	return computeMetric(
		{ metric: input.metric, cik: company.cik, fiscalYear: input.fiscalYear, fiscalPeriod: input.fiscalPeriod },
		deps.xbrlRepo,
	);
}

// ---------------------------------------------------------------------------
// Pi tool wrapper
// ---------------------------------------------------------------------------

export function createComputeMetricTool(deps: { companyRepo: CompanyRepository; xbrlRepo: XbrlFactRepository }) {
	return defineTool({
		name: "compute_metric",
		label: "Compute Financial Metric",
		description:
			"Calculate a derived financial metric from XBRL facts. Returns the computed value, unit, and every input fact with its evidenceId. Throws if required data is missing — do not guess.",
		promptSnippet:
			"compute_metric(companyId, metric, fiscalYear, fiscalPeriod) — calculate gross_margin, operating_margin, net_margin, revenue_growth_yoy, or current_ratio",
		promptGuidelines: [
			"Use compute_metric instead of calculating metrics from raw XBRL values yourself.",
			"The inputs array in the result gives the evidenceIds for each input fact — include them in citations.",
			"If compute_metric throws, tell the user the data is unavailable rather than estimating.",
		],
		parameters: Type.Object({
			companyId: Type.String({ description: "Company ID from resolve_company or ingest_company_filings" }),
			metric: Type.Union(
				[
					Type.Literal("gross_margin"),
					Type.Literal("operating_margin"),
					Type.Literal("net_margin"),
					Type.Literal("revenue_growth_yoy"),
					Type.Literal("current_ratio"),
				],
				{
					description:
						"Metric to compute: gross_margin, operating_margin, net_margin, revenue_growth_yoy, or current_ratio",
				},
			),
			fiscalYear: Type.Number({ description: "Fiscal year, e.g. 2023" }),
			fiscalPeriod: Type.String({ description: "Fiscal period: FY, Q1, Q2, Q3, or Q4" }),
		}),
		execute: async (_toolCallId, params) => {
			try {
				const result = await computeMetricToolCore(params, deps);
				return {
					content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
					details: result,
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text" as const, text: `Error: ${msg}` }],
					details: { error: msg } as unknown as MetricResult,
					isError: true,
				};
			}
		},
	});
}

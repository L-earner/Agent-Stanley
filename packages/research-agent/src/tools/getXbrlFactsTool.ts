import { defineTool } from "@earendil-works/pi-coding-agent";
import type { CompanyRepository, XbrlFactRepository } from "@earendil-works/pi-research-db";
import { getXbrlFactsCore } from "@earendil-works/pi-sec-ingestion";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export type GetXbrlFactsInput = {
	companyId: string;
	aliases?: string[];
	concepts?: string[];
	fiscalYear?: number;
	fiscalPeriod?: string;
};

export type XbrlFactSummary = {
	concept: string;
	label?: string;
	value: number;
	unit: string;
	fiscalYear?: number;
	fiscalPeriod?: string;
	endDate?: string;
	instantDate?: string;
	evidenceId: string;
};

export type GetXbrlFactsResult = {
	facts: XbrlFactSummary[];
	count: number;
};

export async function getXbrlFactsToolCore(
	input: GetXbrlFactsInput,
	deps: { companyRepo: CompanyRepository; xbrlRepo: XbrlFactRepository },
): Promise<GetXbrlFactsResult> {
	const company = await deps.companyRepo.findById(input.companyId);
	if (!company) {
		throw new Error(`Company not found: ${input.companyId}. Call ingest_company_filings first.`);
	}

	const { facts } = await getXbrlFactsCore(
		{
			cik: company.cik,
			aliases: input.aliases,
			concepts: input.concepts,
			fiscalYear: input.fiscalYear,
			fiscalPeriod: input.fiscalPeriod,
		},
		deps.xbrlRepo,
	);

	const summaries: XbrlFactSummary[] = facts.map((f) => ({
		concept: f.concept,
		label: f.label,
		value: f.value as number,
		unit: f.unit,
		fiscalYear: f.fiscalYear,
		fiscalPeriod: f.fiscalPeriod,
		endDate: f.endDate,
		instantDate: f.instantDate,
		evidenceId: f.id,
	}));

	return { facts: summaries, count: summaries.length };
}

// ---------------------------------------------------------------------------
// Pi tool wrapper
// ---------------------------------------------------------------------------

export function createGetXbrlFactsTool(deps: { companyRepo: CompanyRepository; xbrlRepo: XbrlFactRepository }) {
	return defineTool({
		name: "get_xbrl_facts",
		label: "Get XBRL Facts",
		description:
			"Retrieve structured XBRL financial facts (revenue, net income, assets, etc.) from SEC filings. Use logical aliases like 'revenue', 'gross_profit', 'net_income'. Each fact has an evidenceId for citation.",
		promptSnippet: "get_xbrl_facts(companyId, aliases, fiscalYear, fiscalPeriod) — get structured financial data",
		promptGuidelines: [
			"Always use XBRL facts for numeric financial values — never use recalled or estimated figures.",
			"Include the evidenceId for every numeric value cited in your answer.",
		],
		parameters: Type.Object({
			companyId: Type.String({ description: "Company ID from resolve_company or ingest_company_filings" }),
			aliases: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"Logical aliases: revenue, gross_profit, operating_income, net_income, current_assets, current_liabilities, total_assets",
				}),
			),
			concepts: Type.Optional(
				Type.Array(Type.String(), {
					description: "Exact us-gaap concept names, e.g. RevenueFromContractWithCustomerExcludingAssessedTax",
				}),
			),
			fiscalYear: Type.Optional(Type.Number({ description: "Fiscal year, e.g. 2023" })),
			fiscalPeriod: Type.Optional(Type.String({ description: "Fiscal period: FY, Q1, Q2, Q3, or Q4" })),
		}),
		execute: async (_toolCallId, params) => {
			try {
				const result = await getXbrlFactsToolCore(params, deps);
				return {
					content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
					details: result,
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text" as const, text: `Error: ${msg}` }],
					details: { error: msg } as unknown as GetXbrlFactsResult,
					isError: true,
				};
			}
		},
	});
}

import { defineTool } from "@earendil-works/pi-coding-agent";
import type { FilingRepository } from "@earendil-works/pi-research-db";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export type ListFilingsInput = {
	companyId: string;
	forms?: string[];
	limit?: number;
};

export type FilingSummary = {
	id: string;
	form: string;
	filingDate: string;
	fiscalYear?: number;
	fiscalPeriod?: string;
	accessionNumber: string;
};

export type ListFilingsResult = {
	filings: FilingSummary[];
	count: number;
};

export async function listFilingsCore(
	input: ListFilingsInput,
	deps: { filingRepo: FilingRepository },
): Promise<ListFilingsResult> {
	const { companyId, forms, limit = 10 } = input;

	let filings = await deps.filingRepo.find({ companyId });

	if (forms?.length) {
		filings = filings.filter((f) => forms.includes(f.form));
	}

	// Most recent first
	filings.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
	filings = filings.slice(0, limit);

	const summaries: FilingSummary[] = filings.map((f) => ({
		id: f.id,
		form: f.form,
		filingDate: f.filingDate,
		fiscalYear: f.fiscalYear,
		fiscalPeriod: f.fiscalPeriod,
		accessionNumber: f.accessionNumber,
	}));

	return { filings: summaries, count: summaries.length };
}

// ---------------------------------------------------------------------------
// Pi tool wrapper
// ---------------------------------------------------------------------------

export function createListFilingsTool(deps: { filingRepo: FilingRepository }) {
	return defineTool({
		name: "list_filings",
		label: "List Filings",
		description:
			"List SEC filings available in the data store for a company. Use resolve_company to get the companyId.",
		promptSnippet: "list_filings(companyId, forms?) — list available SEC filings",
		parameters: Type.Object({
			companyId: Type.String({ description: "Company ID from resolve_company or ingest_company_filings" }),
			forms: Type.Optional(
				Type.Array(Type.String(), {
					description: 'Form types to filter by, e.g. ["10-K", "10-Q"]',
				}),
			),
			limit: Type.Optional(Type.Number({ description: "Max results to return (default 10)", default: 10 })),
		}),
		execute: async (_toolCallId, params) => {
			try {
				const result = await listFilingsCore(params, deps);
				return {
					content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
					details: result,
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text" as const, text: `Error: ${msg}` }],
					details: { error: msg } as unknown as ListFilingsResult,
					isError: true,
				};
			}
		},
	});
}

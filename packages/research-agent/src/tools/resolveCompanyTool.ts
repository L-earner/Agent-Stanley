import { defineTool } from "@earendil-works/pi-coding-agent";
import type { CompanyRepository } from "@earendil-works/pi-research-db";
import { normalizeCik } from "@earendil-works/pi-sec-ingestion";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export type ResolveCompanyInput = {
	/** Ticker symbol (e.g. "AAPL"), company name, or 10-digit CIK. */
	query: string;
};

export type ResolveCompanyResult = {
	status: "found" | "not_found";
	company?: {
		id: string;
		cik: string;
		ticker?: string;
		name: string;
	};
	message: string;
};

function looksLikeCik(q: string): boolean {
	return /^\d{1,10}$/.test(q.trim());
}

export async function resolveCompanyCore(
	input: ResolveCompanyInput,
	deps: { companyRepo: CompanyRepository },
): Promise<ResolveCompanyResult> {
	const { query } = input;
	const q = query.trim();

	// Try exact ticker match
	let company = await deps.companyRepo.findByTicker(q);

	// Try CIK lookup
	if (!company && looksLikeCik(q)) {
		company = await deps.companyRepo.findByCik(normalizeCik(q));
	}

	// Try name substring search
	if (!company) {
		const matches = await deps.companyRepo.find({ name: q });
		if (matches.length > 0) company = matches[0];
	}

	if (!company) {
		return {
			status: "not_found",
			message: `No company found for "${q}". Call ingest_company_filings with the ticker symbol to load data.`,
		};
	}

	return {
		status: "found",
		company: { id: company.id, cik: company.cik, ticker: company.ticker, name: company.name },
		message: `Found: ${company.name} (${company.ticker ?? company.cik})`,
	};
}

// ---------------------------------------------------------------------------
// Pi tool wrapper
// ---------------------------------------------------------------------------

export function createResolveCompanyTool(deps: { companyRepo: CompanyRepository }) {
	return defineTool({
		name: "resolve_company",
		label: "Resolve Company",
		description:
			"Look up a company by ticker symbol, name, or CIK. Returns the internal companyId needed for other tools. Call ingest_company_filings first if data has not been loaded.",
		promptSnippet: "resolve_company(query) — look up a company to get its companyId",
		parameters: Type.Object({
			query: Type.String({
				description: "Ticker symbol (e.g. AAPL), company name, or 10-digit CIK",
			}),
		}),
		execute: async (_toolCallId, params) => {
			try {
				const result = await resolveCompanyCore(params, deps);
				return {
					content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
					details: result,
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text" as const, text: `Error: ${msg}` }],
					details: { error: msg } as unknown as ResolveCompanyResult,
					isError: true,
				};
			}
		},
	});
}

import { defineTool } from "@earendil-works/pi-coding-agent";
import { companyIdFromCik, ingestFilings } from "@earendil-works/pi-sec-ingestion";
import { Type } from "typebox";
import type { FinanceToolDeps } from "./toolDeps.ts";

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export type IngestCompanyFilingsInput = {
	ticker: string;
	forms?: Array<"10-K" | "10-Q">;
	/** Re-download and re-chunk even if data already exists. Default false. */
	forceRefresh?: boolean;
	/** Also fetch XBRL structured facts from data.sec.gov. Default true. */
	includeXbrl?: boolean;
};

export type IngestCompanyFilingsResult = {
	companyId: string;
	ticker: string;
	name: string;
	cik: string;
	ingestedFilings: number;
	skippedFilings: number;
	xbrlFactsIngested?: number;
};

export async function ingestCompanyFilingsCore(
	input: IngestCompanyFilingsInput,
	deps: Pick<
		FinanceToolDeps,
		"companyRepo" | "filingRepo" | "chunkRepo" | "xbrlRepo" | "ninjasClient" | "downloader" | "xbrlIngestor"
	>,
): Promise<IngestCompanyFilingsResult> {
	const { ticker, forms = ["10-K", "10-Q"], forceRefresh = false, includeXbrl = true } = input;

	// Ingest filing HTML + chunks
	const pipelineResult = await ingestFilings(
		{ ticker, forms, forceRefresh },
		{
			ninjasClient: deps.ninjasClient,
			downloader: deps.downloader,
			filingRepo: deps.filingRepo,
			chunkRepo: deps.chunkRepo,
		},
	);

	const cik = pipelineResult.cik;
	if (!cik) {
		throw new Error(`No filings found for ticker "${ticker}". Check the ticker symbol and try again.`);
	}

	const companyId = companyIdFromCik(cik);
	let entityName = ticker.toUpperCase();
	let xbrlFactsIngested: number | undefined;

	// Optionally ingest XBRL structured facts
	if (includeXbrl) {
		try {
			const xbrlResult = await deps.xbrlIngestor.ingest(cik, companyId, deps.xbrlRepo, forceRefresh);
			xbrlFactsIngested = xbrlResult.factsIngested;
			if (xbrlResult.entityName) entityName = xbrlResult.entityName;
		} catch {
			// XBRL fetch failure is non-fatal — filing text is still available
			xbrlFactsIngested = 0;
		}
	}

	// Create or update Company record
	const existing = await deps.companyRepo.findById(companyId);
	if (!existing) {
		await deps.companyRepo.create({ id: companyId, cik, ticker: ticker.toUpperCase(), name: entityName });
	} else if (entityName !== ticker.toUpperCase()) {
		await deps.companyRepo.update(companyId, { name: entityName });
	}

	return {
		companyId,
		ticker: ticker.toUpperCase(),
		name: entityName,
		cik,
		ingestedFilings: pipelineResult.ingestedFilings.length,
		skippedFilings: pipelineResult.skippedFilings.length,
		xbrlFactsIngested,
	};
}

// ---------------------------------------------------------------------------
// Pi tool wrapper
// ---------------------------------------------------------------------------

export function createIngestCompanyFilingsTool(deps: FinanceToolDeps) {
	return defineTool({
		name: "ingest_company_filings",
		label: "Ingest Company Filings",
		description:
			"Download and index SEC filings (10-K, 10-Q) and XBRL structured facts for a company. Returns the companyId to use in subsequent tools. Safe to call again — already-ingested filings are skipped.",
		promptSnippet: "ingest_company_filings(ticker) — load a company's SEC filings into the research store",
		parameters: Type.Object({
			ticker: Type.String({ description: "Stock ticker symbol, e.g. AAPL" }),
			forms: Type.Optional(
				Type.Array(Type.String(), {
					description: 'Filing types to ingest, e.g. ["10-K", "10-Q"]. Defaults to both.',
				}),
			),
			forceRefresh: Type.Optional(
				Type.Boolean({ description: "Re-download and re-chunk even if already ingested", default: false }),
			),
			includeXbrl: Type.Optional(
				Type.Boolean({
					description: "Also fetch XBRL structured facts (required for compute_metric)",
					default: true,
				}),
			),
		}),
		execute: async (_toolCallId, params) => {
			try {
				const input: IngestCompanyFilingsInput = {
					ticker: params.ticker,
					forms: params.forms as Array<"10-K" | "10-Q"> | undefined,
					forceRefresh: params.forceRefresh,
					includeXbrl: params.includeXbrl,
				};
				const result = await ingestCompanyFilingsCore(input, deps);
				return {
					content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
					details: result,
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text" as const, text: `Error: ${msg}` }],
					details: { error: msg } as unknown as IngestCompanyFilingsResult,
					isError: true,
				};
			}
		},
	});
}

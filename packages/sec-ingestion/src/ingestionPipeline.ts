import { createHash } from "node:crypto";
import type { FilingChunkRepository, FilingRepository } from "@earendil-works/pi-research-db";
import { chunkText } from "./chunker.ts";
import type { FilingDownloader } from "./filingDownloader.ts";
import { parseFilingResults } from "./filingParser.ts";
import { cleanHtml } from "./htmlCleaner.ts";
import type { NinjasSecClient, SupportedFormType } from "./ninjasClient.ts";
import { sectionize10K, sectionize10Q } from "./sectionizer.ts";

export type IngestFilingsInput = {
	ticker: string;
	forms: Array<SupportedFormType>;
	/** Max filings to ingest per form type. Default: 2. */
	limitPerForm?: number;
	/** Re-download and re-chunk even if filing already exists. Default: false. */
	forceRefresh?: boolean;
};

export type IngestedFilingSummary = {
	filingId: string;
	form: string;
	filingDate: string;
	ticker: string;
	chunksCreated: number;
	sectionsCreated: number;
	diagnostics: {
		sectionsFound: number;
		tocSkipped: number;
		missingSections: string[];
	};
};

export type SkippedFilingSummary = {
	filingUrl: string;
	reason: string;
};

export type IngestFilingsResult = {
	ticker: string;
	/** CIK of the company, extracted from the first parseable filing URL. */
	cik?: string;
	ingestedFilings: IngestedFilingSummary[];
	skippedFilings: SkippedFilingSummary[];
};

export type IngestPipelineDeps = {
	ninjasClient: NinjasSecClient;
	downloader: FilingDownloader;
	filingRepo: FilingRepository;
	chunkRepo: FilingChunkRepository;
};

/**
 * Ingest SEC filings for a ticker into the research data store.
 *
 * Flow for each filing URL:
 *   1. Check if already ingested (skip unless forceRefresh).
 *   2. Download HTML from SEC.
 *   3. Clean HTML → plain text.
 *   4. Sectionize (10-K or 10-Q patterns).
 *   5. Chunk each section.
 *   6. Deduplicate chunks by textHash.
 *   7. Persist filing + chunks.
 */
export async function ingestFilings(input: IngestFilingsInput, deps: IngestPipelineDeps): Promise<IngestFilingsResult> {
	const { ticker, forms, limitPerForm = 2, forceRefresh = false } = input;
	const ingestedFilings: IngestedFilingSummary[] = [];
	const skippedFilings: SkippedFilingSummary[] = [];
	let resultCik: string | undefined;

	for (const form of forms) {
		const results = await deps.ninjasClient.searchFilings(ticker, form, { limit: limitPerForm });
		const filings = parseFilingResults(results);
		if (!resultCik && filings.length > 0) resultCik = filings[0].cik;

		for (const filing of filings) {
			// Idempotency check
			if (!forceRefresh) {
				const existing = await deps.filingRepo.findByAccessionNumber(filing.accessionNumber);
				if (existing) {
					skippedFilings.push({ filingUrl: filing.primaryDocumentUrl!, reason: "already ingested" });
					continue;
				}
			} else {
				// Remove existing chunks so they are re-created
				await deps.chunkRepo.deleteByFilingId(filing.id);
			}

			if (!filing.primaryDocumentUrl) {
				skippedFilings.push({ filingUrl: "(unknown)", reason: "no primary document URL" });
				continue;
			}

			// Download
			let downloadResult: Awaited<ReturnType<FilingDownloader["download"]>>;
			try {
				downloadResult = await deps.downloader.download(filing.primaryDocumentUrl);
			} catch (err) {
				skippedFilings.push({
					filingUrl: filing.primaryDocumentUrl,
					reason: `download failed: ${err instanceof Error ? err.message : String(err)}`,
				});
				continue;
			}

			// Clean
			const cleanText = cleanHtml(downloadResult.content);

			// Sectionize
			const sectionResult =
				filing.form === "10-Q" ? sectionize10Q(cleanText, filing.id) : sectionize10K(cleanText, filing.id);

			// Chunk each section + deduplicate
			let chunksCreated = 0;

			for (const section of sectionResult.sections) {
				const chunks = chunkText(section.text);

				for (const chunk of chunks) {
					const existing = await deps.chunkRepo.findByTextHash(chunk.textHash);
					if (existing) continue; // exact duplicate

					const chunkId = createHash("sha256")
						.update(`${filing.id}:${section.itemLabel}:${chunk.charStart}`)
						.digest("hex")
						.slice(0, 16);

					await deps.chunkRepo.create({
						id: chunkId,
						companyId: filing.companyId,
						filingId: filing.id,
						form: filing.form,
						filingDate: filing.filingDate,
						fiscalYear: filing.fiscalYear,
						fiscalPeriod: filing.fiscalPeriod,
						sectionType: section.sectionType,
						text: chunk.text,
						textHash: chunk.textHash,
						tokenCount: chunk.tokenCount,
						sourceUrl: filing.primaryDocumentUrl,
						sourceLocator: section.itemLabel,
					});
					chunksCreated++;
				}
			}

			// Persist the filing record after chunks are written
			await deps.filingRepo.create(filing);

			ingestedFilings.push({
				filingId: filing.id,
				form: filing.form,
				filingDate: filing.filingDate,
				ticker,
				chunksCreated,
				sectionsCreated: sectionResult.sections.length,
				diagnostics: {
					sectionsFound: sectionResult.diagnostics.sectionsExtracted,
					tocSkipped: sectionResult.diagnostics.tocSkipped,
					missingSections: sectionResult.diagnostics.missingSections,
				},
			});
		}
	}

	return { ticker, cik: resultCik, ingestedFilings, skippedFilings };
}

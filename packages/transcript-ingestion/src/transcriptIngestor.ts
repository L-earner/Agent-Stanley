import type { TranscriptChunkRepository, TranscriptRepository } from "@earendil-works/pi-research-db";
import type { TranscriptProvider } from "./TranscriptProvider.ts";
import { parseTranscript, transcriptId } from "./transcriptParser.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TranscriptIngestInput = {
	ticker: string;
	year: number;
	quarter: number;
	forceRefresh?: boolean;
};

export type TranscriptIngestResult = {
	transcriptId: string;
	ticker: string;
	year: number;
	quarter: number;
	chunksCreated: number;
	skipped: boolean;
	skipReason?: string;
};

export type TranscriptIngestorDeps = {
	transcriptRepo: TranscriptRepository;
	chunkRepo: TranscriptChunkRepository;
};

// ---------------------------------------------------------------------------
// Ingestor
// ---------------------------------------------------------------------------

/**
 * Fetch a single earnings transcript, parse it into chunks, and persist.
 *
 * Idempotent: if the transcript already exists in the repository, skips
 * unless forceRefresh = true (which deletes and re-creates chunks).
 */
export async function ingestTranscript(
	input: TranscriptIngestInput,
	companyId: string,
	provider: TranscriptProvider,
	deps: TranscriptIngestorDeps,
): Promise<TranscriptIngestResult> {
	const { ticker, year, quarter, forceRefresh = false } = input;
	const tId = transcriptId(ticker, year, quarter);

	// Idempotency check
	if (!forceRefresh) {
		const existing = await deps.transcriptRepo.findById(tId);
		if (existing) {
			return {
				transcriptId: tId,
				ticker,
				year,
				quarter,
				chunksCreated: 0,
				skipped: true,
				skipReason: "already ingested",
			};
		}
	} else {
		await deps.chunkRepo.deleteByTranscriptId(tId);
		await deps.transcriptRepo.delete(tId);
	}

	const raw = await provider.fetchTranscript(ticker, year, quarter);
	const { transcript, chunks } = parseTranscript(raw, companyId);

	// Dedup by textHash
	let created = 0;
	for (const chunk of chunks) {
		const existing = await deps.chunkRepo.findByTextHash(chunk.textHash);
		if (!existing) {
			await deps.chunkRepo.create(chunk);
			created++;
		}
	}

	await deps.transcriptRepo.create(transcript);

	return { transcriptId: tId, ticker, year, quarter, chunksCreated: created, skipped: false };
}

/**
 * Search for available transcripts then ingest each one.
 * Returns one result per transcript processed.
 */
export async function ingestAllTranscripts(
	ticker: string,
	companyId: string,
	provider: TranscriptProvider,
	deps: TranscriptIngestorDeps,
	options: { limit?: number; forceRefresh?: boolean } = {},
): Promise<TranscriptIngestResult[]> {
	const { limit = 4, forceRefresh = false } = options;

	const available = (await provider.searchTranscripts({ ticker, limit })).slice(0, limit);
	const results: TranscriptIngestResult[] = [];

	for (const item of available) {
		const result = await ingestTranscript(
			{ ticker: item.ticker, year: item.year, quarter: item.quarter, forceRefresh },
			companyId,
			provider,
			deps,
		);
		results.push(result);
	}

	return results;
}

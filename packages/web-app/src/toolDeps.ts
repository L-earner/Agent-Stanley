import type { FinanceToolDeps } from "@earendil-works/pi-research-agent";
import {
	InMemoryCompanyRepository,
	InMemoryEvidenceRepository,
	InMemoryFilingChunkRepository,
	InMemoryFilingRepository,
	InMemoryTranscriptChunkRepository,
	InMemoryTranscriptRepository,
	InMemoryXbrlFactRepository,
} from "@earendil-works/pi-research-db";
import { FilingDownloader, NinjasSecClient, XbrlIngestor } from "@earendil-works/pi-sec-ingestion";
import { NinjasTranscriptProvider } from "@earendil-works/pi-transcript-ingestion";

// In-memory stores survive for the lifetime of the server process.
// Replace with SQLite-backed repositories for persistence (Phase 12).
const companyRepo = new InMemoryCompanyRepository();
const filingRepo = new InMemoryFilingRepository();
const chunkRepo = new InMemoryFilingChunkRepository();
const xbrlRepo = new InMemoryXbrlFactRepository();
const evidenceRepo = new InMemoryEvidenceRepository();
const transcriptRepo = new InMemoryTranscriptRepository();
const transcriptChunkRepo = new InMemoryTranscriptChunkRepository();

/**
 * Build the full FinanceToolDeps from environment variables.
 *
 * Required env vars:
 *   API_NINJAS_KEY   — API Ninjas key for SEC filings and transcripts
 *   SEC_USER_AGENT   — "AppName contact@example.com" for EDGAR requests
 */
export function buildToolDeps(): FinanceToolDeps {
	const apiKey = process.env.API_NINJAS_KEY ?? "";
	const userAgent = process.env.SEC_USER_AGENT ?? "pi-research-agent contact@example.com";

	return {
		companyRepo,
		filingRepo,
		chunkRepo,
		xbrlRepo,
		evidenceRepo,
		transcriptRepo,
		transcriptChunkRepo,
		ninjasClient: new NinjasSecClient({ apiKey }),
		downloader: new FilingDownloader({ userAgent }),
		xbrlIngestor: new XbrlIngestor({ userAgent }),
		transcriptProvider: new NinjasTranscriptProvider({ apiKey }),
		embeddingProvider: null,
	};
}

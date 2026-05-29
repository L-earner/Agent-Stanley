import type {
	CompanyRepository,
	EmbeddingProvider,
	EvidenceRepository,
	FilingChunkRepository,
	FilingRepository,
	TranscriptChunkRepository,
	TranscriptRepository,
	XbrlFactRepository,
} from "@earendil-works/pi-research-db";
import type { FilingDownloader, NinjasSecClient, XbrlIngestor } from "@earendil-works/pi-sec-ingestion";
import type { TranscriptProvider } from "@earendil-works/pi-transcript-ingestion";

/**
 * Dependencies injected into every finance tool.
 * Isolates tool business logic from infrastructure — easy to swap for tests.
 */
export type FinanceToolDeps = {
	companyRepo: CompanyRepository;
	filingRepo: FilingRepository;
	chunkRepo: FilingChunkRepository;
	xbrlRepo: XbrlFactRepository;
	evidenceRepo: EvidenceRepository;
	transcriptRepo: TranscriptRepository;
	transcriptChunkRepo: TranscriptChunkRepository;
	ninjasClient: NinjasSecClient;
	downloader: FilingDownloader;
	xbrlIngestor: XbrlIngestor;
	transcriptProvider: TranscriptProvider;
	/** Null disables vector search; falls back to lexical-only hybrid search. */
	embeddingProvider: EmbeddingProvider | null;
};

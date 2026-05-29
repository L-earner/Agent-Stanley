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

export function buildToolDeps(): FinanceToolDeps {
	const apiKey = process.env.API_NINJAS_KEY ?? "";
	const userAgent = process.env.SEC_USER_AGENT ?? "pi-research-tui contact@example.com";

	return {
		companyRepo: new InMemoryCompanyRepository(),
		filingRepo: new InMemoryFilingRepository(),
		chunkRepo: new InMemoryFilingChunkRepository(),
		xbrlRepo: new InMemoryXbrlFactRepository(),
		evidenceRepo: new InMemoryEvidenceRepository(),
		transcriptRepo: new InMemoryTranscriptRepository(),
		transcriptChunkRepo: new InMemoryTranscriptChunkRepository(),
		ninjasClient: new NinjasSecClient({ apiKey }),
		downloader: new FilingDownloader({ userAgent }),
		xbrlIngestor: new XbrlIngestor({ userAgent }),
		transcriptProvider: new NinjasTranscriptProvider({ apiKey }),
		embeddingProvider: null,
	};
}

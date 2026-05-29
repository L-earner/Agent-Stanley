// ---------------------------------------------------------------------------
// TranscriptProvider interface and shared types
// ---------------------------------------------------------------------------

export type TranscriptSearchQuery = {
	ticker?: string;
	cik?: string;
	date?: string;
	startDate?: string;
	endDate?: string;
	limit?: number;
	offset?: number;
};

export type TranscriptSearchResult = {
	ticker: string;
	year: number;
	quarter: number; // 1–4
	date: string; // YYYY-MM-DD
};

/** One speaker turn from the premium transcript_split field. */
export type TranscriptSpeakerTurn = {
	speaker: string;
	company?: string;
	role?: string;
	text: string;
	speakerType: "management" | "investor" | "operator";
	isQa: boolean;
	sentiment?: number;
};

export type RawTranscript = {
	date: string; // YYYY-MM-DD
	timestamp: number;
	ticker: string;
	cik?: string;
	year: number;
	quarter: number;
	earningsTiming?: "before_market" | "during_market" | "after_market";
	/** Full transcript as a single string — always present. */
	transcript: string;
	/** Structured per-speaker splits — present for premium API tier subscribers only. */
	transcriptSplit?: TranscriptSpeakerTurn[];
};

/**
 * Abstraction over earnings transcript data sources.
 *
 * Implementations:
 *   - NinjasTranscriptProvider  — live API Ninjas /v1/earningstranscript endpoints
 *   - FixtureTranscriptProvider — static JSON for tests (never makes network calls)
 */
export interface TranscriptProvider {
	readonly providerName: string;
	searchTranscripts(query: TranscriptSearchQuery): Promise<TranscriptSearchResult[]>;
	fetchTranscript(ticker: string, year: number, quarter: number): Promise<RawTranscript>;
}

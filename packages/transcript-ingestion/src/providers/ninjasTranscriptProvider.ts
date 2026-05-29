import type {
	RawTranscript,
	TranscriptProvider,
	TranscriptSearchQuery,
	TranscriptSearchResult,
	TranscriptSpeakerTurn,
} from "../TranscriptProvider.ts";

// ---------------------------------------------------------------------------
// Raw API shapes (snake_case from API Ninjas)
// ---------------------------------------------------------------------------

type NinjasSearchItem = {
	ticker: string;
	year: string;
	quarter: string;
	date: string;
};

type NinjasSpeakerTurn = {
	speaker: string;
	company?: string;
	role?: string;
	text: string;
	speaker_type: "management" | "investor" | "operator";
	is_qa: boolean;
	sentiment?: number;
	sentiment_rationale?: string;
};

type NinjasTranscriptResponse = {
	date: string;
	timestamp: number;
	ticker: string;
	cik?: string;
	year: number | string;
	quarter: number | string;
	earnings_timing?: string;
	transcript: string;
	transcript_split?: NinjasSpeakerTurn[];
};

// ---------------------------------------------------------------------------
// Provider config
// ---------------------------------------------------------------------------

export type NinjasTranscriptConfig = {
	/** Reads API_NINJAS_KEY env var if not provided. */
	apiKey?: string;
	baseUrl?: string;
	fetch?: typeof fetch;
};

export function getNinjasApiKey(): string {
	const key = process.env.API_NINJAS_KEY;
	if (!key) throw new Error("API_NINJAS_KEY env var is required");
	return key;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class NinjasTranscriptProvider implements TranscriptProvider {
	readonly providerName = "api_ninjas";
	private readonly apiKey: string;
	private readonly baseUrl: string;
	private readonly fetch: typeof fetch;

	constructor(config: NinjasTranscriptConfig = {}) {
		this.apiKey = config.apiKey ?? getNinjasApiKey();
		this.baseUrl = config.baseUrl ?? "https://api.api-ninjas.com";
		this.fetch = config.fetch ?? globalThis.fetch;
	}

	async searchTranscripts(query: TranscriptSearchQuery): Promise<TranscriptSearchResult[]> {
		const params = new URLSearchParams();
		if (query.ticker) params.set("ticker", query.ticker);
		if (query.cik) params.set("cik", query.cik);
		if (query.date) params.set("date", query.date);
		if (query.startDate) params.set("start_date", query.startDate);
		if (query.endDate) params.set("end_date", query.endDate);
		if (query.limit != null) params.set("limit", String(query.limit));
		if (query.offset != null) params.set("offset", String(query.offset));

		const url = `${this.baseUrl}/v1/earningstranscriptsearch?${params}`;
		const response = await this.fetch(url, {
			headers: { "X-Api-Key": this.apiKey },
		});

		if (!response.ok) {
			throw new Error(`Transcript search failed: ${response.status} ${url}`);
		}

		const items = (await response.json()) as NinjasSearchItem[];
		return items.map((item) => ({
			ticker: item.ticker,
			year: Number(item.year),
			quarter: Number(item.quarter),
			date: item.date,
		}));
	}

	async fetchTranscript(ticker: string, year: number, quarter: number): Promise<RawTranscript> {
		const params = new URLSearchParams({ ticker, year: String(year), quarter: String(quarter) });
		const url = `${this.baseUrl}/v1/earningstranscript?${params}`;
		const response = await this.fetch(url, {
			headers: { "X-Api-Key": this.apiKey },
		});

		if (!response.ok) {
			throw new Error(`Transcript fetch failed: ${response.status} ${url}`);
		}

		const raw = (await response.json()) as NinjasTranscriptResponse;
		return normalizeTranscriptResponse(raw);
	}
}

function normalizeTranscriptResponse(raw: NinjasTranscriptResponse): RawTranscript {
	const transcriptSplit: TranscriptSpeakerTurn[] | undefined = raw.transcript_split?.map((t) => ({
		speaker: t.speaker,
		company: t.company,
		role: t.role,
		text: t.text,
		speakerType: t.speaker_type,
		isQa: t.is_qa,
		sentiment: t.sentiment,
	}));

	return {
		date: raw.date,
		timestamp: raw.timestamp,
		ticker: raw.ticker,
		cik: raw.cik,
		year: Number(raw.year),
		quarter: Number(raw.quarter),
		earningsTiming: raw.earnings_timing as RawTranscript["earningsTiming"],
		transcript: raw.transcript,
		transcriptSplit,
	};
}

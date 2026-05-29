import type { RateLimiter } from "./rateLimiter.ts";

export type NinjasFilingResult = {
	ticker: string;
	filing_date: string; // YYYY-MM-DD
	filing_url: string; // Direct URL to the primary filing document on SEC
	form_type: string;
};

export type SupportedFormType = "10-K" | "10-Q" | "8-K" | "S-1" | "S-3" | "DEF14A" | "13D";

export type SearchFilingsOptions = {
	/** Start date filter — YYYY-MM-DD. Premium API feature. */
	start?: string;
	/** End date filter — YYYY-MM-DD. Premium API feature. */
	end?: string;
	/** Max results (1–100). Default: 2 without premium. Premium API feature. */
	limit?: number;
};

export type NinjasClientConfig = {
	/**
	 * API Ninjas key. Do NOT hard-code — pass via process.env.API_NINJAS_KEY.
	 * Throws at construction time if omitted.
	 */
	apiKey: string;
	/** Override for tests. Defaults to https://api.api-ninjas.com */
	baseUrl?: string;
	/** Injected fetch function. Defaults to global fetch. Useful for testing. */
	fetch?: typeof fetch;
	/** Optional shared rate limiter. */
	rateLimiter?: RateLimiter;
};

export class NinjasSecClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly fetchFn: typeof fetch;
	private readonly rateLimiter?: RateLimiter;

	constructor(config: NinjasClientConfig) {
		if (!config.apiKey) throw new Error("NinjasSecClient: apiKey is required. Set API_NINJAS_KEY env var.");
		this.apiKey = config.apiKey;
		this.baseUrl = (config.baseUrl ?? "https://api.api-ninjas.com").replace(/\/$/, "");
		this.fetchFn = config.fetch ?? globalThis.fetch;
		this.rateLimiter = config.rateLimiter;
	}

	/**
	 * Search SEC filings by ticker and form type.
	 *
	 * Returns up to 2 results on a free plan; use start/end/limit with a premium key.
	 */
	async searchFilings(
		ticker: string,
		formType: SupportedFormType | string,
		options: SearchFilingsOptions = {},
	): Promise<NinjasFilingResult[]> {
		await this.rateLimiter?.throttle();

		const params = new URLSearchParams({ ticker: ticker.toUpperCase(), filing: formType });
		if (options.start) params.set("start", options.start);
		if (options.end) params.set("end", options.end);
		if (options.limit != null) params.set("limit", String(options.limit));

		const url = `${this.baseUrl}/v1/sec?${params.toString()}`;
		const response = await this.fetchFn(url, {
			headers: { "X-Api-Key": this.apiKey },
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`NinjasSecClient: HTTP ${response.status} for ${ticker}/${formType} — ${body}`);
		}

		const data = await response.json();
		if (!Array.isArray(data)) {
			throw new Error(`NinjasSecClient: unexpected response shape for ${ticker}/${formType}`);
		}

		return data as NinjasFilingResult[];
	}
}

/** Read the API key from the environment. Throws if not set. */
export function getNinjasApiKey(): string {
	const key = process.env.API_NINJAS_KEY;
	if (!key) throw new Error("API_NINJAS_KEY environment variable is not set.");
	return key;
}

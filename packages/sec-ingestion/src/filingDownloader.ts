import type { RateLimiter } from "./rateLimiter.ts";

export type FilingDownloaderConfig = {
	/**
	 * Required by SEC fair-access policy: identify your app and provide contact info.
	 * Example: "FinanceResearchApp contact@example.com"
	 * Throws at construction time if omitted in production mode.
	 */
	userAgent: string;
	/** Injected fetch function. Defaults to global fetch. */
	fetch?: typeof fetch;
	/** Shared rate limiter for SEC requests (max 10 req/sec per SEC policy). */
	rateLimiter?: RateLimiter;
	/** Request timeout in ms. Default: 30000. */
	timeoutMs?: number;
};

export type DownloadResult = {
	url: string;
	content: string;
	contentType: string;
};

export class FilingDownloader {
	private readonly userAgent: string;
	private readonly fetchFn: typeof fetch;
	private readonly rateLimiter?: RateLimiter;
	private readonly timeoutMs: number;

	constructor(config: FilingDownloaderConfig) {
		if (!config.userAgent?.trim()) {
			throw new Error(
				"FilingDownloader: userAgent is required. Set SEC_USER_AGENT env var (e.g. 'AppName contact@example.com').",
			);
		}
		this.userAgent = config.userAgent;
		this.fetchFn = config.fetch ?? globalThis.fetch;
		this.rateLimiter = config.rateLimiter;
		this.timeoutMs = config.timeoutMs ?? 30_000;
	}

	/**
	 * Download the content of a SEC filing document.
	 *
	 * The URL is typically the filing_url returned by the API Ninjas SEC endpoint,
	 * pointing to an HTML or text document on www.sec.gov.
	 */
	async download(url: string): Promise<DownloadResult> {
		await this.rateLimiter?.throttle();

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

		let response: Response;
		try {
			response = await this.fetchFn(url, {
				headers: {
					"User-Agent": this.userAgent,
					Accept: "text/html,application/xhtml+xml,text/plain",
				},
				signal: controller.signal,
			});
		} finally {
			clearTimeout(timeout);
		}

		if (!response.ok) {
			throw new Error(`FilingDownloader: HTTP ${response.status} for ${url}`);
		}

		const contentType = response.headers.get("content-type") ?? "text/html";
		const content = await response.text();
		return { url, content, contentType };
	}
}

/** Read SEC_USER_AGENT from environment. Throws if not set. */
export function getSecUserAgent(): string {
	const ua = process.env.SEC_USER_AGENT;
	if (!ua) throw new Error("SEC_USER_AGENT environment variable is not set.");
	return ua;
}

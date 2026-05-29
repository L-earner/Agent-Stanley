import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { companyFactsUrl, extractCikFromUrl, normalizeCik, submissionsUrl } from "../src/cikUtils.ts";
import { FilingDownloader } from "../src/filingDownloader.ts";
import { NinjasSecClient } from "../src/ninjasClient.ts";
import { RateLimiter } from "../src/rateLimiter.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function loadFixture(name: string): unknown {
	const path = join(__dirname, "../src/fixtures", name);
	return JSON.parse(readFileSync(path, "utf-8"));
}

function mockFetch(responseBody: unknown, status = 200): typeof fetch {
	return vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		headers: { get: (_: string) => "application/json" },
		json: async () => responseBody,
		text: async () => JSON.stringify(responseBody),
	}) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// RateLimiter
// ---------------------------------------------------------------------------

describe("RateLimiter", () => {
	it("allows requests up to the burst limit without delay", async () => {
		const limiter = new RateLimiter(5);
		const start = Date.now();
		await limiter.throttle();
		await limiter.throttle();
		await limiter.throttle();
		// All 3 fit within initial token bucket — should resolve immediately
		expect(Date.now() - start).toBeLessThan(50);
	});

	it("queues requests once tokens are exhausted", async () => {
		const limiter = new RateLimiter(2);
		// Drain all tokens
		await limiter.throttle();
		await limiter.throttle();
		// Third call queues
		const pending = limiter.throttle(); // does NOT await yet
		expect(limiter.pendingCount).toBe(1);
		// Let it resolve naturally — we don't need to wait in the test
		pending.then(() => {}); // prevent unhandled rejection
	});

	it("throws on invalid maxRequestsPerSecond", () => {
		expect(() => new RateLimiter(0)).toThrow();
		expect(() => new RateLimiter(-1)).toThrow();
	});
});

// ---------------------------------------------------------------------------
// CIK utilities
// ---------------------------------------------------------------------------

describe("normalizeCik", () => {
	it("pads short integers to 10 digits", () => {
		expect(normalizeCik(320193)).toBe("0000320193");
		expect(normalizeCik("320193")).toBe("0000320193");
	});

	it("leaves already-padded CIKs unchanged", () => {
		expect(normalizeCik("0000320193")).toBe("0000320193");
	});

	it("handles CIKs of various lengths", () => {
		expect(normalizeCik("1")).toBe("0000000001");
		expect(normalizeCik("1234567890")).toBe("1234567890");
	});
});

describe("extractCikFromUrl", () => {
	it("extracts CIK from EDGAR archive URL", () => {
		expect(
			extractCikFromUrl("https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm"),
		).toBe("0000320193");
	});

	it("extracts CIK from data.sec.gov submissions URL", () => {
		expect(extractCikFromUrl("https://data.sec.gov/submissions/CIK0000320193.json")).toBe("0000320193");
	});

	it("returns undefined for unrecognized URLs", () => {
		expect(extractCikFromUrl("https://example.com/foo")).toBeUndefined();
	});

	it("normalizes the extracted CIK", () => {
		// URL has CIK without leading zeros
		expect(extractCikFromUrl("https://www.sec.gov/Archives/edgar/data/320193/foo/bar.htm")).toBe("0000320193");
	});
});

describe("companyFactsUrl / submissionsUrl", () => {
	it("builds correct XBRL company facts URL", () => {
		expect(companyFactsUrl("320193")).toBe("https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json");
	});

	it("builds correct submissions URL", () => {
		expect(submissionsUrl("320193")).toBe("https://data.sec.gov/submissions/CIK0000320193.json");
	});
});

// ---------------------------------------------------------------------------
// NinjasSecClient
// ---------------------------------------------------------------------------

describe("NinjasSecClient", () => {
	it("throws on construction if apiKey is missing", () => {
		expect(() => new NinjasSecClient({ apiKey: "" })).toThrow("apiKey is required");
	});

	it("returns filing results from fixture response", async () => {
		const fixture = loadFixture("aapl-10k.json");
		const client = new NinjasSecClient({
			apiKey: "test-key",
			fetch: mockFetch(fixture),
		});

		const results = await client.searchFilings("AAPL", "10-K");

		expect(results).toHaveLength(2);
		expect(results[0].ticker).toBe("AAPL");
		expect(results[0].form_type).toBe("10-K");
		expect(results[0].filing_url).toContain("sec.gov");
		expect(results[0].filing_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("uppercases the ticker in the request", async () => {
		const mockFetchFn = mockFetch(loadFixture("aapl-10k.json"));
		const client = new NinjasSecClient({ apiKey: "test-key", fetch: mockFetchFn });

		await client.searchFilings("aapl", "10-K");

		const [calledUrl] = (mockFetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
		expect(calledUrl).toContain("ticker=AAPL");
	});

	it("includes X-Api-Key header", async () => {
		const mockFetchFn = mockFetch(loadFixture("aapl-10k.json"));
		const client = new NinjasSecClient({ apiKey: "my-secret-key", fetch: mockFetchFn });

		await client.searchFilings("AAPL", "10-K");

		const [, init] = (mockFetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
		expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("my-secret-key");
	});

	it("passes optional params to the query string", async () => {
		const mockFetchFn = mockFetch(loadFixture("aapl-10k.json"));
		const client = new NinjasSecClient({ apiKey: "test-key", fetch: mockFetchFn });

		await client.searchFilings("AAPL", "10-K", { start: "2023-01-01", end: "2024-01-01", limit: 5 });

		const [calledUrl] = (mockFetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
		expect(calledUrl).toContain("start=2023-01-01");
		expect(calledUrl).toContain("end=2024-01-01");
		expect(calledUrl).toContain("limit=5");
	});

	it("throws on non-OK HTTP response", async () => {
		const client = new NinjasSecClient({
			apiKey: "test-key",
			fetch: mockFetch({ message: "Unauthorized" }, 401),
		});
		await expect(client.searchFilings("AAPL", "10-K")).rejects.toThrow("HTTP 401");
	});

	it("throws if response is not an array", async () => {
		const client = new NinjasSecClient({
			apiKey: "test-key",
			fetch: mockFetch({ error: "bad shape" }),
		});
		await expect(client.searchFilings("AAPL", "10-K")).rejects.toThrow("unexpected response shape");
	});

	it("works with 10-Q fixture", async () => {
		const fixture = loadFixture("aapl-10q.json");
		const client = new NinjasSecClient({ apiKey: "test-key", fetch: mockFetch(fixture) });

		const results = await client.searchFilings("AAPL", "10-Q");

		expect(results).toHaveLength(2);
		expect(results[0].form_type).toBe("10-Q");
	});

	it("respects the rate limiter before making a request", async () => {
		const rateLimiter = new RateLimiter(10);
		const throttleSpy = vi.spyOn(rateLimiter, "throttle");

		const client = new NinjasSecClient({
			apiKey: "test-key",
			fetch: mockFetch(loadFixture("aapl-10k.json")),
			rateLimiter,
		});

		await client.searchFilings("AAPL", "10-K");
		expect(throttleSpy).toHaveBeenCalledOnce();
	});
});

// ---------------------------------------------------------------------------
// FilingDownloader
// ---------------------------------------------------------------------------

describe("FilingDownloader", () => {
	it("throws on construction if userAgent is missing", () => {
		expect(() => new FilingDownloader({ userAgent: "" })).toThrow("userAgent is required");
		expect(() => new FilingDownloader({ userAgent: "   " })).toThrow("userAgent is required");
	});

	it("downloads and returns filing content", async () => {
		const html = "<html><body>10-K content here</body></html>";
		const mockFetchFn = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			headers: { get: (_: string) => "text/html" },
			text: async () => html,
		});

		const downloader = new FilingDownloader({
			userAgent: "TestApp test@example.com",
			fetch: mockFetchFn as unknown as typeof fetch,
		});

		const result = await downloader.download(
			"https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm",
		);

		expect(result.content).toBe(html);
		expect(result.contentType).toBe("text/html");
	});

	it("sends User-Agent and Accept headers", async () => {
		const mockFetchFn = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			headers: { get: (_: string) => "text/html" },
			text: async () => "<html></html>",
		});

		const downloader = new FilingDownloader({
			userAgent: "FinanceApp admin@example.com",
			fetch: mockFetchFn as unknown as typeof fetch,
		});

		await downloader.download("https://www.sec.gov/Archives/edgar/data/320193/foo/bar.htm");

		const [, init] = (mockFetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
		const headers = init.headers as Record<string, string>;
		expect(headers["User-Agent"]).toBe("FinanceApp admin@example.com");
		expect(headers.Accept).toContain("text/html");
	});

	it("throws on non-OK HTTP status", async () => {
		const mockFetchFn = vi.fn().mockResolvedValue({
			ok: false,
			status: 404,
			headers: { get: () => null },
			text: async () => "Not Found",
		});

		const downloader = new FilingDownloader({
			userAgent: "TestApp test@example.com",
			fetch: mockFetchFn as unknown as typeof fetch,
		});

		await expect(
			downloader.download("https://www.sec.gov/Archives/edgar/data/320193/nonexistent.htm"),
		).rejects.toThrow("HTTP 404");
	});
});

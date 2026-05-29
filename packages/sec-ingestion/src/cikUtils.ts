/**
 * Utilities for working with SEC CIK numbers.
 *
 * CIKs appear in EDGAR URLs and API responses in various forms:
 *   - Raw integer: 320193
 *   - Zero-padded 10-digit string: "0000320193"
 *   - URL path segment: /Archives/edgar/data/320193/
 */

/** Pad a CIK to the canonical 10-digit zero-padded form. */
export function normalizeCik(cik: string | number): string {
	return String(cik).replace(/^0+/, "").padStart(10, "0");
}

/**
 * Extract CIK from a SEC EDGAR URL.
 *
 * Handles both archive URLs and data API URLs:
 *   https://www.sec.gov/Archives/edgar/data/320193/...
 *   https://data.sec.gov/submissions/CIK0000320193.json
 */
export function extractCikFromUrl(url: string): string | undefined {
	// Archive URL: /Archives/edgar/data/<cik>/
	const archiveMatch = url.match(/\/Archives\/edgar\/data\/(\d+)\//);
	if (archiveMatch) return normalizeCik(archiveMatch[1]);

	// Data API URL: /submissions/CIK<cik>.json
	const dataMatch = url.match(/\/submissions\/CIK(\d+)\.json/i);
	if (dataMatch) return normalizeCik(dataMatch[1]);

	return undefined;
}

/** Build the XBRL company-facts URL for a given CIK. */
export function companyFactsUrl(cik: string): string {
	return `https://data.sec.gov/api/xbrl/companyfacts/CIK${normalizeCik(cik)}.json`;
}

/** Build the EDGAR submissions URL for a given CIK. */
export function submissionsUrl(cik: string): string {
	return `https://data.sec.gov/submissions/CIK${normalizeCik(cik)}.json`;
}

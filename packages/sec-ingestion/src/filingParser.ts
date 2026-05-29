import { createHash } from "node:crypto";
import type { Filing } from "@earendil-works/pi-research-db";
import { extractCikFromUrl, normalizeCik } from "./cikUtils.ts";
import type { NinjasFilingResult } from "./ninjasClient.ts";

/**
 * Parse the accession number embedded in a SEC EDGAR archive URL.
 *
 * URL form: /Archives/edgar/data/<cik>/<accessionNoDashes>/filename
 * e.g. /Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm
 *
 * Accession format: XXXXXXXXXX-YY-ZZZZZZ
 *   X = 10-digit CIK
 *   Y = 2-digit year
 *   Z = 6-digit sequence
 */
export function parseAccessionNumber(url: string): { withDashes: string; withoutDashes: string } | undefined {
	const match = url.match(/\/Archives\/edgar\/data\/\d+\/(\d{18})\//);
	if (!match) return undefined;
	const raw = match[1]; // e.g. "000032019324000123"
	const withDashes = `${raw.slice(0, 10)}-${raw.slice(10, 12)}-${raw.slice(12)}`;
	return { withDashes, withoutDashes: raw };
}

/**
 * Derive a stable filing ID from accession number + form type.
 * Using a hash keeps IDs deterministic across re-ingestion runs.
 */
function filingId(accessionNoDashes: string, formType: string): string {
	return createHash("sha256").update(`${accessionNoDashes}:${formType}`).digest("hex").slice(0, 16);
}

/**
 * Derive companyId from CIK — stable across runs.
 */
export function companyIdFromCik(cik: string): string {
	return createHash("sha256")
		.update(`cik:${normalizeCik(cik)}`)
		.digest("hex")
		.slice(0, 16);
}

/**
 * Convert a NinjasFilingResult into a Filing row.
 * Returns undefined if the URL cannot be parsed (missing accession number or CIK).
 */
export function parseFilingResult(result: NinjasFilingResult): Filing | undefined {
	const cik = extractCikFromUrl(result.filing_url);
	if (!cik) return undefined;

	const accession = parseAccessionNumber(result.filing_url);
	if (!accession) return undefined;

	const companyId = companyIdFromCik(cik);
	const id = filingId(accession.withoutDashes, result.form_type);

	const now = new Date().toISOString();

	return {
		id,
		companyId,
		cik,
		accessionNumber: accession.withDashes,
		accessionNumberNoDashes: accession.withoutDashes,
		form: result.form_type as Filing["form"],
		filingDate: result.filing_date,
		primaryDocument: result.filing_url.split("/").pop(),
		primaryDocumentUrl: result.filing_url,
		createdAt: now,
		updatedAt: now,
	};
}

/** Convert multiple NinjasFilingResults, silently skipping unparseable entries. */
export function parseFilingResults(results: NinjasFilingResult[]): Filing[] {
	return results.flatMap((r) => {
		const f = parseFilingResult(r);
		return f ? [f] : [];
	});
}

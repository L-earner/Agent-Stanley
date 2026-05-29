import { createHash } from "node:crypto";
import type { SpeakerRole, Transcript, TranscriptChunk, TranscriptSection } from "@earendil-works/pi-research-db";
import type { RawTranscript, TranscriptSpeakerTurn } from "./TranscriptProvider.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN = 4;
const TARGET_CHARS = 700 * CHARS_PER_TOKEN; // ~2800 chars per chunk

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------

export function transcriptId(ticker: string, year: number, quarter: number): string {
	return createHash("sha256")
		.update(`transcript:${ticker.toUpperCase()}:${year}:${quarter}`)
		.digest("hex")
		.slice(0, 16);
}

function chunkId(tId: string, index: number): string {
	return createHash("sha256").update(`tc:${tId}:${index}`).digest("hex").slice(0, 16);
}

function textHash(text: string): string {
	return createHash("sha256").update(text, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Speaker role mapping
// ---------------------------------------------------------------------------

function mapSpeakerRole(speakerType: string, role?: string): SpeakerRole {
	if (speakerType === "operator") return "Operator";
	if (speakerType === "investor") return "Analyst";
	// management — check role string for CEO/CFO
	if (role) {
		const r = role.toLowerCase();
		if (r.includes("chief executive") || r.includes(" ceo") || r === "ceo") return "CEO";
		if (r.includes("chief financial") || r.includes(" cfo") || r === "cfo") return "CFO";
	}
	return "Other";
}

// ---------------------------------------------------------------------------
// Text splitting (sentence-boundary aware)
// ---------------------------------------------------------------------------

function splitText(text: string): string[] {
	if (text.length <= TARGET_CHARS) return [text.trim()].filter(Boolean);

	const parts: string[] = [];
	let pos = 0;
	while (pos < text.length) {
		const end = Math.min(pos + TARGET_CHARS, text.length);
		let splitAt = end;
		if (end < text.length) {
			const window = text.slice(Math.max(pos, end - 200), end);
			const sentenceBreak = window.lastIndexOf(". ");
			if (sentenceBreak > 0) splitAt = Math.max(pos, end - 200) + sentenceBreak + 1;
		}
		const part = text.slice(pos, splitAt).trim();
		if (part) parts.push(part);
		pos = splitAt;
	}
	return parts;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ParsedTranscript = {
	transcript: Omit<Transcript, "createdAt">;
	chunks: TranscriptChunk[];
};

/**
 * Convert a raw API Ninjas transcript response into typed Transcript + TranscriptChunk rows.
 *
 * Uses `transcript_split` (premium) for proper speaker segmentation when available.
 * Falls back to paragraph-based chunking on the plain `transcript` string.
 */
export function parseTranscript(raw: RawTranscript, companyId: string): ParsedTranscript {
	const id = transcriptId(raw.ticker, raw.year, raw.quarter);
	const fiscalPeriod = `Q${raw.quarter}`;

	const transcript: Omit<Transcript, "createdAt"> = {
		id,
		companyId,
		eventDate: raw.date,
		fiscalYear: raw.year,
		fiscalPeriod,
		title: `${raw.ticker.toUpperCase()} Q${raw.quarter} ${raw.year} Earnings Call`,
		provider: "api_ninjas",
		licenseNotes: "API Ninjas /v1/earningstranscript — verify storage rights before production use",
	};

	const chunks =
		raw.transcriptSplit && raw.transcriptSplit.length > 0
			? parseFromSplit(raw.transcriptSplit, id, companyId, raw.date, raw.year, fiscalPeriod)
			: parseFromRawText(raw.transcript, id, companyId, raw.date, raw.year, fiscalPeriod);

	return { transcript, chunks };
}

// ---------------------------------------------------------------------------
// Internal parsers
// ---------------------------------------------------------------------------

function parseFromSplit(
	turns: TranscriptSpeakerTurn[],
	tId: string,
	companyId: string,
	eventDate: string,
	fiscalYear: number,
	fiscalPeriod: string,
): TranscriptChunk[] {
	const chunks: TranscriptChunk[] = [];
	let index = 0;

	for (const turn of turns) {
		if (!turn.text.trim()) continue;

		const section: TranscriptSection = turn.isQa ? "qa" : "prepared_remarks";
		const speakerRole = mapSpeakerRole(turn.speakerType, turn.role);

		for (const part of splitText(turn.text)) {
			chunks.push({
				id: chunkId(tId, index++),
				transcriptId: tId,
				companyId,
				eventDate,
				fiscalYear,
				fiscalPeriod,
				section,
				speaker: turn.speaker,
				speakerRole,
				text: part,
				textHash: textHash(part),
				sourceLocator: `${turn.speaker} — ${section}`,
			});
		}
	}

	return chunks;
}

function parseFromRawText(
	text: string,
	tId: string,
	companyId: string,
	eventDate: string,
	fiscalYear: number,
	fiscalPeriod: string,
): TranscriptChunk[] {
	const chunks: TranscriptChunk[] = [];
	let index = 0;

	const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 50);

	for (const para of paragraphs) {
		for (const part of splitText(para.trim())) {
			chunks.push({
				id: chunkId(tId, index++),
				transcriptId: tId,
				companyId,
				eventDate,
				fiscalYear,
				fiscalPeriod,
				section: "unknown",
				text: part,
				textHash: textHash(part),
			});
		}
	}

	return chunks;
}

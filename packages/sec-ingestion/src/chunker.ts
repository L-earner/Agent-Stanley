import { createHash } from "node:crypto";

// 1 token ≈ 4 characters (reasonable approximation for financial prose)
const CHARS_PER_TOKEN = 4;

export type ChunkConfig = {
	targetTokens?: number; // default 700
	overlapTokens?: number; // default 100
	minTokens?: number; // default 100 — tiny tail threshold for merging
};

export type TextChunk = {
	text: string;
	textHash: string;
	tokenCount: number; // estimated
	charStart: number;
	charEnd: number;
};

/**
 * Split text into overlapping chunks of approximately targetTokens each.
 *
 * Chunks respect sentence boundaries where possible (splits on ". " or "\n").
 * Each chunk includes a SHA-256 hash for deduplication.
 * Short tails (< minTokens) are absorbed into the previous chunk instead of
 * being emitted as tiny separate chunks.
 */
export function chunkText(text: string, config: ChunkConfig = {}): TextChunk[] {
	const targetChars = (config.targetTokens ?? 700) * CHARS_PER_TOKEN;
	const overlapChars = (config.overlapTokens ?? 100) * CHARS_PER_TOKEN;
	const minTailChars = (config.minTokens ?? 100) * CHARS_PER_TOKEN;
	// Always advance by at least 1 char to prevent infinite loops
	const advance = Math.max(targetChars - overlapChars, 1);

	const chunks: TextChunk[] = [];
	let pos = 0;

	while (pos < text.length) {
		const end = Math.min(pos + targetChars, text.length);

		// Try to break at a sentence boundary near the end of the window
		let splitAt = end;
		if (end < text.length) {
			const searchFrom = Math.max(pos, end - 200);
			const window = text.slice(searchFrom, end);
			const sentenceBreak = window.lastIndexOf(". ");
			const lineBreak = window.lastIndexOf("\n");
			const bestBreak = Math.max(sentenceBreak, lineBreak);
			if (bestBreak > 0) {
				splitAt = searchFrom + bestBreak + 1;
			}
		}

		const chunkText = text.slice(pos, splitAt).trim();

		if (chunkText.length > 0) {
			chunks.push({
				text: chunkText,
				textHash: sha256(chunkText),
				tokenCount: Math.ceil(chunkText.length / CHARS_PER_TOKEN),
				charStart: pos,
				charEnd: splitAt,
			});
		}

		pos += advance;

		// Absorb a tiny tail into the last chunk instead of creating a near-empty chunk
		if (pos < text.length && text.length - pos < minTailChars) {
			const tail = text.slice(pos).trim();
			if (tail.length > 0 && chunks.length > 0) {
				const last = chunks[chunks.length - 1];
				const merged = `${last.text}\n${tail}`.trim();
				chunks[chunks.length - 1] = {
					text: merged,
					textHash: sha256(merged),
					tokenCount: Math.ceil(merged.length / CHARS_PER_TOKEN),
					charStart: last.charStart,
					charEnd: text.length,
				};
			}
			break;
		}
	}

	return chunks;
}

function sha256(text: string): string {
	return createHash("sha256").update(text, "utf8").digest("hex");
}

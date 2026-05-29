/**
 * Converts SEC filing HTML to clean plain text suitable for sectionizing and chunking.
 *
 * SEC filings contain inline XBRL, nested tables, CSS, and JavaScript.
 * This cleaner preserves text structure while stripping all markup.
 */

const HTML_ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&#39;": "'",
	"&apos;": "'",
	"&nbsp;": " ",
	"&ndash;": "–",
	"&mdash;": "—",
	"&ldquo;": '"',
	"&rdquo;": '"',
	"&lsquo;": "'",
	"&rsquo;": "'",
	"&#160;": " ",
	"&#8211;": "–",
	"&#8212;": "—",
	"&#8220;": '"',
	"&#8221;": '"',
};

/** Replace known HTML entities with their text equivalents. */
function decodeEntities(text: string): string {
	// Named entities
	let result = text.replace(/&[a-zA-Z]+;/g, (m) => HTML_ENTITIES[m] ?? m);
	// Decimal numeric entities e.g. &#160;
	result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
	// Hex numeric entities e.g. &#x00A0;
	result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
	return result;
}

export type CleanHtmlOptions = {
	/** Minimum non-empty line length to keep. Filters page numbers and artefacts. Default: 3 */
	minLineLength?: number;
};

/**
 * Strip SEC filing HTML to plain text.
 *
 * Steps:
 * 1. Remove <script>, <style>, and <head> blocks entirely.
 * 2. Insert newlines at block-level boundaries so paragraphs are preserved.
 * 3. Strip all remaining tags.
 * 4. Decode HTML entities.
 * 5. Normalize whitespace.
 */
export function cleanHtml(html: string, options: CleanHtmlOptions = {}): string {
	const minLen = options.minLineLength ?? 3;

	let text = html;

	// 1. Drop entire <script>, <style>, <head> blocks
	text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
	text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
	text = text.replace(/<head[\s\S]*?<\/head>/gi, " ");

	// 2. Block-level tags → newline (preserves paragraph structure)
	text = text.replace(/<\/(p|div|tr|li|h[1-6]|section|article|header|footer|blockquote)>/gi, "\n");
	text = text.replace(/<(br|hr)\s*\/?>/gi, "\n");
	text = text.replace(/<\/td>/gi, " | ");
	text = text.replace(/<\/th>/gi, " | ");

	// 3. Strip all remaining tags (including inline XBRL: ix:nonfraction, ix:nontextual, etc.)
	text = text.replace(/<[^>]+>/g, " ");

	// 4. Decode entities
	text = decodeEntities(text);

	// 5. Normalize whitespace within lines, then collapse excessive blank lines
	const lines = text.split("\n");
	const cleaned: string[] = [];
	let blankCount = 0;

	for (const raw of lines) {
		const line = raw.replace(/\s+/g, " ").trim();
		if (line.length === 0) {
			blankCount++;
			if (blankCount <= 2) cleaned.push("");
		} else if (line.length >= minLen) {
			blankCount = 0;
			cleaned.push(line);
		}
	}

	return cleaned.join("\n").trim();
}

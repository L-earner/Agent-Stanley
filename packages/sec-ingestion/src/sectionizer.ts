import type { FilingSection, SectionType } from "@earendil-works/pi-research-db";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type SectionPattern = {
	regex: RegExp;
	sectionType: SectionType;
	itemLabel: string;
};

export type SectionizerDiagnostics = {
	totalMatches: number;
	tocSkipped: number;
	sectionsExtracted: number;
	missingSections: string[];
};

export type SectionizeResult = {
	sections: Omit<FilingSection, "id">[];
	diagnostics: SectionizerDiagnostics;
};

// Minimum character length for a section body to be considered real content
// (not a table-of-contents entry, which is just the heading with no body).
const MIN_SECTION_CHARS = 500;

// ---------------------------------------------------------------------------
// Core sectionizer
// ---------------------------------------------------------------------------

/**
 * Split plain text into named sections by matching heading patterns.
 *
 * Strategy:
 * 1. Find every occurrence of every pattern in the text.
 * 2. Sort matches by position.
 * 3. Slice content between consecutive matches.
 * 4. Discard slices shorter than MIN_SECTION_CHARS (TOC entries).
 * 5. For duplicate item labels, keep the entry with the most content.
 */
function sectionizeText(text: string, filingId: string, patterns: SectionPattern[]): SectionizeResult {
	type Match = { pos: number; pattern: SectionPattern };

	// Collect all matches across all patterns
	const allMatches: Match[] = [];
	for (const pattern of patterns) {
		const re = new RegExp(pattern.regex.source, "gi");
		let m = re.exec(text);
		while (m !== null) {
			allMatches.push({ pos: m.index, pattern });
			m = re.exec(text);
		}
	}

	if (allMatches.length === 0) {
		return {
			sections: [],
			diagnostics: {
				totalMatches: 0,
				tocSkipped: 0,
				sectionsExtracted: 0,
				missingSections: patterns.map((p) => p.itemLabel),
			},
		};
	}

	// Sort by position in document
	allMatches.sort((a, b) => a.pos - b.pos);

	// Slice content windows
	type Candidate = { pattern: SectionPattern; body: string; pos: number };
	const candidates: Candidate[] = [];

	for (let i = 0; i < allMatches.length; i++) {
		const start = allMatches[i].pos;
		const end = i + 1 < allMatches.length ? allMatches[i + 1].pos : text.length;
		const body = text.slice(start, end).trim();
		candidates.push({ pattern: allMatches[i].pattern, body, pos: start });
	}

	// Dedup: for each label, keep the candidate with the most body content.
	// Short candidates (< MIN_SECTION_CHARS) are TOC entries — skip them unless
	// no real section is found for that label.
	const byLabel = new Map<string, Candidate[]>();
	for (const c of candidates) {
		const key = c.pattern.itemLabel;
		if (!byLabel.has(key)) byLabel.set(key, []);
		byLabel.get(key)!.push(c);
	}

	let tocSkipped = 0;
	const sections: Omit<FilingSection, "id">[] = [];
	const foundLabels = new Set<string>();

	for (const [label, group] of byLabel.entries()) {
		// Prefer the candidate with the longest body that meets the threshold
		const real = group
			.filter((c) => c.body.length >= MIN_SECTION_CHARS)
			.sort((a, b) => b.body.length - a.body.length)[0];

		tocSkipped += group.filter((c) => c.body.length < MIN_SECTION_CHARS).length;

		if (!real) continue;

		// Strip the heading line from the body text
		const bodyLines = real.body.split("\n");
		const textBody = bodyLines.slice(1).join("\n").trim();

		sections.push({
			filingId,
			sectionType: real.pattern.sectionType,
			itemLabel: label,
			title: bodyLines[0].replace(/[.\s]+$/, "").trim(),
			text: textBody || real.body,
			charStart: real.pos,
			charEnd: real.pos + real.body.length,
		});
		foundLabels.add(label);
	}

	const missingSections = patterns.filter((p) => !foundLabels.has(p.itemLabel)).map((p) => p.itemLabel);

	return {
		sections: sections.sort((a, b) => (a.charStart ?? 0) - (b.charStart ?? 0)),
		diagnostics: {
			totalMatches: allMatches.length,
			tocSkipped,
			sectionsExtracted: sections.length,
			missingSections,
		},
	};
}

// ---------------------------------------------------------------------------
// 10-K patterns
//
// Patterns use (?:^|\n)\s* to require item headings at the start of a line.
// This prevents matching inline references like "see Item 1 of this Form 10-K".
// ---------------------------------------------------------------------------

const PATTERNS_10K: SectionPattern[] = [
	{
		regex: /(?:^|\n)\s*item\s+1(?!\s*[aAbBcC])[.\s]/,
		sectionType: "business",
		itemLabel: "Item 1",
	},
	{
		regex: /(?:^|\n)\s*item\s+1a[.\s]/i,
		sectionType: "risk_factors",
		itemLabel: "Item 1A",
	},
	{
		regex: /(?:^|\n)\s*item\s+1b[.\s]/i,
		sectionType: "other",
		itemLabel: "Item 1B",
	},
	{
		regex: /(?:^|\n)\s*item\s+2[.\s]/i,
		sectionType: "other",
		itemLabel: "Item 2",
	},
	{
		regex: /(?:^|\n)\s*item\s+3[.\s]/i,
		sectionType: "legal_proceedings",
		itemLabel: "Item 3",
	},
	{
		regex: /(?:^|\n)\s*item\s+7(?!\s*[aA])[.\s]/,
		sectionType: "mda",
		itemLabel: "Item 7",
	},
	{
		regex: /(?:^|\n)\s*item\s+7a[.\s]/i,
		sectionType: "market_risk",
		itemLabel: "Item 7A",
	},
	{
		regex: /(?:^|\n)\s*item\s+8[.\s]/i,
		sectionType: "financial_statements",
		itemLabel: "Item 8",
	},
	{
		regex: /(?:^|\n)\s*item\s+9a[.\s]/i,
		sectionType: "controls_and_procedures",
		itemLabel: "Item 9A",
	},
];

export function sectionize10K(text: string, filingId: string): SectionizeResult {
	return sectionizeText(text, filingId, PATTERNS_10K);
}

// ---------------------------------------------------------------------------
// 10-Q patterns
// ---------------------------------------------------------------------------
// 10-Q structure:
//   Part I  Item 1  Financial Statements
//   Part I  Item 2  MD&A
//   Part I  Item 3  Market Risk
//   Part I  Item 4  Controls and Procedures
//   Part II Item 1  Legal Proceedings
//   Part II Item 1A Risk Factors
//
// "Item 1" means different things in Part I vs Part II, so we split on
// "PART I" / "PART II" first, then apply item patterns to each half.

const PATTERNS_10Q_PART1: SectionPattern[] = [
	{
		regex: /(?:^|\n)\s*item\s+1(?!\s*[aAbBcC])[.\s]/,
		sectionType: "financial_statements",
		itemLabel: "Part I Item 1",
	},
	{
		regex: /(?:^|\n)\s*item\s+2[.\s]/i,
		sectionType: "mda",
		itemLabel: "Part I Item 2",
	},
	{
		regex: /(?:^|\n)\s*item\s+3[.\s]/i,
		sectionType: "market_risk",
		itemLabel: "Part I Item 3",
	},
	{
		regex: /(?:^|\n)\s*item\s+4[.\s]/i,
		sectionType: "controls_and_procedures",
		itemLabel: "Part I Item 4",
	},
];

const PATTERNS_10Q_PART2: SectionPattern[] = [
	{
		regex: /(?:^|\n)\s*item\s+1(?!\s*[aAbBcC])[.\s]/,
		sectionType: "legal_proceedings",
		itemLabel: "Part II Item 1",
	},
	{
		regex: /(?:^|\n)\s*item\s+1a[.\s]/i,
		sectionType: "risk_factors",
		itemLabel: "Part II Item 1A",
	},
];

export function sectionize10Q(text: string, filingId: string): SectionizeResult {
	// Find the ACTUAL Part II heading — skip the first occurrence which is typically
	// the table-of-contents entry. Collect all positions and use the second one.
	const part2Positions: number[] = [];
	const re = /\bpart\s+ii\b/gi;
	let m = re.exec(text);
	while (m !== null) {
		part2Positions.push(m.index);
		m = re.exec(text);
	}
	// First occurrence is usually the TOC entry; second is the actual heading.
	// If only one occurrence exists, use it.
	const part2Match = part2Positions.length >= 2 ? part2Positions[1] : (part2Positions[0] ?? -1);

	let part1Text: string;
	let part2Text: string;
	let part2Offset: number;

	if (part2Match > 0) {
		part1Text = text.slice(0, part2Match);
		part2Text = text.slice(part2Match);
		part2Offset = part2Match;
	} else {
		// No explicit Part II — treat everything as Part I
		part1Text = text;
		part2Text = "";
		part2Offset = 0;
	}

	const result1 = sectionizeText(part1Text, filingId, PATTERNS_10Q_PART1);

	let result2: SectionizeResult = {
		sections: [],
		diagnostics: { totalMatches: 0, tocSkipped: 0, sectionsExtracted: 0, missingSections: [] },
	};

	if (part2Text) {
		const raw2 = sectionizeText(part2Text, filingId, PATTERNS_10Q_PART2);
		// Adjust charStart/charEnd offsets to be relative to the full document
		result2 = {
			...raw2,
			sections: raw2.sections.map((s) => ({
				...s,
				charStart: s.charStart != null ? s.charStart + part2Offset : undefined,
				charEnd: s.charEnd != null ? s.charEnd + part2Offset : undefined,
			})),
		};
	}

	return {
		sections: [...result1.sections, ...result2.sections],
		diagnostics: {
			totalMatches: result1.diagnostics.totalMatches + result2.diagnostics.totalMatches,
			tocSkipped: result1.diagnostics.tocSkipped + result2.diagnostics.tocSkipped,
			sectionsExtracted: result1.diagnostics.sectionsExtracted + result2.diagnostics.sectionsExtracted,
			missingSections: [...result1.diagnostics.missingSections, ...result2.diagnostics.missingSections],
		},
	};
}

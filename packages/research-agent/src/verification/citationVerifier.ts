import type { AnalystAnswer } from "../types/AgentAnswer.ts";

export type CitationVerificationResult = {
	supported: boolean;
	warnings: string[];
};

/**
 * Verify that every evidenceId referenced in keyPoints and tables appears in sources.
 * Orphaned IDs (cited but not listed) mean a claim cannot be traced to a source.
 */
export function verifyCitations(answer: AnalystAnswer): CitationVerificationResult {
	const sourceIds = new Set(answer.sources.map((s) => s.evidenceId));
	const warnings: string[] = [];

	for (const kp of answer.keyPoints) {
		for (const id of kp.evidenceIds) {
			if (!sourceIds.has(id)) {
				const snippet = kp.claim.length > 60 ? `${kp.claim.slice(0, 60)}…` : kp.claim;
				warnings.push(`Claim "${snippet}" cites evidenceId "${id}" which has no matching source entry.`);
			}
		}
	}

	for (const table of answer.tables ?? []) {
		for (const id of table.evidenceIds) {
			if (!sourceIds.has(id)) {
				warnings.push(`Table "${table.title}" cites evidenceId "${id}" which has no matching source entry.`);
			}
		}
	}

	return { supported: warnings.length === 0, warnings };
}

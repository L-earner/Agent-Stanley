import type { SubmitAnswerParams } from "./tools/submitAnswerTool.ts";
import type { AnalystAnswer } from "./types/AgentAnswer.ts";

/**
 * Collect all evidenceIds referenced in an answer (from keyPoints, tables, and sources).
 * Returns a deduplicated list.
 */
export function collectEvidenceIds(answer: AnalystAnswer): string[] {
	const ids = new Set<string>();
	for (const kp of answer.keyPoints) {
		for (const id of kp.evidenceIds) ids.add(id);
	}
	for (const table of answer.tables ?? []) {
		for (const id of table.evidenceIds) ids.add(id);
	}
	for (const src of answer.sources) {
		ids.add(src.evidenceId);
	}
	return [...ids];
}

/**
 * Check for orphaned evidence IDs: evidenceIds in keyPoints/tables that are not
 * listed in sources. Returns the set of missing IDs.
 */
export function findOrphanedEvidenceIds(answer: AnalystAnswer): string[] {
	const sourceIds = new Set(answer.sources.map((s) => s.evidenceId));
	const orphaned: string[] = [];
	for (const kp of answer.keyPoints) {
		for (const id of kp.evidenceIds) {
			if (!sourceIds.has(id)) orphaned.push(id);
		}
	}
	for (const table of answer.tables ?? []) {
		for (const id of table.evidenceIds) {
			if (!sourceIds.has(id)) orphaned.push(id);
		}
	}
	return [...new Set(orphaned)];
}

/**
 * Add a validation warning to an existing AnalystAnswer if any evidence IDs
 * in keyPoints are not backed by a matching source entry.
 *
 * Mutates the warnings array; does not re-run any verification.
 */
export function annotateOrphanedIds(answer: AnalystAnswer): AnalystAnswer {
	const orphaned = findOrphanedEvidenceIds(answer);
	if (orphaned.length === 0) return answer;
	return {
		...answer,
		verification: {
			...answer.verification,
			warnings: [
				...answer.verification.warnings,
				`${orphaned.length} evidence ID(s) cited in keyPoints have no matching source entry: ${orphaned.slice(0, 5).join(", ")}`,
			],
		},
	};
}

/**
 * Trim all text fields in a SubmitAnswerParams to prevent accidentally huge
 * answers from blowing token limits when stored.
 */
export function sanitizeSubmitParams(params: SubmitAnswerParams, maxAnswerChars = 8000): SubmitAnswerParams {
	return {
		...params,
		answer: params.answer.slice(0, maxAnswerChars),
		keyPoints: params.keyPoints.slice(0, 20),
		caveats: params.caveats.slice(0, 10),
		sources: params.sources.slice(0, 50),
	};
}

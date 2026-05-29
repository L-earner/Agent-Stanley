import type { AnalystAnswer } from "../types/AgentAnswer.ts";

export type UnsupportedClaimResult = {
	unsupportedClaims: string[];
};

/**
 * Identify keyPoint claims that carry no evidenceIds.
 * A claim with an empty evidenceIds array is unverifiable from the retrieved data.
 */
export function checkUnsupportedClaims(answer: AnalystAnswer): UnsupportedClaimResult {
	const unsupported = answer.keyPoints.filter((kp) => kp.evidenceIds.length === 0).map((kp) => kp.claim);
	return { unsupportedClaims: unsupported };
}

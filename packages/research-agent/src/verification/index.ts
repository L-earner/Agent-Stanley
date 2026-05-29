import type { AnalystAnswer } from "../types/AgentAnswer.ts";
import { verifyCitations } from "./citationVerifier.ts";
import { detectFinancialAdvice } from "./financialAdviceGuard.ts";
import { checkUnsupportedClaims } from "./unsupportedClaimChecker.ts";

export type { CitationVerificationResult } from "./citationVerifier.ts";
export { verifyCitations } from "./citationVerifier.ts";
export type { AdviceGuardResult } from "./financialAdviceGuard.ts";
export { detectFinancialAdvice } from "./financialAdviceGuard.ts";
export type { UnsupportedClaimResult } from "./unsupportedClaimChecker.ts";
export { checkUnsupportedClaims } from "./unsupportedClaimChecker.ts";

export type VerificationResult = {
	supported: boolean;
	warnings: string[];
};

/**
 * Run all verification checks on a fully-built AnalystAnswer.
 *
 * Three checks:
 *   1. Citation verifier — every evidenceId in keyPoints/tables must appear in sources.
 *   2. Unsupported claim checker — keyPoints with empty evidenceIds are flagged.
 *   3. Financial advice guard — buy/sell/hold recommendations in answer text are blocked.
 *
 * `supported: false` means the answer should not be shown to users without review.
 */
export function runVerification(answer: AnalystAnswer): VerificationResult {
	const warnings: string[] = [];

	// 1. Citation integrity
	const citation = verifyCitations(answer);
	warnings.push(...citation.warnings);

	// 2. Unsupported claims
	const { unsupportedClaims } = checkUnsupportedClaims(answer);
	for (const claim of unsupportedClaims) {
		const snippet = claim.length > 80 ? `${claim.slice(0, 80)}…` : claim;
		warnings.push(`Unsupported claim (no evidenceIds): "${snippet}"`);
	}

	// 3. Financial advice guard — scan answer text + all claim text together
	const scanTarget = [answer.answer, ...answer.keyPoints.map((kp) => kp.claim)].join(" ");
	const adviceResult = detectFinancialAdvice(scanTarget);
	if (adviceResult.isAdvice) {
		const phrases = adviceResult.matchedPhrases
			.slice(0, 3)
			.map((p) => `"${p}"`)
			.join(", ");
		warnings.push(
			`Financial advice language detected: ${phrases}. This system provides research, not personalized investment advice.`,
		);
	}

	const supported = !adviceResult.isAdvice && unsupportedClaims.length === 0 && citation.supported;
	return { supported, warnings };
}

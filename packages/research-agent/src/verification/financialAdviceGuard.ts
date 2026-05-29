export type AdviceGuardResult = {
	isAdvice: boolean;
	matchedPhrases: string[];
};

// Patterns that indicate personalized investment recommendations.
// Ordered from most specific to most general to minimise false positives.
const ADVICE_PATTERNS: RegExp[] = [
	/\byou should (?:buy|sell|hold|invest|purchase|divest)\b/i,
	/\bI (?:would )?recommend (?:buy|buying|sell|selling|hold|holding|invest|investing)\b/i,
	/\brecommend (?:buying|selling|holding)\b/i,
	/\bstrong (?:buy|sell)\b/i,
	/\b(?:buy|sell|hold) rating\b/i,
	/\brated (?:a )?(?:buy|sell|hold)\b/i,
	/\btime to (?:buy|sell|invest)\b/i,
	/\badd (?:this|it) to your portfolio\b/i,
	/\bfor your (?:investment )?portfolio\b/i,
	/\b(?:this|the stock|this stock) is a (?:buy|sell|hold)\b/i,
	/\bupgraded? to (?:buy|outperform)\b/i,
	/\bdowngraded? to (?:sell|underperform)\b/i,
	/\binvestors should (?:buy|sell|hold|invest)\b/i,
];

/**
 * Scan text for personalized investment advice language.
 * Returns every matched phrase so callers can produce targeted warnings.
 */
export function detectFinancialAdvice(text: string): AdviceGuardResult {
	const matched: string[] = [];
	for (const pattern of ADVICE_PATTERNS) {
		const match = text.match(pattern);
		if (match) matched.push(match[0]);
	}
	return { isAdvice: matched.length > 0, matchedPhrases: matched };
}

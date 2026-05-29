import { describe, expect, it, vi } from "vitest";

// Prevent undici from loading on Node 20 in CI.
vi.mock("@earendil-works/pi-coding-agent", () => ({ defineTool: (def: unknown) => def }));

import { buildAnalystAnswer } from "../src/tools/submitAnswerTool.ts";
import type { AnalystAnswer } from "../src/types/AgentAnswer.ts";
import { verifyCitations } from "../src/verification/citationVerifier.ts";
import { detectFinancialAdvice } from "../src/verification/financialAdviceGuard.ts";
import { runVerification } from "../src/verification/index.ts";
import { checkUnsupportedClaims } from "../src/verification/unsupportedClaimChecker.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseAnswer(overrides: Partial<AnalystAnswer> = {}): AnalystAnswer {
	return {
		answer: "Apple reported revenue of $383 billion in FY2023.",
		keyPoints: [{ claim: "Revenue was $383 billion in FY2023.", evidenceIds: ["ev-1"] }],
		caveats: [],
		sources: [{ evidenceId: "ev-1", title: "AAPL 10-K FY2023 — MD&A", sourceType: "filing" }],
		verification: { supported: true, warnings: [] },
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// verifyCitations
// ---------------------------------------------------------------------------

describe("verifyCitations", () => {
	it("returns supported:true when all evidenceIds are in sources", () => {
		const result = verifyCitations(baseAnswer());
		expect(result.supported).toBe(true);
		expect(result.warnings).toHaveLength(0);
	});

	it("returns supported:false with a warning when a keyPoint evidenceId is missing from sources", () => {
		const answer = baseAnswer({
			keyPoints: [{ claim: "Revenue was $383B.", evidenceIds: ["ev-missing"] }],
			sources: [],
		});
		const result = verifyCitations(answer);
		expect(result.supported).toBe(false);
		expect(result.warnings[0]).toContain("ev-missing");
	});

	it("includes claim snippet in the warning message", () => {
		const answer = baseAnswer({
			keyPoints: [{ claim: "Net income increased 10%.", evidenceIds: ["ev-x"] }],
			sources: [],
		});
		const result = verifyCitations(answer);
		expect(result.warnings[0]).toContain("Net income increased 10%.");
	});

	it("flags table evidenceIds missing from sources", () => {
		const answer = baseAnswer({
			tables: [{ title: "Revenue Table", columns: ["Year", "Revenue"], rows: [], evidenceIds: ["ev-table"] }],
		});
		const result = verifyCitations(answer);
		expect(result.supported).toBe(false);
		expect(result.warnings[0]).toContain("Revenue Table");
		expect(result.warnings[0]).toContain("ev-table");
	});

	it("passes when no keyPoints or tables reference any evidenceIds", () => {
		const answer = baseAnswer({
			keyPoints: [{ claim: "No data claim.", evidenceIds: [] }],
		});
		// verifyCitations only checks that cited IDs match sources — empty is not its concern
		const result = verifyCitations(answer);
		expect(result.supported).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// detectFinancialAdvice
// ---------------------------------------------------------------------------

describe("detectFinancialAdvice", () => {
	it("returns isAdvice:false for neutral factual text", () => {
		const result = detectFinancialAdvice("Apple's revenue grew 5% to $394 billion in FY2022.");
		expect(result.isAdvice).toBe(false);
		expect(result.matchedPhrases).toHaveLength(0);
	});

	it("detects 'you should buy'", () => {
		const result = detectFinancialAdvice("Given this growth, you should buy AAPL shares.");
		expect(result.isAdvice).toBe(true);
		expect(result.matchedPhrases[0]).toMatch(/you should buy/i);
	});

	it("detects 'you should sell'", () => {
		const result = detectFinancialAdvice("Risk levels suggest you should sell your position.");
		expect(result.isAdvice).toBe(true);
	});

	it("detects 'I recommend buying'", () => {
		const result = detectFinancialAdvice("I recommend buying this stock at current prices.");
		expect(result.isAdvice).toBe(true);
	});

	it("detects 'strong buy'", () => {
		const result = detectFinancialAdvice("The stock is rated a strong buy by analysts.");
		expect(result.isAdvice).toBe(true);
		expect(result.matchedPhrases[0]).toMatch(/strong buy/i);
	});

	it("detects 'buy rating'", () => {
		const result = detectFinancialAdvice("It carries a buy rating from major houses.");
		expect(result.isAdvice).toBe(true);
	});

	it("detects 'time to buy'", () => {
		const result = detectFinancialAdvice("Analysts say it is time to buy before earnings.");
		expect(result.isAdvice).toBe(true);
	});

	it("detects 'this is a buy'", () => {
		const result = detectFinancialAdvice("At this valuation, this stock is a buy.");
		expect(result.isAdvice).toBe(true);
	});

	it("detects 'upgraded to buy'", () => {
		const result = detectFinancialAdvice("Goldman upgraded to buy following the earnings beat.");
		expect(result.isAdvice).toBe(true);
	});

	it("detects 'downgraded to sell'", () => {
		const result = detectFinancialAdvice("Analysts downgraded to sell on margin concerns.");
		expect(result.isAdvice).toBe(true);
	});

	it("detects 'investors should buy'", () => {
		const result = detectFinancialAdvice("Investors should buy on dips in the current cycle.");
		expect(result.isAdvice).toBe(true);
	});

	it("does not flag 'buy' used in a non-advice context", () => {
		const result = detectFinancialAdvice("The company plans to buy back $90 billion in shares.");
		expect(result.isAdvice).toBe(false);
	});

	it("does not flag factual analyst rating descriptions without personal recommendation", () => {
		const result = detectFinancialAdvice("The consensus estimate among 30 analysts is $198 per share.");
		expect(result.isAdvice).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// checkUnsupportedClaims
// ---------------------------------------------------------------------------

describe("checkUnsupportedClaims", () => {
	it("returns empty list when all claims have evidenceIds", () => {
		const result = checkUnsupportedClaims(baseAnswer());
		expect(result.unsupportedClaims).toHaveLength(0);
	});

	it("flags claims with empty evidenceIds array", () => {
		const answer = baseAnswer({
			keyPoints: [
				{ claim: "Revenue was $383B.", evidenceIds: ["ev-1"] },
				{ claim: "Profit margin improved.", evidenceIds: [] },
			],
		});
		const result = checkUnsupportedClaims(answer);
		expect(result.unsupportedClaims).toHaveLength(1);
		expect(result.unsupportedClaims[0]).toContain("Profit margin improved.");
	});

	it("flags all unsupported claims when multiple are missing evidence", () => {
		const answer = baseAnswer({
			keyPoints: [
				{ claim: "Claim A.", evidenceIds: [] },
				{ claim: "Claim B.", evidenceIds: [] },
				{ claim: "Claim C.", evidenceIds: ["ev-1"] },
			],
		});
		const result = checkUnsupportedClaims(answer);
		expect(result.unsupportedClaims).toHaveLength(2);
		expect(result.unsupportedClaims).toContain("Claim A.");
		expect(result.unsupportedClaims).toContain("Claim B.");
	});
});

// ---------------------------------------------------------------------------
// runVerification (combined)
// ---------------------------------------------------------------------------

describe("runVerification", () => {
	it("returns supported:true and no warnings for a clean answer", () => {
		const result = runVerification(baseAnswer());
		expect(result.supported).toBe(true);
		expect(result.warnings).toHaveLength(0);
	});

	it("returns supported:false when a keyPoint has no evidenceIds", () => {
		const answer = baseAnswer({
			keyPoints: [{ claim: "Unverified claim.", evidenceIds: [] }],
		});
		const result = runVerification(answer);
		expect(result.supported).toBe(false);
		expect(result.warnings.some((w) => w.includes("Unsupported claim"))).toBe(true);
	});

	it("returns supported:false when a cited evidenceId is absent from sources", () => {
		const answer = baseAnswer({
			keyPoints: [{ claim: "Revenue was $383B.", evidenceIds: ["ev-ghost"] }],
			sources: [],
		});
		const result = runVerification(answer);
		expect(result.supported).toBe(false);
		expect(result.warnings.some((w) => w.includes("ev-ghost"))).toBe(true);
	});

	it("returns supported:false and advice warning when advice language is present", () => {
		const answer = baseAnswer({
			answer: "Given strong results, you should buy AAPL shares.",
		});
		const result = runVerification(answer);
		expect(result.supported).toBe(false);
		expect(result.warnings.some((w) => /financial advice/i.test(w))).toBe(true);
	});

	it("accumulates warnings from multiple checks", () => {
		const answer = baseAnswer({
			answer: "You should buy AAPL. Revenue was $383B.",
			keyPoints: [
				{ claim: "Unsupported claim with no evidence.", evidenceIds: [] },
				{ claim: "Revenue was $383B.", evidenceIds: ["ev-orphan"] },
			],
			sources: [],
		});
		const result = runVerification(answer);
		expect(result.supported).toBe(false);
		expect(result.warnings.length).toBeGreaterThanOrEqual(3);
	});
});

// ---------------------------------------------------------------------------
// buildAnalystAnswer — integration with runVerification
// ---------------------------------------------------------------------------

describe("buildAnalystAnswer — verification integration", () => {
	it("sets supported:true when all claims are properly evidenced", () => {
		const answer = buildAnalystAnswer({
			answer: "Apple FY2023 revenue was $383 billion.",
			keyPoints: [{ claim: "Revenue was $383B.", evidenceIds: ["ev-1"] }],
			caveats: [],
			sources: [{ evidenceId: "ev-1", title: "AAPL 10-K FY2023", sourceType: "filing" }],
		});
		expect(answer.verification.supported).toBe(true);
		expect(answer.verification.warnings).toHaveLength(0);
	});

	it("sets supported:false when answer contains financial advice", () => {
		const answer = buildAnalystAnswer({
			answer: "Given the results, you should buy AAPL immediately.",
			keyPoints: [{ claim: "Revenue grew.", evidenceIds: ["ev-1"] }],
			caveats: [],
			sources: [{ evidenceId: "ev-1", title: "AAPL 10-K", sourceType: "filing" }],
		});
		expect(answer.verification.supported).toBe(false);
		expect(answer.verification.warnings.some((w) => /financial advice/i.test(w))).toBe(true);
	});

	it("sets supported:false for unsupported keyPoint claims", () => {
		const answer = buildAnalystAnswer({
			answer: "Apple results were mixed.",
			keyPoints: [
				{ claim: "Revenue was $383B.", evidenceIds: ["ev-1"] },
				{ claim: "This claim has no evidence.", evidenceIds: [] },
			],
			caveats: [],
			sources: [{ evidenceId: "ev-1", title: "AAPL 10-K", sourceType: "filing" }],
		});
		expect(answer.verification.supported).toBe(false);
		expect(answer.verification.warnings.some((w) => /unsupported claim/i.test(w))).toBe(true);
	});

	it("sets supported:false and warns when evidenceId is orphaned", () => {
		const answer = buildAnalystAnswer({
			answer: "Apple results were strong.",
			keyPoints: [{ claim: "Revenue was $383B.", evidenceIds: ["ev-ghost"] }],
			caveats: [],
			sources: [],
		});
		expect(answer.verification.supported).toBe(false);
		expect(answer.verification.warnings.some((w) => w.includes("ev-ghost"))).toBe(true);
	});
});

import { describe, expect, it } from "vitest";
import { createDefaultEvalCases } from "../src/evals/evalCases.ts";
import { runLocalEvals } from "../src/evals/localEvalRunner.ts";

describe("local finance evals", () => {
	it("defines the required offline eval categories", () => {
		const cases = createDefaultEvalCases();
		const categories = new Set(cases.map((evalCase) => evalCase.category));

		expect(cases.length).toBeGreaterThanOrEqual(5);
		expect(categories).toContain("filing_retrieval");
		expect(categories).toContain("xbrl_metric");
		expect(categories).toContain("transcript_retrieval");
		expect(categories).toContain("guardrail");
	});

	it("passes the default local eval suite", async () => {
		const run = await runLocalEvals();

		expect(run.total).toBe(5);
		expect(run.failed).toBe(0);
		expect(run.passed).toBe(5);
		expect(run.results.every((result) => result.passed)).toBe(true);
	});
});

import { createDefaultEvalCases, type FinanceEvalCase, type FinanceEvalResult } from "./evalCases.ts";

export type LocalEvalRun = {
	total: number;
	passed: number;
	failed: number;
	results: FinanceEvalResult[];
};

export async function runLocalEvals(cases: FinanceEvalCase[] = createDefaultEvalCases()): Promise<LocalEvalRun> {
	const results: FinanceEvalResult[] = [];
	for (const evalCase of cases) {
		try {
			results.push(await evalCase.run());
		} catch (err) {
			results.push({
				id: evalCase.id,
				category: evalCase.category,
				passed: false,
				message: err instanceof Error ? err.message : String(err),
			});
		}
	}

	const passed = results.filter((evalResult) => evalResult.passed).length;
	return {
		total: results.length,
		passed,
		failed: results.length - passed,
		results,
	};
}

export async function runLocalEvalsCli(): Promise<void> {
	const run = await runLocalEvals();
	console.log(JSON.stringify(run, null, 2));
	if (run.failed > 0) {
		process.exitCode = 1;
	}
}

if (process.argv[1]?.endsWith("localEvalRunner.ts") || process.argv[1]?.endsWith("localEvalRunner.js")) {
	await runLocalEvalsCli();
}

import {
	InMemoryCompanyRepository,
	InMemoryFilingChunkRepository,
	InMemoryTranscriptChunkRepository,
	InMemoryXbrlFactRepository,
} from "@earendil-works/pi-research-db";
import { computeMetricToolCore } from "../tools/computeMetricTool.ts";
import { retrieveFilingPassagesCore } from "../tools/retrieveFilingPassagesTool.ts";
import { retrieveTranscriptPassagesCore } from "../tools/retrieveTranscriptPassagesTool.ts";
import type { AnalystAnswer } from "../types/AgentAnswer.ts";
import { runVerification } from "../verification/index.ts";

export type EvalCategory = "filing_retrieval" | "xbrl_metric" | "transcript_retrieval" | "guardrail";

export type FinanceEvalResult = {
	id: string;
	category: EvalCategory;
	passed: boolean;
	message: string;
};

export type FinanceEvalCase = {
	id: string;
	category: EvalCategory;
	description: string;
	run(): Promise<FinanceEvalResult>;
};

function result(evalCase: FinanceEvalCase, passed: boolean, message: string): FinanceEvalResult {
	return { id: evalCase.id, category: evalCase.category, passed, message };
}

function verifiedAnswer(overrides: Partial<AnalystAnswer>): AnalystAnswer {
	return {
		answer: "The company result is source backed.",
		keyPoints: [{ claim: "Revenue increased.", evidenceIds: ["ev-1"] }],
		caveats: [],
		sources: [{ evidenceId: "ev-1", title: "Apple 10-K", sourceType: "filing", locator: "Item 7" }],
		verification: { supported: true, warnings: [] },
		...overrides,
	};
}

export function createDefaultEvalCases(): FinanceEvalCase[] {
	const filingRetrieval: FinanceEvalCase = {
		id: "filing-risk-factor-retrieval",
		category: "filing_retrieval",
		description: "Risk-factor retrieval returns a section-filtered passage with a stable evidence ID.",
		async run() {
			const chunkRepo = new InMemoryFilingChunkRepository();
			await chunkRepo.create({
				id: "chunk-risk-1",
				companyId: "company-aapl",
				filingId: "filing-2023-10k",
				form: "10-K",
				filingDate: "2023-11-03",
				fiscalYear: 2023,
				fiscalPeriod: "FY",
				sectionType: "risk_factors",
				text: "The company faces risk from supply constraints and macroeconomic uncertainty.",
				textHash: "risk-hash",
				sourceLocator: "Item 1A",
			});
			await chunkRepo.create({
				id: "chunk-mda-1",
				companyId: "company-aapl",
				filingId: "filing-2023-10k",
				form: "10-K",
				filingDate: "2023-11-03",
				fiscalYear: 2023,
				fiscalPeriod: "FY",
				sectionType: "mda",
				text: "Management discussed product demand and revenue growth.",
				textHash: "mda-hash",
			});

			const output = await retrieveFilingPassagesCore(
				{ companyId: "company-aapl", query: "supply risk uncertainty", sectionTypes: ["risk_factors"], topK: 1 },
				{ chunkRepo, embeddingProvider: null },
			);

			const passed = output.passages.length === 1 && output.passages[0].evidenceId === "chunk-risk-1";
			return result(
				filingRetrieval,
				passed,
				passed ? "Retrieved risk-factor passage." : "Did not retrieve expected passage.",
			);
		},
	};

	const xbrlMetric: FinanceEvalCase = {
		id: "xbrl-gross-margin",
		category: "xbrl_metric",
		description: "Gross margin is computed from XBRL revenue and gross-profit facts with evidence inputs.",
		async run() {
			const companyRepo = new InMemoryCompanyRepository();
			const xbrlRepo = new InMemoryXbrlFactRepository();
			await companyRepo.create({ id: "company-aapl", cik: "0000320193", ticker: "AAPL", name: "Apple Inc." });
			await xbrlRepo.createBatch([
				{
					id: "fact-revenue",
					companyId: "company-aapl",
					cik: "0000320193",
					taxonomy: "us-gaap",
					concept: "RevenueFromContractWithCustomerExcludingAssessedTax",
					unit: "USD",
					value: 100,
					fiscalYear: 2023,
					fiscalPeriod: "FY",
					source: "sec_companyfacts",
				},
				{
					id: "fact-gross-profit",
					companyId: "company-aapl",
					cik: "0000320193",
					taxonomy: "us-gaap",
					concept: "GrossProfit",
					unit: "USD",
					value: 44,
					fiscalYear: 2023,
					fiscalPeriod: "FY",
					source: "sec_companyfacts",
				},
			]);

			const output = await computeMetricToolCore(
				{ companyId: "company-aapl", metric: "gross_margin", fiscalYear: 2023, fiscalPeriod: "FY" },
				{ companyRepo, xbrlRepo },
			);
			const evidenceIds = output.inputs.map((input) => input.evidenceId);
			const passed =
				output.value === 44 && evidenceIds.includes("fact-revenue") && evidenceIds.includes("fact-gross-profit");
			return result(xbrlMetric, passed, passed ? "Computed XBRL gross margin." : "Unexpected gross-margin output.");
		},
	};

	const transcriptRetrieval: FinanceEvalCase = {
		id: "transcript-cfo-services",
		category: "transcript_retrieval",
		description: "Transcript retrieval finds CFO commentary in prepared remarks.",
		async run() {
			const chunkRepo = new InMemoryTranscriptChunkRepository();
			await chunkRepo.create({
				id: "transcript-cfo-1",
				transcriptId: "transcript-aapl-q4",
				companyId: "company-aapl",
				eventDate: "2023-11-02",
				fiscalYear: 2023,
				fiscalPeriod: "Q4",
				section: "prepared_remarks",
				speaker: "Luca Maestri",
				speakerRole: "CFO",
				text: "Services revenue reached an all-time record with broad strength across cloud and payments.",
				textHash: "transcript-hash",
				sourceLocator: "Luca Maestri - prepared_remarks",
			});

			const output = await retrieveTranscriptPassagesCore(
				{
					companyId: "company-aapl",
					query: "services revenue record",
					speakerRoles: ["CFO"],
					fiscalYear: 2023,
					fiscalPeriod: "Q4",
					topK: 1,
				},
				{ chunkRepo },
			);

			const passed = output.passages.length === 1 && output.passages[0].speakerRole === "CFO";
			return result(
				transcriptRetrieval,
				passed,
				passed ? "Retrieved CFO transcript passage." : "Did not retrieve CFO passage.",
			);
		},
	};

	const adviceGuard: FinanceEvalCase = {
		id: "guardrail-investment-advice",
		category: "guardrail",
		description: "Personalized buy/sell/hold language fails verification.",
		async run() {
			const answer = verifiedAnswer({ answer: "You should buy AAPL based on these results." });
			const verification = runVerification(answer);
			const passed =
				!verification.supported && verification.warnings.some((warning) => warning.includes("Financial advice"));
			return result(
				adviceGuard,
				passed,
				passed ? "Blocked investment advice language." : "Advice language was not blocked.",
			);
		},
	};

	const unsupportedClaim: FinanceEvalCase = {
		id: "guardrail-unsupported-claim",
		category: "guardrail",
		description: "Material claims without evidence IDs fail verification.",
		async run() {
			const answer = verifiedAnswer({ keyPoints: [{ claim: "Revenue accelerated materially.", evidenceIds: [] }] });
			const verification = runVerification(answer);
			const passed =
				!verification.supported && verification.warnings.some((warning) => warning.includes("Unsupported claim"));
			return result(
				unsupportedClaim,
				passed,
				passed ? "Flagged unsupported claim." : "Unsupported claim was not flagged.",
			);
		},
	};

	return [filingRetrieval, xbrlMetric, transcriptRetrieval, adviceGuard, unsupportedClaim];
}

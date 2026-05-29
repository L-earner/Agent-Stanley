import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AnalystAnswer } from "../types/AgentAnswer.ts";
import { runVerification } from "../verification/index.ts";

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export type SubmitAnswerParams = {
	answer: string;
	keyPoints: Array<{ claim: string; evidenceIds: string[] }>;
	tables?: Array<{ title: string; columns: string[]; rows: string[][]; evidenceIds: string[] }>;
	caveats: string[];
	sources: Array<{ evidenceId: string; title: string; sourceType: string; url?: string; locator?: string }>;
};

/** Build a complete AnalystAnswer from submit_answer params, running all verification checks. */
export function buildAnalystAnswer(params: SubmitAnswerParams): AnalystAnswer {
	const partial: AnalystAnswer = {
		answer: params.answer,
		keyPoints: params.keyPoints,
		tables: params.tables,
		caveats: params.caveats,
		sources: params.sources,
		verification: { supported: true, warnings: [] },
	};
	const verification = runVerification(partial);
	return { ...partial, verification };
}

// ---------------------------------------------------------------------------
// Pi tool wrapper
// ---------------------------------------------------------------------------

export type SubmitAnswerDeps = {
	/** Called immediately when the agent submits a final answer. */
	onAnswer: (answer: AnalystAnswer) => void;
};

/**
 * The final tool the agent calls after all evidence has been gathered.
 *
 * The onAnswer callback delivers the structured AnalystAnswer to the runtime
 * which emits it as a { type: "final" } stream event.
 */
export function createSubmitAnswerTool(deps: SubmitAnswerDeps) {
	return defineTool({
		name: "submit_answer",
		label: "Submit Answer",
		description:
			"Submit the final structured answer after all evidence has been gathered. This MUST be the last tool call. Include every material claim with its evidenceId.",
		promptSnippet:
			"submit_answer(answer, keyPoints, caveats, sources) — final step: submit the structured analyst answer",
		promptGuidelines: [
			"Always call submit_answer as the last tool — never end without submitting.",
			"Every keyPoint claim must include the evidenceIds that support it.",
			"Every evidenceId in keyPoints must appear in sources with its title and sourceType.",
			"If a claim has no supporting evidenceId, do not include it.",
		],
		parameters: Type.Object({
			answer: Type.String({
				description: "The complete narrative answer — concise paragraph(s) summarising findings",
			}),
			keyPoints: Type.Array(
				Type.Object({
					claim: Type.String({ description: "One specific factual claim" }),
					evidenceIds: Type.Array(Type.String(), { description: "IDs from tool results supporting this claim" }),
				}),
				{ description: "Key factual claims with supporting evidence" },
			),
			tables: Type.Optional(
				Type.Array(
					Type.Object({
						title: Type.String(),
						columns: Type.Array(Type.String()),
						rows: Type.Array(Type.Array(Type.String())),
						evidenceIds: Type.Array(Type.String()),
					}),
					{ description: "Optional data tables for multi-period or multi-metric comparisons" },
				),
			),
			caveats: Type.Array(Type.String(), {
				description: "Limitations, missing data, or uncertainty disclaimers",
			}),
			sources: Type.Array(
				Type.Object({
					evidenceId: Type.String(),
					title: Type.String({ description: "Human-readable label, e.g. 'AAPL 10-K FY2023 — MD&A'" }),
					sourceType: Type.String({ description: "filing, xbrl_fact, or transcript" }),
					url: Type.Optional(Type.String()),
					locator: Type.Optional(Type.String({ description: "Section label, item number, etc." })),
				}),
				{ description: "All evidence items cited in the answer" },
			),
		}),
		execute: async (_toolCallId, params) => {
			const answer = buildAnalystAnswer(params);
			deps.onAnswer(answer);
			return {
				content: [{ type: "text" as const, text: "Answer recorded." }],
				details: answer,
			};
		},
	});
}

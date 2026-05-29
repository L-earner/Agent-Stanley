import { Agent, type AgentOptions, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { FINANCE_SYSTEM_PROMPT } from "../prompts/financeSystemPrompt.ts";
import { buildAnalystAnswer, type SubmitAnswerParams } from "../tools/submitAnswerTool.ts";
import type { AnalystAnswer } from "../types/AgentAnswer.ts";
import type { ResearchAgentEvent, ResearchAgentInput, ResearchAgentRuntime } from "./ResearchAgentRuntime.ts";

export type PiCoreResearchAgentRuntimeConfig = {
	model: Model<any>;
	tools?: AgentTool[];
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	streamFn?: AgentOptions["streamFn"];
};

function createCoreSubmitAnswerTool(onAnswer: (answer: AnalystAnswer) => void): AgentTool {
	return {
		name: "submit_answer",
		label: "Submit Answer",
		description:
			"Submit the final structured answer after all evidence has been gathered. This MUST be the last tool call.",
		parameters: Type.Object({
			answer: Type.String(),
			keyPoints: Type.Array(
				Type.Object({
					claim: Type.String(),
					evidenceIds: Type.Array(Type.String()),
				}),
			),
			tables: Type.Optional(
				Type.Array(
					Type.Object({
						title: Type.String(),
						columns: Type.Array(Type.String()),
						rows: Type.Array(Type.Array(Type.String())),
						evidenceIds: Type.Array(Type.String()),
					}),
				),
			),
			caveats: Type.Array(Type.String()),
			sources: Type.Array(
				Type.Object({
					evidenceId: Type.String(),
					title: Type.String(),
					sourceType: Type.String(),
					url: Type.Optional(Type.String()),
					locator: Type.Optional(Type.String()),
				}),
			),
		}),
		execute: async (_toolCallId, params) => {
			const answer = buildAnalystAnswer(params as SubmitAnswerParams);
			onAnswer(answer);
			return {
				content: [{ type: "text" as const, text: "Answer recorded." }],
				details: answer,
			};
		},
	};
}

/**
 * Direct pi-agent-core runtime adapter.
 *
 * This keeps the same ResearchAgentRuntime interface as PiResearchAgentRuntime while
 * bypassing @earendil-works/pi-coding-agent. It is intentionally explicit about
 * model/auth/tool dependencies because pi-agent-core does not include the coding
 * SDK's ModelRegistry, resource loader, or extension plumbing.
 */
export class PiCoreResearchAgentRuntime implements ResearchAgentRuntime {
	private readonly config: PiCoreResearchAgentRuntimeConfig;

	constructor(config: PiCoreResearchAgentRuntimeConfig) {
		this.config = config;
	}

	async *stream(input: ResearchAgentInput): AsyncIterable<ResearchAgentEvent> {
		const events: ResearchAgentEvent[] = [];
		let resolve: (() => void) | null = null;
		let done = false;
		let errorMessage: string | null = null;

		const queue = (event: ResearchAgentEvent) => {
			events.push(event);
			resolve?.();
			resolve = null;
		};

		const agent = new Agent({
			initialState: {
				systemPrompt: FINANCE_SYSTEM_PROMPT,
				model: this.config.model,
				tools: [
					...(this.config.tools ?? []),
					createCoreSubmitAnswerTool((answer) => queue({ type: "final", answer })),
				],
			},
			getApiKey: this.config.getApiKey,
			streamFn: this.config.streamFn,
			toolExecution: "sequential",
		});

		const unsubscribe = agent.subscribe((event) => {
			if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
				queue({ type: "text_delta", delta: event.assistantMessageEvent.delta });
			} else if (event.type === "tool_execution_start") {
				queue({ type: "tool_start", toolName: event.toolName });
			} else if (event.type === "tool_execution_end") {
				queue({ type: "tool_result", toolName: event.toolName });
			} else if (event.type === "agent_end") {
				const failed = event.messages.find(
					(message) => message.role === "assistant" && message.stopReason === "error",
				);
				if (failed?.role === "assistant" && failed.errorMessage) {
					errorMessage = failed.errorMessage;
				}
			}
		});

		const promptPromise = agent
			.prompt(input.message)
			.catch((err: unknown) => {
				errorMessage = err instanceof Error ? err.message : String(err);
			})
			.finally(() => {
				done = true;
				unsubscribe();
				resolve?.();
				resolve = null;
			});

		try {
			while (!done || events.length > 0) {
				if (events.length === 0 && !done) {
					await new Promise<void>((res) => {
						resolve = res;
					});
				}
				while (events.length > 0) {
					yield events.shift()!;
				}
			}
			if (errorMessage) {
				yield { type: "error", message: errorMessage };
			}
		} finally {
			await promptPromise.catch(() => {});
		}
	}
}

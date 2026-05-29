import type { AnalystAnswer } from "../types/AgentAnswer.ts";

export type ResearchAgentInput = {
	userId?: string;
	sessionId?: string;
	message: string;
	companyHint?: string;
	sourceScope?: {
		forms?: Array<"10-K" | "10-Q" | "8-K">;
		fiscalPeriods?: string[];
		includeTranscripts?: boolean;
	};
};

export type ResearchAgentEvent =
	| { type: "text_delta"; delta: string }
	| { type: "tool_start"; toolName: string; inputSummary?: string }
	| { type: "tool_result"; toolName: string; resultSummary?: string }
	| { type: "evidence"; evidenceIds: string[] }
	| { type: "final"; answer: AnalystAnswer }
	| { type: "error"; message: string };

export interface ResearchAgentRuntime {
	stream(input: ResearchAgentInput): AsyncIterable<ResearchAgentEvent>;
}

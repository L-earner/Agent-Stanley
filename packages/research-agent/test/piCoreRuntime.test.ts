import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { PiCoreResearchAgentRuntime } from "../src/runtime/PiCoreResearchAgentRuntime.ts";
import type { ResearchAgentEvent } from "../src/runtime/ResearchAgentRuntime.ts";

const model = {
	provider: "test",
	id: "test-model",
	name: "Test model",
	api: "openai-responses",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 1000,
	maxTokens: 100,
} as any;

function assistantMessage(text: string) {
	return {
		role: "assistant" as const,
		content: [{ type: "text" as const, text }],
		api: "openai-responses",
		provider: "test",
		model: "test-model",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop" as const,
		timestamp: Date.now(),
	};
}

describe("PiCoreResearchAgentRuntime", () => {
	it("implements ResearchAgentRuntime with direct pi-agent-core streaming", async () => {
		const runtime = new PiCoreResearchAgentRuntime({
			model,
			streamFn: () => {
				const stream = createAssistantMessageEventStream();
				const started = assistantMessage("");
				stream.push({ type: "start", partial: started });
				const partial = assistantMessage("core response");
				stream.push({ type: "text_delta", contentIndex: 0, delta: "core response", partial });
				stream.push({ type: "done", reason: "stop", message: partial });
				return stream;
			},
		});

		const events: ResearchAgentEvent[] = [];
		for await (const event of runtime.stream({ message: "hello" })) {
			events.push(event);
		}

		expect(events).toContainEqual({ type: "text_delta", delta: "core response" });
	});
});

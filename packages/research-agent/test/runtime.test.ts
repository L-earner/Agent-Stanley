import { describe, expect, it, vi } from "vitest";
import { FINANCE_SYSTEM_PROMPT } from "../src/prompts/financeSystemPrompt.ts";

// ---------------------------------------------------------------------------
// Mock Pi SDK — prevents network calls and removes Node.js version dependency
// during unit tests.
// ---------------------------------------------------------------------------

let capturedSessionOptions: Record<string, unknown> = {};
let capturedSystemPrompt: string | undefined;
const openAiModel = { provider: "openai", id: "gpt-5.4" };
const anthropicModel = { provider: "anthropic", id: "claude-opus-4-8" };

vi.mock("@earendil-works/pi-coding-agent", () => {
	const defineTool = (def: unknown) => def;

	class MockAuthStorage {
		readonly type = "mock-auth-storage";

		static create() {
			return new MockAuthStorage();
		}
	}

	class MockModelRegistry {
		static create() {
			return new MockModelRegistry();
		}
		find(provider: string, modelId: string) {
			return [openAiModel, anthropicModel].find((model) => model.provider === provider && model.id === modelId);
		}
		getAll() {
			return [openAiModel, anthropicModel];
		}
	}

	class MockSessionManager {
		readonly type = "mock-session-manager";

		static inMemory() {
			return new MockSessionManager();
		}
	}

	class DefaultResourceLoader {
		constructor(opts: Record<string, unknown>) {
			if (typeof opts.systemPromptOverride === "function") {
				capturedSystemPrompt = opts.systemPromptOverride(undefined);
			}
		}
		async reload() {}
	}

	const createAgentSession = async (opts: Record<string, unknown>) => {
		capturedSessionOptions = opts;

		const tools = opts.customTools as Array<{
			name: string;
			execute: (id: string, params: unknown, signal: unknown, onUpdate: unknown, ctx: unknown) => Promise<unknown>;
		}>;
		const submitTool = tools?.find((t) => t.name === "submit_answer");

		const listeners: Array<(e: unknown) => void> = [];
		const session = {
			subscribe(listener: (e: unknown) => void) {
				listeners.push(listener);
				return () => {};
			},
			async prompt(_msg: string) {
				// Simulate a text_delta, then a submit_answer tool call.
				for (const listener of listeners) {
					listener({
						type: "message_update",
						assistantMessageEvent: { type: "text_delta", delta: "test response" },
					});
				}
				if (submitTool) {
					for (const listener of listeners) {
						listener({ type: "tool_execution_start", toolName: "submit_answer" });
					}
					await submitTool.execute(
						"tc-1",
						{
							answer: "Apple had revenue of $89.5 billion in Q4 2023.",
							keyPoints: [{ claim: "Revenue was $89.5B", evidenceIds: ["ev-abc"] }],
							caveats: ["Based on Q4 2023 10-K filing"],
							sources: [{ evidenceId: "ev-abc", title: "Apple 10-K Q4 2023", sourceType: "filing" }],
						},
						undefined,
						undefined,
						{},
					);
					for (const listener of listeners) {
						listener({ type: "tool_execution_end", toolName: "submit_answer" });
					}
				}
			},
			dispose() {},
		};

		return { session, extensionsResult: {} };
	};

	return {
		defineTool,
		AuthStorage: MockAuthStorage,
		ModelRegistry: MockModelRegistry,
		SessionManager: MockSessionManager,
		DefaultResourceLoader,
		createAgentSession,
	};
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PiResearchAgentRuntime", () => {
	it("streams a text_delta event from a prompt", async () => {
		const { PiResearchAgentRuntime } = await import("../src/runtime/PiResearchAgentRuntime.ts");
		const runtime = new PiResearchAgentRuntime();

		const events = [];
		for await (const event of runtime.stream({ message: "What are Apple's risks?" })) {
			events.push(event);
		}

		expect(events.some((e) => e.type === "text_delta")).toBe(true);
	});

	it("disables built-in coding tools (noTools: builtin)", async () => {
		const { PiResearchAgentRuntime } = await import("../src/runtime/PiResearchAgentRuntime.ts");
		const runtime = new PiResearchAgentRuntime();

		for await (const _ of runtime.stream({ message: "test" })) {
			// consume
		}

		expect(capturedSessionOptions.noTools).toBe("builtin");
	});

	it("passes a configured provider/model reference through to Pi", async () => {
		const { PiResearchAgentRuntime } = await import("../src/runtime/PiResearchAgentRuntime.ts");
		const runtime = new PiResearchAgentRuntime({ model: "openai/gpt-5.4" });

		for await (const _ of runtime.stream({ message: "test" })) {
			// consume
		}

		expect(capturedSessionOptions.model).toBe(openAiModel);
	});

	it("leaves model selection to Pi when no model is configured", async () => {
		const { PiResearchAgentRuntime } = await import("../src/runtime/PiResearchAgentRuntime.ts");
		const runtime = new PiResearchAgentRuntime();

		for await (const _ of runtime.stream({ message: "test" })) {
			// consume
		}

		expect(capturedSessionOptions.model).toBeUndefined();
	});

	it("uses only custom finance tools — no bash, edit, or write in customTools", async () => {
		const { PiResearchAgentRuntime } = await import("../src/runtime/PiResearchAgentRuntime.ts");
		const runtime = new PiResearchAgentRuntime();

		for await (const _ of runtime.stream({ message: "test" })) {
			// consume
		}

		const customTools = capturedSessionOptions.customTools as Array<{ name: string }>;
		const toolNames = customTools.map((t) => t.name);

		expect(toolNames).not.toContain("bash");
		expect(toolNames).not.toContain("edit");
		expect(toolNames).not.toContain("write");
		expect(toolNames).not.toContain("read");

		// All 6 finance tools should be present
		expect(toolNames).toContain("resolve_company");
		expect(toolNames).toContain("list_filings");
		expect(toolNames).toContain("ingest_company_filings");
		expect(toolNames).toContain("retrieve_filing_passages");
		expect(toolNames).toContain("get_xbrl_facts");
		expect(toolNames).toContain("compute_metric");
		expect(toolNames).toContain("retrieve_transcript_passages");
		// submit_answer is injected by the runtime itself, not from buildFinanceTools
		expect(toolNames).toContain("submit_answer");
	});

	it("emits a final event with AnalystAnswer when submit_answer is called", async () => {
		const { PiResearchAgentRuntime } = await import("../src/runtime/PiResearchAgentRuntime.ts");
		const runtime = new PiResearchAgentRuntime();

		const events = [];
		for await (const event of runtime.stream({ message: "What is Apple's revenue?" })) {
			events.push(event);
		}

		const finalEvent = events.find((e) => e.type === "final") as
			| { type: "final"; answer: { answer: string } }
			| undefined;
		expect(finalEvent).toBeDefined();
		expect(finalEvent!.answer.answer).toContain("89.5 billion");
	});

	it("final answer includes keyPoints with evidenceIds", async () => {
		const { PiResearchAgentRuntime } = await import("../src/runtime/PiResearchAgentRuntime.ts");
		const runtime = new PiResearchAgentRuntime();

		const events = [];
		for await (const event of runtime.stream({ message: "What is Apple's revenue?" })) {
			events.push(event);
		}

		const finalEvent = events.find((e) => e.type === "final") as any;
		expect(finalEvent?.answer.keyPoints).toHaveLength(1);
		expect(finalEvent?.answer.keyPoints[0].evidenceIds).toContain("ev-abc");
		expect(finalEvent?.answer.sources).toHaveLength(1);
		expect(finalEvent?.answer.sources[0].evidenceId).toBe("ev-abc");
	});

	it("uses the finance system prompt, not the coding-agent default", async () => {
		const { PiResearchAgentRuntime } = await import("../src/runtime/PiResearchAgentRuntime.ts");
		const runtime = new PiResearchAgentRuntime();

		for await (const _ of runtime.stream({ message: "test" })) {
			// consume
		}

		expect(capturedSystemPrompt).toBe(FINANCE_SYSTEM_PROMPT);
		expect(capturedSystemPrompt).toContain("investment research analyst");
		// The prompt must not self-identify as a coding agent. "You are not a coding agent" is allowed.
		expect(capturedSystemPrompt).not.toMatch(/^You are(?: a| an) coding agent/im);
	});
});

describe("FINANCE_SYSTEM_PROMPT", () => {
	it("does not self-identify as a coding agent", () => {
		// "You are not a coding agent" is the expected negation — the phrase "coding agent" may appear
		// only in that negation context, never as a self-description.
		expect(FINANCE_SYSTEM_PROMPT).not.toMatch(/^You are(?: a| an) coding agent/im);
		// These terms must not appear as instructions to the user (they may appear in prohibition context).
		expect(FINANCE_SYSTEM_PROMPT).not.toMatch(/run (the following )?bash/i);
		expect(FINANCE_SYSTEM_PROMPT).not.toMatch(/open a terminal/i);
		expect(FINANCE_SYSTEM_PROMPT).not.toMatch(/edit (the )?file/i);
	});

	it("requires evidence for claims", () => {
		expect(FINANCE_SYSTEM_PROMPT).toMatch(/evidence/i);
		expect(FINANCE_SYSTEM_PROMPT).toMatch(/cite/i);
	});

	it("prohibits personalized investment advice", () => {
		expect(FINANCE_SYSTEM_PROMPT).toMatch(/personalized investment advice/i);
	});
});

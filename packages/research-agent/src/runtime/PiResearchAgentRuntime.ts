import {
	AuthStorage,
	createAgentSession,
	DefaultResourceLoader,
	ModelRegistry,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { FINANCE_SYSTEM_PROMPT } from "../prompts/financeSystemPrompt.ts";
import type { FinanceToolDeps } from "../tools/index.ts";
import { buildFinanceTools } from "../tools/index.ts";
import { createSubmitAnswerTool } from "../tools/submitAnswerTool.ts";
import type { ResearchAgentEvent, ResearchAgentInput, ResearchAgentRuntime } from "./ResearchAgentRuntime.ts";

export type PiResearchAgentRuntimeConfig = {
	/** Optional Pi model reference, either "provider/model-id" or an unambiguous bare model id. */
	model?: string;
	/** Auth storage instance. Defaults to AuthStorage.create() using env vars. */
	authStorage?: AuthStorage;
	/** Model registry instance. Defaults to ModelRegistry.create(authStorage). */
	modelRegistry?: ModelRegistry;
	/** Finance tool dependencies. When absent, tools are registered as named stubs. */
	toolDeps?: FinanceToolDeps;
};

type PiModel = NonNullable<ReturnType<ModelRegistry["find"]>>;

function resolveModelReference(modelReference: string | undefined, modelRegistry: ModelRegistry): PiModel | undefined {
	const reference = modelReference?.trim();
	if (!reference) return undefined;

	const slashIndex = reference.indexOf("/");
	if (slashIndex > 0) {
		const provider = reference.slice(0, slashIndex);
		const modelId = reference.slice(slashIndex + 1);
		const model = modelRegistry.find(provider, modelId);
		if (!model) {
			throw new Error(`Configured model not found: ${reference}`);
		}
		return model;
	}

	const matches = modelRegistry.getAll().filter((model) => model.id === reference);
	if (matches.length === 1) return matches[0];
	if (matches.length > 1) {
		const candidates = matches.map((model) => `${model.provider}/${model.id}`).join(", ");
		throw new Error(`Configured model "${reference}" is ambiguous. Use provider/model-id. Matches: ${candidates}`);
	}

	throw new Error(`Configured model not found: ${reference}`);
}

/**
 * Pi SDK adapter for the ResearchAgentRuntime interface.
 *
 * This is the only module in the product that imports @earendil-works/pi-coding-agent.
 * All application code depends on ResearchAgentRuntime, not on this class.
 */
export class PiResearchAgentRuntime implements ResearchAgentRuntime {
	private readonly config: PiResearchAgentRuntimeConfig;

	constructor(config: PiResearchAgentRuntimeConfig = {}) {
		this.config = config;
	}

	async *stream(input: ResearchAgentInput): AsyncIterable<ResearchAgentEvent> {
		const authStorage = this.config.authStorage ?? AuthStorage.create();
		const modelRegistry = this.config.modelRegistry ?? ModelRegistry.create(authStorage);
		const model = resolveModelReference(this.config.model, modelRegistry);

		// Suppress all coding-agent context: AGENTS.md, skills, prompts, append-system.
		const loader = new DefaultResourceLoader({
			cwd: process.cwd(),
			agentDir: process.cwd(),
			systemPromptOverride: () => FINANCE_SYSTEM_PROMPT,
			appendSystemPromptOverride: () => [],
			agentsFilesOverride: () => ({ agentsFiles: [] }),
			skillsOverride: () => ({ skills: [], diagnostics: [] }),
			promptsOverride: () => ({ prompts: [], diagnostics: [] }),
		});
		await loader.reload();

		const events: ResearchAgentEvent[] = [];
		let resolve: (() => void) | null = null;
		let done = false;
		let errorMessage: string | null = null;

		// submit_answer fires this callback, which queues the final event immediately.
		const submitTool = createSubmitAnswerTool({
			onAnswer: (answer) => {
				events.push({ type: "final", answer });
				resolve?.();
				resolve = null;
			},
		});

		const { session } = await createAgentSession({
			resourceLoader: loader,
			sessionManager: SessionManager.inMemory(),
			authStorage,
			modelRegistry,
			model,
			noTools: "builtin",
			customTools: [...buildFinanceTools(this.config.toolDeps), submitTool],
		});

		const unsubscribe = session.subscribe((event) => {
			if (event.type === "message_update") {
				const ae = event.assistantMessageEvent;
				if (ae.type === "text_delta") {
					events.push({ type: "text_delta", delta: ae.delta });
					resolve?.();
					resolve = null;
				}
			} else if (event.type === "tool_execution_start") {
				events.push({ type: "tool_start", toolName: event.toolName });
				resolve?.();
				resolve = null;
			} else if (event.type === "tool_execution_end") {
				events.push({ type: "tool_result", toolName: event.toolName });
				resolve?.();
				resolve = null;
			}
		});

		const promptPromise = session
			.prompt(input.message)
			.then(() => {
				done = true;
				resolve?.();
				resolve = null;
			})
			.catch((err: unknown) => {
				errorMessage = err instanceof Error ? err.message : String(err);
				done = true;
				resolve?.();
				resolve = null;
			})
			.finally(() => {
				unsubscribe?.();
				session.dispose();
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

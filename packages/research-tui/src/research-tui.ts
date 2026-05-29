import { AuthStorage } from "@earendil-works/pi-coding-agent";
import type { ResearchAgentRuntime } from "@earendil-works/pi-research-agent";
import { Container, Input, Markdown, ProcessTerminal, Spacer, Text, TUI } from "@earendil-works/pi-tui";
import { AnalystAnswerComponent } from "./components/analyst-answer.ts";
import { FooterComponent } from "./components/footer.ts";
import { SetupScreenComponent } from "./components/setup-screen.ts";
import { StreamingTextComponent } from "./components/streaming-text.ts";
import { ToolCallComponent } from "./components/tool-call.ts";
import { UserMessageComponent } from "./components/user-message.ts";
import { detectProvider, hasAnyLlmConfigured, loadConfig, saveConfig } from "./config.ts";
import { ansi, markdownTheme } from "./theme.ts";

const WELCOME =
	`**Finance Research Analyst**\n` +
	`Ask questions about public companies using SEC filings, XBRL data, and earnings call transcripts.\n` +
	`Investment advice is not provided.`;

export type RuntimeFactory = () => ResearchAgentRuntime;

export class ResearchTUI {
	private tui: TUI;
	private input: Input;
	private chatHistory: Container;
	private activeTurn: Container;
	private footer: FooterComponent;

	private streaming = false;
	private abortController?: AbortController;
	private activeToolCalls = new Map<string, ToolCallComponent>();
	private streamingText?: StreamingTextComponent;
	private runtime?: ResearchAgentRuntime;
	private runtimeFactory: RuntimeFactory;

	constructor(runtimeFactory: RuntimeFactory) {
		this.runtimeFactory = runtimeFactory;

		const terminal = new ProcessTerminal();
		this.tui = new TUI(terminal);

		this.chatHistory = new Container();
		this.activeTurn = new Container();
		this.footer = new FooterComponent();

		this.input = new Input();
		this.input.onSubmit = (value) => this.handleSubmit(value);

		// Welcome banner
		this.tui.addChild(new Spacer(1));
		this.tui.addChild(new Markdown(WELCOME, 1, 0, markdownTheme));
		this.tui.addChild(new Spacer(1));

		this.tui.addChild(this.chatHistory);
		this.tui.addChild(this.activeTurn);
		this.tui.addChild(this.footer);
		this.tui.addChild(this.input);

		// Global key handler
		this.tui.addInputListener((data) => {
			if (data === "\x03") {
				// Ctrl+C
				if (this.streaming) {
					this.cancelStream();
				} else {
					this.stop();
					process.exit(0);
				}
				return { consume: true };
			}
			if (data === "\x0c") {
				// Ctrl+L — force full redraw
				this.tui.requestRender(true);
				return { consume: true };
			}
			return undefined;
		});
	}

	start(): void {
		this.tui.start();
		// Run setup check asynchronously; input is not focused until setup completes
		this.footer.setStatus("starting…");
		this.initializeAsync().catch((err) => {
			const msg = err instanceof Error ? err.message : String(err);
			this.chatHistory.addChild(new Text(ansi.red(`⚠  Startup error: ${msg}`), 1, 1));
			this.footer.setStatus("error");
			this.tui.requestRender();
		});
	}

	stop(): void {
		for (const tc of this.activeToolCalls.values()) tc.dispose();
		this.tui.stop();
	}

	private async initializeAsync(): Promise<void> {
		const authStorage = AuthStorage.create();
		const config = loadConfig();

		// Apply saved Ninjas key to env before toolDeps are built
		if (!process.env.API_NINJAS_KEY && config.apiNinjasKey) {
			process.env.API_NINJAS_KEY = config.apiNinjasKey;
		}

		const needsLlm = !hasAnyLlmConfigured(authStorage);
		const needsNinjas = !process.env.API_NINJAS_KEY;

		if (needsLlm || needsNinjas) {
			await this.runSetup(authStorage, config, needsLlm, needsNinjas);
		}

		// Build the runtime now that env vars are in place
		this.runtime = this.runtimeFactory();

		this.tui.setFocus(this.input);
		this.footer.setStatus("ready");
		this.tui.requestRender();
	}

	private runSetup(
		authStorage: AuthStorage,
		config: ReturnType<typeof loadConfig>,
		needsLlm: boolean,
		needsNinjas: boolean,
	): Promise<void> {
		return new Promise((resolve) => {
			const screen = new SetupScreenComponent(this.tui, authStorage, needsLlm, needsNinjas, (result) => {
				overlayHandle.hide();

				// Persist LLM key to Pi's auth.json
				if (result.llmKey) {
					const detected = detectProvider(result.llmKey);
					authStorage.set(detected.provider, { type: "api_key", key: result.llmKey });
				}

				// Persist Ninjas key to our config + process.env
				if (result.ninjasKey) {
					process.env.API_NINJAS_KEY = result.ninjasKey;
					saveConfig({ ...config, apiNinjasKey: result.ninjasKey });
				}

				resolve();
			});

			const overlayHandle = this.tui.showOverlay(screen, {
				anchor: "top-center",
				width: "70%",
				minWidth: 62,
				margin: { top: 1 },
			});

			this.tui.setFocus(screen);
		});
	}

	private handleSubmit(value: string): void {
		const query = value.trim();
		if (!query || this.streaming || !this.runtime) return;

		this.input.setValue("");
		this.streaming = true;

		this.activeTurn.addChild(new UserMessageComponent(query));
		this.footer.setStatus("thinking…", true);
		this.tui.requestRender();

		this.abortController = new AbortController();
		this.runStream(query, this.abortController.signal).catch(() => {});
	}

	private async runStream(query: string, signal: AbortSignal): Promise<void> {
		this.streamingText = new StreamingTextComponent();
		this.activeTurn.addChild(this.streamingText);

		let concluded = false;

		try {
			for await (const event of this.runtime!.stream({ message: query })) {
				if (signal.aborted) break;

				switch (event.type) {
					case "text_delta":
						this.streamingText.append(event.delta);
						this.tui.requestRender();
						break;

					case "tool_start": {
						const toolCall = new ToolCallComponent(this.tui, event.toolName, event.inputSummary ?? "");
						this.activeToolCalls.set(event.toolName, toolCall);
						// Keep tools above the streaming text
						this.activeTurn.removeChild(this.streamingText);
						this.activeTurn.addChild(toolCall);
						this.activeTurn.addChild(this.streamingText);
						this.footer.setStatus(ansi.dim(`${event.toolName}…`), true);
						this.tui.requestRender();
						break;
					}

					case "tool_result": {
						const toolCall = this.activeToolCalls.get(event.toolName);
						if (toolCall) toolCall.setDone(event.resultSummary ?? "");
						this.footer.setStatus(ansi.dim("thinking…"), true);
						break;
					}

					case "evidence":
						// Informational only — no UI update needed
						break;

					case "final":
						this.activeTurn.removeChild(this.streamingText);
						this.activeTurn.addChild(new AnalystAnswerComponent(event.answer));
						concluded = true;
						this.tui.requestRender();
						break;

					case "error":
						this.activeTurn.removeChild(this.streamingText);
						this.activeTurn.addChild(new Text(ansi.red(`⚠  ${event.message}`), 1, 1));
						concluded = true;
						this.tui.requestRender();
						break;
				}
			}
		} catch (err) {
			if (!signal.aborted && !concluded) {
				const msg = err instanceof Error ? err.message : String(err);
				this.activeTurn.removeChild(this.streamingText);
				this.activeTurn.addChild(new Text(ansi.red(`⚠  ${msg}`), 1, 1));
				concluded = true;
				this.tui.requestRender();
			}
		}

		if (!concluded) {
			this.activeTurn.removeChild(this.streamingText);
			if (signal.aborted) {
				this.activeTurn.addChild(new Text(ansi.dimGray("(cancelled)"), 1, 0));
			} else if (this.streamingText.getContent()) {
				this.activeTurn.addChild(new Markdown(this.streamingText.getContent(), 1, 0, markdownTheme));
			}
		}

		this.finishTurn();
	}

	private finishTurn(): void {
		this.streaming = false;
		this.abortController = undefined;

		for (const child of [...this.activeTurn.children]) {
			this.chatHistory.addChild(child);
		}
		this.activeTurn.clear();

		for (const tc of this.activeToolCalls.values()) tc.dispose();
		this.activeToolCalls.clear();
		this.streamingText = undefined;

		this.footer.setStatus("ready");
		this.tui.requestRender();
	}

	private cancelStream(): void {
		this.abortController?.abort();
	}
}

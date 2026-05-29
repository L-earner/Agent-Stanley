import type { AuthStorage } from "@earendil-works/pi-coding-agent";
import { type Component, type Focusable, Input, matchesKey, type TUI } from "@earendil-works/pi-tui";
import { detectProvider } from "../config.ts";
import { ansi } from "../theme.ts";

export interface SetupResult {
	llmKey?: string;
	ninjasKey?: string;
}

type Field = "llm" | "ninjas";

/**
 * First-run setup overlay. Collects an LLM API key and/or API Ninjas key,
 * then calls onComplete so the parent can persist them and build the runtime.
 */
export class SetupScreenComponent implements Component, Focusable {
	private _focused = false;

	private llmInput: Input;
	private ninjasInput: Input;
	private activeField: Field;
	private detectedLabel = "";
	private tui: TUI;
	private onComplete: (result: SetupResult) => void;

	readonly needsLlm: boolean;
	readonly needsNinjas: boolean;

	constructor(
		tui: TUI,
		_authStorage: AuthStorage,
		needsLlm: boolean,
		needsNinjas: boolean,
		onComplete: (result: SetupResult) => void,
	) {
		this.tui = tui;
		this.needsLlm = needsLlm;
		this.needsNinjas = needsNinjas;
		this.onComplete = onComplete;
		this.activeField = needsLlm ? "llm" : "ninjas";

		this.llmInput = new Input();
		this.ninjasInput = new Input();

		this.llmInput.onSubmit = () => {
			const v = this.llmInput.getValue().trim();
			if (v) this.detectedLabel = detectProvider(v).label;
			if (this.needsNinjas) {
				this.switchTo("ninjas");
			} else {
				this.submit();
			}
		};

		this.ninjasInput.onSubmit = () => this.submit();
	}

	// Focusable — propagate to the active input so the cursor marker is positioned correctly
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.syncInputFocus();
	}

	private syncInputFocus(): void {
		this.llmInput.focused = this._focused && this.activeField === "llm";
		this.ninjasInput.focused = this._focused && this.activeField === "ninjas";
	}

	private switchTo(field: Field): void {
		this.activeField = field;
		this.syncInputFocus();
		this.tui.requestRender();
	}

	private submit(): void {
		const result: SetupResult = {};
		const llmVal = this.llmInput.getValue().trim();
		const ninjasVal = this.ninjasInput.getValue().trim();
		if (llmVal) result.llmKey = llmVal;
		if (ninjasVal) result.ninjasKey = ninjasVal;
		this.onComplete(result);
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.onComplete({});
			return;
		}
		if (matchesKey(data, "tab") || matchesKey(data, "shift+tab")) {
			if (this.needsLlm && this.needsNinjas) {
				this.switchTo(this.activeField === "llm" ? "ninjas" : "llm");
			}
			return;
		}
		if (this.activeField === "llm") {
			this.llmInput.handleInput(data);
			const v = this.llmInput.getValue().trim();
			this.detectedLabel = v.length > 3 ? detectProvider(v).label : "";
		} else {
			this.ninjasInput.handleInput(data);
		}
		this.tui.requestRender();
	}

	invalidate(): void {
		this.llmInput.invalidate();
		this.ninjasInput.invalidate();
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const pad = "  ";
		const divider = ansi.dimGray("─".repeat(Math.max(1, width)));

		const push = (line = "") => lines.push(line);

		push(divider);
		push();
		push(`${pad}${ansi.bold(ansi.cyan("Finance Research Analyst — Setup"))}`);
		push(`${pad}${ansi.dim("Configure API keys below, or press Esc to skip and rely on environment variables.")}`);
		push();

		// LLM section
		if (this.needsLlm) {
			push(`${pad}${ansi.bold("LLM Provider API Key")}`);
			push(`${pad}${ansi.dim("Accepted prefixes:")}`);
			push(`${pad}  ${ansi.gray("sk-ant-…")}   Anthropic (Claude)`);
			push(`${pad}  ${ansi.gray("sk-…")}       OpenAI (GPT)`);
			push(`${pad}  ${ansi.gray("AIza…")}      Google (Gemini)`);
			push(`${pad}  ${ansi.gray("sk-or-…")}    OpenRouter`);
			push(`${pad}  ${ansi.gray("gsk_…")}      Groq`);
			push();
			const llmLines = this.llmInput.render(width - 4);
			const cursor = this.activeField === "llm" ? ansi.green("▶") : " ";
			for (const l of llmLines) lines.push(`${pad}${cursor} ${l}`);
			if (this.detectedLabel) {
				push(`${pad}   ${ansi.green("✓")} ${ansi.cyan(this.detectedLabel)}`);
			} else {
				push();
			}
			push();
		} else {
			push(`${pad}${ansi.green("✓")}  LLM provider already configured`);
			push();
		}

		// Ninjas section
		if (this.needsNinjas) {
			push(`${pad}${ansi.bold("API Ninjas Key")}`);
			push(`${pad}${ansi.dim("Needed for SEC filings and earnings transcripts.")}`);
			push(`${pad}${ansi.dim("Free tier available — sign up at")} ${ansi.underline("https://api-ninjas.com")}`);
			push();
			const ninjasLines = this.ninjasInput.render(width - 4);
			const cursor = this.activeField === "ninjas" ? ansi.green("▶") : " ";
			for (const l of ninjasLines) lines.push(`${pad}${cursor} ${l}`);
			push();
		} else {
			push(`${pad}${ansi.green("✓")}  API Ninjas key already configured`);
			push();
		}

		// Key hints
		const parts: string[] = [];
		if (this.needsLlm && this.needsNinjas) parts.push(`${ansi.dim("Tab")} switch field`);
		parts.push(`${ansi.dim("Enter")} save & launch`);
		parts.push(`${ansi.dim("Esc")} skip`);
		push(`${pad}${parts.join("   ")}`);
		push();
		push(divider);

		return lines;
	}
}

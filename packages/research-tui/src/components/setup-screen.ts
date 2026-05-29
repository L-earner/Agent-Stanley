import type { AuthStorage } from "@earendil-works/pi-coding-agent";
import { type Component, type Focusable, Input, matchesKey, type TUI } from "@earendil-works/pi-tui";
import { detectProvider } from "../config.ts";
import { theme } from "../theme.ts";

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
		const divider = theme.dim("─".repeat(Math.max(1, width)));

		const push = (line = "") => lines.push(line);

		push(divider);
		push();
		push(`${pad}${theme.accentBold("Finance Research Analyst — Setup")}`);
		push(`${pad}${theme.dim("Configure API keys below, or press Esc to skip and rely on environment variables.")}`);
		push();

		// LLM section
		if (this.needsLlm) {
			push(`${pad}${theme.bold("LLM Provider API Key")}`);
			push(`${pad}${theme.dim("Accepted prefixes:")}`);
			push(`${pad}  ${theme.muted("sk-ant-…")}   Anthropic (Claude)`);
			push(`${pad}  ${theme.muted("sk-…")}       OpenAI (GPT)`);
			push(`${pad}  ${theme.muted("AIza…")}      Google (Gemini)`);
			push(`${pad}  ${theme.muted("sk-or-…")}    OpenRouter`);
			push(`${pad}  ${theme.muted("gsk_…")}      Groq`);
			push();
			const llmLines = this.llmInput.render(width - 4);
			const cursor = this.activeField === "llm" ? theme.success("▶") : " ";
			for (const l of llmLines) lines.push(`${pad}${cursor} ${l}`);
			if (this.detectedLabel) {
				push(`${pad}   ${theme.success("✓")} ${theme.accent(this.detectedLabel)}`);
			} else {
				push();
			}
			push();
		} else {
			push(`${pad}${theme.success("✓")}  LLM provider already configured`);
			push();
		}

		// Ninjas section
		if (this.needsNinjas) {
			push(`${pad}${theme.bold("API Ninjas Key")}`);
			push(`${pad}${theme.dim("Needed for SEC filings and earnings transcripts.")}`);
			push(`${pad}${theme.dim("Free tier available — sign up at")} ${theme.underline("https://api-ninjas.com")}`);
			push();
			const ninjasLines = this.ninjasInput.render(width - 4);
			const cursor = this.activeField === "ninjas" ? theme.success("▶") : " ";
			for (const l of ninjasLines) lines.push(`${pad}${cursor} ${l}`);
			push();
		} else {
			push(`${pad}${theme.success("✓")}  API Ninjas key already configured`);
			push();
		}

		// Key hints
		const parts: string[] = [];
		if (this.needsLlm && this.needsNinjas) parts.push(`${theme.dim("Tab")} switch field`);
		parts.push(`${theme.dim("Enter")} save & launch`);
		parts.push(`${theme.dim("Esc")} skip`);
		push(`${pad}${parts.join("   ")}`);
		push();
		push(divider);

		return lines;
	}
}

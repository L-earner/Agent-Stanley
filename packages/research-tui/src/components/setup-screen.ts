import type { AuthStorage } from "@earendil-works/pi-coding-agent";
import { type Component, type Focusable, getKeybindings, Input, type TUI } from "@earendil-works/pi-tui";
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
		const keybindings = getKeybindings();

		if (keybindings.matches(data, "tui.select.cancel")) {
			this.onComplete({});
			return;
		}
		if (keybindings.matches(data, "tui.input.tab")) {
			if (this.needsLlm && this.needsNinjas) {
				this.switchTo(this.activeField === "llm" ? "ninjas" : "llm");
			}
			return;
		}
		if (keybindings.matches(data, "tui.select.up")) {
			if (this.needsLlm) this.switchTo("llm");
			return;
		}
		if (keybindings.matches(data, "tui.select.down")) {
			if (this.needsNinjas) this.switchTo("ninjas");
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

	private fieldTitle(field: Field, title: string, index: number, total: number): string {
		const marker = this.activeField === field ? theme.success("▶") : " ";
		const label = `${marker} ${index}/${total} ${title}`;
		return this.activeField === field ? theme.accentBold(label) : theme.bold(label);
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

		const totalFields = Number(this.needsLlm) + Number(this.needsNinjas);
		let fieldIndex = 1;

		// LLM section
		if (this.needsLlm) {
			push(`${pad}${this.fieldTitle("llm", "LLM Provider API Key", fieldIndex++, totalFields)}`);
			push(`${pad}${theme.dim("Accepted prefixes:")}`);
			push(`${pad}  ${theme.muted("sk-ant-…")}   Anthropic (Claude)`);
			push(`${pad}  ${theme.muted("sk-…")}       OpenAI (GPT)`);
			push(`${pad}  ${theme.muted("AIza…")}      Google (Gemini)`);
			push(`${pad}  ${theme.muted("sk-or-…")}    OpenRouter`);
			push(`${pad}  ${theme.muted("gsk_…")}      Groq`);
			push();
			const llmLines = this.llmInput.render(width - 4);
			const cursor = this.activeField === "llm" ? theme.success("›") : " ";
			for (const l of llmLines) lines.push(`${pad}${cursor} ${l}`);
			if (this.detectedLabel) {
				push(`${pad}   ${theme.success("✓")} ${theme.accent(this.detectedLabel)}`);
			} else {
				push(`${pad}   ${theme.dim("Enter moves to the next field")}`);
			}
			push();
		} else {
			push(`${pad}${theme.success("✓")}  LLM provider already configured`);
			push();
		}

		// Ninjas section
		if (this.needsNinjas) {
			push(`${pad}${this.fieldTitle("ninjas", "API Ninjas Key", fieldIndex++, totalFields)}`);
			push(`${pad}${theme.dim("Needed for SEC filings and earnings transcripts.")}`);
			push(`${pad}${theme.dim("Free tier available — sign up at")} ${theme.underline("https://api-ninjas.com")}`);
			push();
			const ninjasLines = this.ninjasInput.render(width - 4);
			const cursor = this.activeField === "ninjas" ? theme.success("›") : " ";
			for (const l of ninjasLines) lines.push(`${pad}${cursor} ${l}`);
			push(`${pad}   ${theme.dim("Enter saves and launches")}`);
			push();
		} else {
			push(`${pad}${theme.success("✓")}  API Ninjas key already configured`);
			push();
		}

		// Key hints
		const parts: string[] = [];
		if (this.needsLlm && this.needsNinjas) parts.push(`${theme.dim("Up/Down or Tab")} switch field`);
		parts.push(`${theme.dim("Enter")} continue/save`);
		parts.push(`${theme.dim("Esc")} skip`);
		push(`${pad}${parts.join("   ")}`);
		push();
		push(divider);

		return lines;
	}
}

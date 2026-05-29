import { type Component, type TUI, truncateToWidth } from "@earendil-works/pi-tui";
import { ansi } from "../theme.ts";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_MS = 80;

export type ToolStatus = "running" | "done" | "error";

export class ToolCallComponent implements Component {
	private toolName: string;
	private inputSummary: string;
	private resultSummary = "";
	private status: ToolStatus = "running";
	private frameIndex = 0;
	private timer?: NodeJS.Timeout;
	private tui: TUI;

	constructor(tui: TUI, toolName: string, inputSummary = "") {
		this.tui = tui;
		this.toolName = toolName;
		this.inputSummary = inputSummary;
		this.timer = setInterval(() => {
			this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
			this.tui.requestRender();
		}, SPINNER_MS);
	}

	setDone(resultSummary = ""): void {
		this.stopAnimation();
		this.status = "done";
		this.resultSummary = resultSummary;
		this.tui.requestRender();
	}

	setError(message = ""): void {
		this.stopAnimation();
		this.status = "error";
		this.resultSummary = message;
		this.tui.requestRender();
	}

	private stopAnimation(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	dispose(): void {
		this.stopAnimation();
	}

	invalidate(): void {}

	render(width: number): string[] {
		const leftPad = "  ";

		let icon: string;
		if (this.status === "running") {
			icon = ansi.yellow(SPINNER_FRAMES[this.frameIndex] ?? "⠋");
		} else if (this.status === "done") {
			icon = ansi.boldGreen("✓");
		} else {
			icon = ansi.boldRed("✗");
		}

		const namePart = ansi.cyan(this.toolName);

		let detail: string;
		if (this.status === "running") {
			detail = this.inputSummary ? ansi.dim(this.inputSummary) : "";
		} else if (this.status === "done") {
			const summary = this.resultSummary || this.inputSummary;
			detail = ansi.gray(summary);
		} else {
			const summary = this.resultSummary || "failed";
			detail = ansi.red(summary);
		}

		const sep = detail ? "  " : "";
		const line = `${leftPad}${icon}  ${namePart}${sep}${detail}`;
		return [truncateToWidth(line, width)];
	}
}

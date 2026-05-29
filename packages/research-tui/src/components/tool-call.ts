import { Box, Container, Spacer, Text, type TUI } from "@earendil-works/pi-tui";
import { theme } from "../theme.ts";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_MS = 80;

export type ToolStatus = "running" | "done" | "error";

/**
 * Single tool-call row rendered inside a coloured background box, matching Pi's
 * ToolExecutionComponent style (toolPendingBg / toolSuccessBg / toolErrorBg).
 */
export class ToolCallComponent extends Container {
	private box: Box;
	private lineText: Text;
	private timer?: NodeJS.Timeout;
	private frameIndex = 0;
	private status: ToolStatus = "running";
	private toolName: string;
	private inputSummary: string;
	private resultSummary = "";
	private tui: TUI;

	constructor(tui: TUI, toolName: string, inputSummary = "") {
		super();
		this.tui = tui;
		this.toolName = toolName;
		this.inputSummary = inputSummary;

		this.lineText = new Text("", 0, 0);
		this.box = new Box(1, 1, (s: string) => theme.toolPendingBg(s));
		this.box.addChild(this.lineText);

		this.addChild(new Spacer(1));
		this.addChild(this.box);

		this.updateDisplay();

		this.timer = setInterval(() => {
			this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
			this.updateDisplay();
		}, SPINNER_MS);
	}

	setDone(resultSummary = ""): void {
		this.stopAnimation();
		this.status = "done";
		this.resultSummary = resultSummary;
		this.updateDisplay();
	}

	setError(message = ""): void {
		this.stopAnimation();
		this.status = "error";
		this.resultSummary = message;
		this.updateDisplay();
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

	private updateDisplay(): void {
		let icon: string;

		if (this.status === "running") {
			this.box.setBgFn((s) => theme.toolPendingBg(s));
			icon = theme.warning(SPINNER_FRAMES[this.frameIndex] ?? "⠋");
		} else if (this.status === "done") {
			this.box.setBgFn((s) => theme.toolSuccessBg(s));
			icon = theme.success("✓");
		} else {
			this.box.setBgFn((s) => theme.toolErrorBg(s));
			icon = theme.error("✗");
		}

		const name = theme.bold(theme.toolTitle(this.toolName));

		let detail: string;
		if (this.status === "running") {
			detail = this.inputSummary ? theme.dim(this.inputSummary) : "";
		} else if (this.status === "done") {
			detail = theme.toolOutput(this.resultSummary || this.inputSummary);
		} else {
			detail = theme.error(this.resultSummary || "failed");
		}

		const sep = detail ? "  " : "";
		this.lineText.setText(`${icon}  ${name}${sep}${detail}`);
		this.tui.requestRender();
	}
}

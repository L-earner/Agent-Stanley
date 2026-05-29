import { type Component, truncateToWidth } from "@earendil-works/pi-tui";
import { ansi } from "../theme.ts";

const HINT_IDLE = `${ansi.dim("Ctrl+C")} ${ansi.gray("exit")}  ${ansi.dim("Ctrl+L")} ${ansi.gray("redraw")}`;
const HINT_STREAMING = `${ansi.dim("Ctrl+C")} ${ansi.gray("cancel")}`;

export class FooterComponent implements Component {
	private status = "ready";
	private streaming = false;

	setStatus(status: string, streaming = false): void {
		this.status = status;
		this.streaming = streaming;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const divider = ansi.dimGray("─".repeat(Math.max(1, width)));
		const hints = this.streaming ? HINT_STREAMING : HINT_IDLE;
		const label = `  ${ansi.bold(ansi.cyan("Finance Research Analyst"))}  ${ansi.dim("·")}  ${ansi.gray(this.status)}`;
		const statusLine = truncateToWidth(`${label}    ${hints}`, width);
		return [divider, statusLine, ""];
	}
}

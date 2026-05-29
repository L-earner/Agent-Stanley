import { type Component, truncateToWidth } from "@earendil-works/pi-tui";
import { theme } from "../theme.ts";

const HINTS_IDLE = `${theme.dim("Ctrl+C")} exit   ${theme.dim("Ctrl+L")} redraw`;
const HINTS_STREAMING = `${theme.dim("Ctrl+C")} cancel`;

/**
 * Two-line footer below the input — mirrors Pi's footer style.
 * Line 1: app name · status
 * Line 2: keybinding hints
 */
export class FooterComponent implements Component {
	private status = "ready";
	private streaming = false;
	private model = "";

	setStatus(status: string, streaming = false): void {
		this.status = status;
		this.streaming = streaming;
	}

	setModel(model: string): void {
		this.model = model;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const hints = this.streaming ? HINTS_STREAMING : HINTS_IDLE;
		const appName = theme.dim("Finance Research Analyst");
		const sep = theme.dim(" · ");
		const status = theme.muted(this.status);
		const left = `  ${appName}${sep}${status}`;
		const right = this.model ? `  ${theme.dim(this.model)}` : "";
		const line1 = truncateToWidth(`${left}${right}`, width);
		const line2 = `  ${hints}`;
		return [line1, line2];
	}
}

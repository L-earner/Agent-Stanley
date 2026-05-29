import { type Component, Markdown } from "@earendil-works/pi-tui";
import { markdownTheme } from "../theme.ts";

export class StreamingTextComponent implements Component {
	private markdown: Markdown;
	private buffer = "";

	constructor() {
		this.markdown = new Markdown("", 1, 0, markdownTheme);
	}

	append(delta: string): void {
		this.buffer += delta;
		this.markdown.setText(this.buffer);
	}

	getContent(): string {
		return this.buffer;
	}

	render(width: number): string[] {
		return this.markdown.render(width);
	}

	invalidate(): void {
		this.markdown.invalidate();
	}
}

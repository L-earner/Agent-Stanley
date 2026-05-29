import { Box, Container, Markdown, Spacer } from "@earendil-works/pi-tui";
import { markdownTheme, theme } from "../theme.ts";

/**
 * User query rendered with a dark background box — mirrors Pi's UserMessageComponent.
 */
export class UserMessageComponent extends Container {
	constructor(message: string) {
		super();
		this.addChild(new Spacer(1));
		const box = new Box(1, 1, (s: string) => theme.userMsgBg(s));
		box.addChild(
			new Markdown(message, 0, 0, markdownTheme, {
				color: (s: string) => theme.text(s),
			}),
		);
		this.addChild(box);
	}
}

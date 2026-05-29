import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { ansi } from "../theme.ts";

export class UserMessageComponent extends Container {
	constructor(message: string) {
		super();
		this.addChild(new Spacer(1));
		const label = ansi.bold(ansi.cyan("You"));
		this.addChild(new Text(`${label}  ${message}`, 1, 0));
	}
}

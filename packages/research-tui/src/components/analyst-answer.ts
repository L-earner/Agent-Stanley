import type { AnalystAnswer } from "@earendil-works/pi-research-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { ansi, markdownTheme } from "../theme.ts";

function buildKeyPointsMd(answer: AnalystAnswer): string {
	const evidenceToNum = new Map<string, number>();
	for (let i = 0; i < answer.sources.length; i++) {
		evidenceToNum.set(answer.sources[i].evidenceId, i + 1);
	}

	const items = answer.keyPoints.map((kp) => {
		const refs = kp.evidenceIds
			.map((id) => (evidenceToNum.has(id) ? `[${evidenceToNum.get(id)}]` : null))
			.filter(Boolean)
			.join(" ");
		return `- ${kp.claim}${refs ? ` ${refs}` : ""}`;
	});

	return `**Key Points**\n${items.join("\n")}`;
}

function buildTableMd(table: NonNullable<AnalystAnswer["tables"]>[number]): string {
	const header = `| ${table.columns.join(" | ")} |`;
	const sep = `| ${table.columns.map(() => "---").join(" | ")} |`;
	const rows = table.rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
	return `**${table.title}**\n\n${header}\n${sep}\n${rows}`;
}

function buildSourcesText(answer: AnalystAnswer): string {
	const lines = answer.sources.map((s, i) => {
		const loc = s.locator ? `  ${ansi.dimGray(s.locator)}` : "";
		const url = s.url ? `  ${ansi.dimGray(s.url)}` : "";
		return `  ${ansi.gray(`[${i + 1}]`)} ${ansi.bold(s.title)}  ${ansi.dim(`(${s.sourceType})`)}${loc}${url}`;
	});
	return `${ansi.dim("Sources")}\n${lines.join("\n")}`;
}

export class AnalystAnswerComponent extends Container {
	constructor(answer: AnalystAnswer) {
		super();

		// Main answer text
		this.addChild(new Spacer(1));
		this.addChild(new Markdown(answer.answer, 1, 0, markdownTheme));

		// Key points
		if (answer.keyPoints.length > 0) {
			this.addChild(new Spacer(1));
			this.addChild(new Markdown(buildKeyPointsMd(answer), 1, 0, markdownTheme));
		}

		// Tables
		if (answer.tables && answer.tables.length > 0) {
			for (const table of answer.tables) {
				this.addChild(new Spacer(1));
				this.addChild(new Markdown(buildTableMd(table), 1, 0, markdownTheme));
			}
		}

		// Caveats
		if (answer.caveats.length > 0) {
			this.addChild(new Spacer(1));
			const caveatText = answer.caveats.map((c) => `*${c}*`).join("\n\n");
			this.addChild(new Markdown(caveatText, 1, 0, markdownTheme));
		}

		// Sources
		if (answer.sources.length > 0) {
			this.addChild(new Spacer(1));
			this.addChild(new Text(buildSourcesText(answer), 1, 0));
		}

		// Verification warnings (only when something was flagged)
		if (!answer.verification.supported || answer.verification.warnings.length > 0) {
			this.addChild(new Spacer(1));
			const warnings = answer.verification.warnings.map((w) => `⚠  ${w}`).join("\n");
			this.addChild(new Text(ansi.yellow(warnings || "⚠  Answer could not be fully verified."), 1, 0));
		}

		this.addChild(new Spacer(1));
	}
}

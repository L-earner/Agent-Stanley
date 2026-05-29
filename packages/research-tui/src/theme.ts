import type { MarkdownTheme } from "@earendil-works/pi-tui";

const R = "\x1b[0m";

export const ansi = {
	bold: (s: string) => `\x1b[1m${s}${R}`,
	dim: (s: string) => `\x1b[2m${s}${R}`,
	italic: (s: string) => `\x1b[3m${s}${R}`,
	underline: (s: string) => `\x1b[4m${s}${R}`,
	green: (s: string) => `\x1b[32m${s}${R}`,
	red: (s: string) => `\x1b[31m${s}${R}`,
	yellow: (s: string) => `\x1b[33m${s}${R}`,
	cyan: (s: string) => `\x1b[36m${s}${R}`,
	blue: (s: string) => `\x1b[34m${s}${R}`,
	gray: (s: string) => `\x1b[90m${s}${R}`,
	white: (s: string) => `\x1b[97m${s}${R}`,
	boldCyan: (s: string) => `\x1b[1;36m${s}${R}`,
	boldGreen: (s: string) => `\x1b[1;32m${s}${R}`,
	boldRed: (s: string) => `\x1b[1;31m${s}${R}`,
	dimGray: (s: string) => `\x1b[2;90m${s}${R}`,
};

export const markdownTheme: MarkdownTheme = {
	heading: (s) => `\x1b[1;36m${s}${R}`,
	link: (s) => `\x1b[36m${s}${R}`,
	linkUrl: (s) => `\x1b[2;90m${s}${R}`,
	code: (s) => `\x1b[33m${s}${R}`,
	codeBlock: (s) => `\x1b[2m${s}${R}`,
	codeBlockBorder: (s) => `\x1b[90m${s}${R}`,
	quote: (s) => `\x1b[2m${s}${R}`,
	quoteBorder: (s) => `\x1b[90m${s}${R}`,
	hr: (s) => `\x1b[2;90m${s}${R}`,
	listBullet: (s) => `\x1b[36m${s}${R}`,
	bold: (s) => `\x1b[1m${s}${R}`,
	italic: (s) => `\x1b[3m${s}${R}`,
	strikethrough: (s) => `\x1b[9m${s}${R}`,
	underline: (s) => `\x1b[4m${s}${R}`,
};

import type { MarkdownTheme } from "@earendil-works/pi-tui";

// 256-color ANSI helpers (matches Pi's dark.json palette)
const R = "\x1b[0m";
const fg = (code: number, s: string) => `\x1b[38;5;${code}m${s}${R}`;
const bg = (code: number, s: string) => `\x1b[48;5;${code}m${s}${R}`;
const attr = (code: number, s: string) => `\x1b[${code}m${s}${R}`;

// Semantic palette — matches Pi dark.json colors
// accent #8abeb7 → 109, border #5f87ff → 69, text #d4d4d4 → 253
// dim #666666 → 242, success #b5bd68 → 143, error #cc6666 → 167
// warning #ffff00 → 226, userMsgBg #343541 → 237
// toolPendingBg #282832 → 236, toolSuccessBg #283228 → 236 (dark green tint)
// toolErrorBg #3c2828 → 236 (dark red tint) — separate via fg color
// mdHeading #f0c674 → 222, mdCode #8abeb7 → 109

export const theme = {
	// Foreground colors
	accent: (s: string) => fg(109, s), // #8abeb7 teal
	border: (s: string) => fg(69, s), // #5f87ff blue
	text: (s: string) => fg(253, s), // #d4d4d4 light gray
	dim: (s: string) => fg(242, s), // #666666 mid gray
	muted: (s: string) => fg(244, s), // #808080 gray
	success: (s: string) => fg(143, s), // #b5bd68 green
	error: (s: string) => fg(167, s), // #cc6666 red
	warning: (s: string) => fg(226, s), // #ffff00 yellow
	toolTitle: (s: string) => fg(253, s), // same as text
	toolOutput: (s: string) => fg(244, s), // gray

	// Modifiers
	bold: (s: string) => attr(1, s),
	italic: (s: string) => attr(3, s),
	underline: (s: string) => attr(4, s),

	// Backgrounds  (applied to a full padded line — Box handles the fill)
	userMsgBg: (s: string) => bg(237, s), // #343541 dark blue-gray
	toolPendingBg: (s: string) => bg(236, s), // #282832 very dark
	toolSuccessBg: (s: string) => bg(22, s), // very dark green
	toolErrorBg: (s: string) => bg(52, s), // very dark red

	// Convenience combinators
	accentBold: (s: string) => fg(109, attr(1, s)),
	dimBorder: (s: string) => fg(242, s),
};

// Shorthand for backwards-compat with existing component imports
export const ansi = {
	bold: theme.bold,
	dim: theme.dim,
	italic: theme.italic,
	underline: theme.underline,
	green: theme.success,
	red: theme.error,
	yellow: theme.warning,
	cyan: theme.accent,
	blue: theme.border,
	gray: theme.muted,
	white: theme.text,
	boldCyan: theme.accentBold,
	boldGreen: (s: string) => fg(143, attr(1, s)),
	boldRed: (s: string) => fg(167, attr(1, s)),
	dimGray: theme.dim,
};

export const markdownTheme: MarkdownTheme = {
	heading: (s) => fg(222, attr(1, s)), // #f0c674 gold bold
	link: (s) => fg(110, s), // #81a2be blue
	linkUrl: (s) => fg(242, s), // dim
	code: (s) => fg(109, s), // accent teal
	codeBlock: (s) => fg(143, s), // green
	codeBlockBorder: (s) => fg(244, s), // gray
	quote: (s) => fg(244, s),
	quoteBorder: (s) => fg(244, s),
	hr: (s) => fg(242, s),
	listBullet: (s) => fg(109, s), // accent
	bold: (s) => attr(1, s),
	italic: (s) => attr(3, s),
	strikethrough: (s) => attr(9, s),
	underline: (s) => attr(4, s),
};

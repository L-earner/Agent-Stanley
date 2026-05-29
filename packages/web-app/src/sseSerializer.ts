import type { ResearchAgentEvent } from "@earendil-works/pi-research-agent";

/** Convert a ResearchAgentEvent to an SSE frame string. */
export function serializeEvent(event: ResearchAgentEvent): string {
	return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** Terminal SSE frame — signals the client that the stream is finished. */
export const SSE_DONE = "event: done\ndata: {}\n\n";

/** HTTP headers required for a Server-Sent Events response. */
export const SSE_HEADERS: Record<string, string> = {
	"Content-Type": "text/event-stream",
	"Cache-Control": "no-cache",
	Connection: "keep-alive",
	"Access-Control-Allow-Origin": "*",
};

/**
 * Parse a raw SSE frame string back into { event, data } for testing.
 * Input is one complete frame (two newlines at the end are stripped first).
 */
export function parseFrame(frame: string): { event: string; data: unknown } | null {
	const lines = frame.trim().split("\n");
	let event = "";
	let rawData = "";
	for (const line of lines) {
		if (line.startsWith("event: ")) event = line.slice(7);
		else if (line.startsWith("data: ")) rawData = line.slice(6);
	}
	if (!event) return null;
	try {
		return { event, data: JSON.parse(rawData) };
	} catch {
		return { event, data: rawData };
	}
}

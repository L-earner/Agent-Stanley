import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * Stub tool used in Phase 1 smoke tests to verify the agent runtime accepts custom tools.
 * Replace with real finance tools in Phase 7.
 */
export function createEchoResearchTool() {
	return defineTool({
		name: "echo_research_tool",
		label: "Echo Research",
		description: "Echoes back the input. Used for smoke testing the research agent runtime.",
		parameters: Type.Object({
			message: Type.String({ description: "Message to echo" }),
		}),
		execute: async (_toolCallId, params) => {
			return {
				content: [{ type: "text", text: `[echo] ${params.message}` }],
				details: { message: params.message },
			};
		},
	});
}

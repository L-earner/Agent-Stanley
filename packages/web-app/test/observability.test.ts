import { describe, expect, it } from "vitest";
import { createRequestTrace, finishTraceFields, recordAgentEvent } from "../src/observability.ts";

describe("web app observability", () => {
	it("tracks request metadata and event counts without storing full message text", () => {
		const trace = createRequestTrace("What is Apple's gross margin?", "req-1");

		recordAgentEvent(trace, { type: "tool_start", toolName: "compute_metric" });
		recordAgentEvent(trace, { type: "tool_result", toolName: "compute_metric" });
		recordAgentEvent(trace, { type: "text_delta", delta: "Gross margin was" });

		const fields = finishTraceFields(trace);

		expect(fields.requestId).toBe("req-1");
		expect(fields.messageChars).toBe(29);
		expect(fields.eventCounts).toEqual({ tool_start: 1, tool_result: 1, text_delta: 1 });
		expect(JSON.stringify(fields)).not.toContain("Apple");
	});
});

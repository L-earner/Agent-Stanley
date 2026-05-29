import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createComputeMetricTool } from "./computeMetricTool.ts";
import { createGetXbrlFactsTool } from "./getXbrlFactsTool.ts";
import { createIngestCompanyFilingsTool } from "./ingestCompanyFilingsTool.ts";
import { createListFilingsTool } from "./listFilingsTool.ts";
import { createResolveCompanyTool } from "./resolveCompanyTool.ts";
import { createRetrieveFilingPassagesTool } from "./retrieveFilingPassagesTool.ts";
import { createRetrieveTranscriptPassagesTool } from "./retrieveTranscriptPassagesTool.ts";
import type { FinanceToolDeps } from "./toolDeps.ts";

export { computeMetricToolCore } from "./computeMetricTool.ts";
export { getXbrlFactsToolCore } from "./getXbrlFactsTool.ts";
export { ingestCompanyFilingsCore } from "./ingestCompanyFilingsTool.ts";
export { listFilingsCore } from "./listFilingsTool.ts";
export { resolveCompanyCore } from "./resolveCompanyTool.ts";
export { retrieveFilingPassagesCore } from "./retrieveFilingPassagesTool.ts";
export { retrieveTranscriptPassagesCore } from "./retrieveTranscriptPassagesTool.ts";
export type { FinanceToolDeps } from "./toolDeps.ts";

const FINANCE_TOOL_NAMES = [
	"resolve_company",
	"list_filings",
	"ingest_company_filings",
	"retrieve_filing_passages",
	"get_xbrl_facts",
	"compute_metric",
	"retrieve_transcript_passages",
	// submit_answer is created per-session by PiResearchAgentRuntime, not listed here
] as const;

export type FinanceToolName = (typeof FINANCE_TOOL_NAMES)[number];

/**
 * Build the complete set of finance tools for the research agent.
 * Pass undefined only in smoke tests that check tool names without exercising tool logic.
 */
export function buildFinanceTools(deps?: FinanceToolDeps): ToolDefinition[] {
	if (!deps) {
		return FINANCE_TOOL_NAMES.map((name) => ({
			name,
			label: name,
			description: `${name} (stub — pass FinanceToolDeps to PiResearchAgentRuntime)`,
			parameters: { type: "object" as const, properties: {}, required: [] } as any,
			execute: async () => ({
				content: [{ type: "text" as const, text: `${name}: tool deps not configured` }],
				details: {},
				isError: true,
			}),
		}));
	}
	return [
		createResolveCompanyTool(deps),
		createListFilingsTool(deps),
		createIngestCompanyFilingsTool(deps),
		createRetrieveFilingPassagesTool(deps),
		createGetXbrlFactsTool(deps),
		createComputeMetricTool(deps),
		createRetrieveTranscriptPassagesTool({ chunkRepo: deps.transcriptChunkRepo }),
	];
}

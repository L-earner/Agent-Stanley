import { defineTool } from "@earendil-works/pi-coding-agent";
import type { EmbeddingProvider, FilingChunkRepository, SectionType } from "@earendil-works/pi-research-db";
import { hybridSearch } from "@earendil-works/pi-research-db";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export type RetrieveFilingPassagesInput = {
	companyId: string;
	query: string;
	topK?: number;
	sectionTypes?: string[];
	forms?: string[];
	filingIds?: string[];
};

export type FilingPassage = {
	text: string;
	evidenceId: string;
	sectionType?: string;
	form: string;
	filingDate: string;
	score: number;
	filingId: string;
};

export type RetrieveFilingPassagesResult = {
	passages: FilingPassage[];
	totalChunksSearched: number;
};

export async function retrieveFilingPassagesCore(
	input: RetrieveFilingPassagesInput,
	deps: { chunkRepo: FilingChunkRepository; embeddingProvider: EmbeddingProvider | null },
): Promise<RetrieveFilingPassagesResult> {
	const { companyId, query, topK = 10, sectionTypes, forms, filingIds } = input;

	const allChunks = await deps.chunkRepo.find({ companyId });

	const results = await hybridSearch(query, allChunks, deps.embeddingProvider, {
		topK,
		sectionTypes: sectionTypes as SectionType[] | undefined,
		forms,
		filingIds,
	});

	const passages: FilingPassage[] = results.map((r) => ({
		text: r.chunk.text,
		evidenceId: r.chunk.id,
		sectionType: r.chunk.sectionType,
		form: r.chunk.form,
		filingDate: r.chunk.filingDate,
		score: r.score,
		filingId: r.chunk.filingId,
	}));

	return { passages, totalChunksSearched: allChunks.length };
}

// ---------------------------------------------------------------------------
// Pi tool wrapper
// ---------------------------------------------------------------------------

export function createRetrieveFilingPassagesTool(deps: {
	chunkRepo: FilingChunkRepository;
	embeddingProvider: EmbeddingProvider | null;
}) {
	return defineTool({
		name: "retrieve_filing_passages",
		label: "Retrieve Filing Passages",
		description:
			"Search for relevant passages in SEC filings using hybrid BM25 + vector search. Returns text passages with evidence IDs for citation. Always cite evidenceId in your answer.",
		promptSnippet: "retrieve_filing_passages(companyId, query) — search filing text and get evidence IDs",
		promptGuidelines: [
			"Always call retrieve_filing_passages before making claims about qualitative filing content.",
			"Include evidenceId in every factual claim derived from filing text.",
		],
		parameters: Type.Object({
			companyId: Type.String({ description: "Company ID from resolve_company or ingest_company_filings" }),
			query: Type.String({ description: "Natural-language search query, e.g. 'revenue growth drivers'" }),
			topK: Type.Optional(Type.Number({ description: "Max passages to return (default 10)", default: 10 })),
			sectionTypes: Type.Optional(
				Type.Array(Type.String(), {
					description: "Filter to specific section types: mda, risk_factors, financial_statements, business, etc.",
				}),
			),
			forms: Type.Optional(Type.Array(Type.String(), { description: "Filter to specific form types: 10-K, 10-Q" })),
			filingIds: Type.Optional(Type.Array(Type.String(), { description: "Filter to specific filing IDs" })),
		}),
		execute: async (_toolCallId, params) => {
			try {
				const result = await retrieveFilingPassagesCore(params, deps);
				return {
					content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
					details: result,
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text" as const, text: `Error: ${msg}` }],
					details: { error: msg } as unknown as RetrieveFilingPassagesResult,
					isError: true,
				};
			}
		},
	});
}

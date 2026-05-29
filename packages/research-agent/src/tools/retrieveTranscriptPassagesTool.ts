import { defineTool } from "@earendil-works/pi-coding-agent";
import type { SpeakerRole, TranscriptChunkRepository, TranscriptSection } from "@earendil-works/pi-research-db";
import { searchTranscriptChunks } from "@earendil-works/pi-transcript-ingestion";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export type RetrieveTranscriptPassagesInput = {
	companyId: string;
	query: string;
	topK?: number;
	sections?: string[];
	speakerRoles?: string[];
	fiscalYear?: number;
	fiscalPeriod?: string;
};

export type TranscriptPassage = {
	text: string;
	evidenceId: string;
	speaker?: string;
	speakerRole?: string;
	section: string;
	eventDate: string;
	score: number;
	transcriptId: string;
};

export type RetrieveTranscriptPassagesResult = {
	passages: TranscriptPassage[];
	totalChunksSearched: number;
};

export async function retrieveTranscriptPassagesCore(
	input: RetrieveTranscriptPassagesInput,
	deps: { chunkRepo: TranscriptChunkRepository },
): Promise<RetrieveTranscriptPassagesResult> {
	const { companyId, query, topK = 10, sections, speakerRoles, fiscalYear, fiscalPeriod } = input;

	let allChunks = await deps.chunkRepo.find({ companyId });

	// Apply fiscal year/period pre-filters if provided
	if (fiscalYear != null) allChunks = allChunks.filter((c) => c.fiscalYear === fiscalYear);
	if (fiscalPeriod) allChunks = allChunks.filter((c) => c.fiscalPeriod === fiscalPeriod);

	const results = searchTranscriptChunks(query, allChunks, {
		topK,
		sections: sections as TranscriptSection[] | undefined,
		speakerRoles: speakerRoles as SpeakerRole[] | undefined,
	});

	const passages: TranscriptPassage[] = results.map((r) => ({
		text: r.chunk.text,
		evidenceId: r.chunk.id,
		speaker: r.chunk.speaker,
		speakerRole: r.chunk.speakerRole,
		section: r.chunk.section,
		eventDate: r.chunk.eventDate,
		score: r.score,
		transcriptId: r.chunk.transcriptId,
	}));

	return { passages, totalChunksSearched: allChunks.length };
}

// ---------------------------------------------------------------------------
// Pi tool wrapper
// ---------------------------------------------------------------------------

export function createRetrieveTranscriptPassagesTool(deps: { chunkRepo: TranscriptChunkRepository }) {
	return defineTool({
		name: "retrieve_transcript_passages",
		label: "Retrieve Transcript Passages",
		description:
			"Search for relevant passages in earnings call transcripts. Returns speaker attribution, section (prepared_remarks / qa), and evidenceId for citation. Use for qualitative commentary, guidance, and management tone.",
		promptSnippet: "retrieve_transcript_passages(companyId, query) — search earnings call transcripts",
		promptGuidelines: [
			"Use retrieve_transcript_passages for management commentary, forward guidance, or qualitative statements.",
			"Always include evidenceId and speaker attribution when citing transcript passages.",
		],
		parameters: Type.Object({
			companyId: Type.String({ description: "Company ID from resolve_company or ingest_company_filings" }),
			query: Type.String({ description: "Natural-language query, e.g. 'services revenue growth guidance'" }),
			topK: Type.Optional(Type.Number({ description: "Max passages to return (default 10)", default: 10 })),
			sections: Type.Optional(
				Type.Array(Type.String(), {
					description: "Filter by section: prepared_remarks, qa, or unknown",
				}),
			),
			speakerRoles: Type.Optional(
				Type.Array(Type.String(), {
					description: "Filter by speaker role: CEO, CFO, Analyst, Operator, Other",
				}),
			),
			fiscalYear: Type.Optional(Type.Number({ description: "Filter to a specific fiscal year" })),
			fiscalPeriod: Type.Optional(
				Type.String({ description: "Filter to a specific fiscal period: Q1, Q2, Q3, Q4" }),
			),
		}),
		execute: async (_toolCallId, params) => {
			try {
				const result = await retrieveTranscriptPassagesCore(params, deps);
				return {
					content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
					details: result,
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text" as const, text: `Error: ${msg}` }],
					details: { error: msg } as unknown as RetrieveTranscriptPassagesResult,
					isError: true,
				};
			}
		},
	});
}

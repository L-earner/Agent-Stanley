export type Evidence = {
	id: string;
	sourceType: "filing" | "xbrl_fact" | "transcript" | "uploaded_document";
	companyId: string;
	title: string;
	snippet: string;
	sourceUrl?: string;
	sourceLocator?: string;
	filingId?: string;
	transcriptId?: string;
	xbrlFactId?: string;
	metadata: Record<string, unknown>;
};

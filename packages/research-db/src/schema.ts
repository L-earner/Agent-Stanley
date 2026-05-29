// ---------------------------------------------------------------------------
// Core domain types for the financial research data layer.
// These are plain TypeScript types — no ORM dependency here.
// The actual DB schema and migrations live alongside the chosen adapter.
// ---------------------------------------------------------------------------

export type Company = {
	id: string;
	cik: string; // 10 digits with leading zeros, e.g. "0000320193"
	ticker?: string;
	name: string;
	exchange?: string;
	sic?: string;
	sicDescription?: string;
	createdAt: string;
	updatedAt: string;
};

export type Filing = {
	id: string;
	companyId: string;
	cik: string;
	accessionNumber: string; // with dashes, e.g. "0000320193-23-000077"
	accessionNumberNoDashes: string; // e.g. "0000320193230000077"
	form: "10-K" | "10-Q" | "8-K" | string;
	filingDate: string; // ISO date
	reportDate?: string; // ISO date
	fiscalYear?: number;
	fiscalPeriod?: "FY" | "Q1" | "Q2" | "Q3" | "Q4";
	primaryDocument?: string;
	primaryDocumentUrl?: string;
	secIndexUrl?: string;
	createdAt: string;
	updatedAt: string;
};

export type SectionType =
	| "business"
	| "risk_factors"
	| "mda"
	| "market_risk"
	| "financial_statements"
	| "legal_proceedings"
	| "controls_and_procedures"
	| "other";

export type FilingSection = {
	id: string;
	filingId: string;
	sectionType: SectionType;
	itemLabel?: string; // e.g. "Item 1A"
	title?: string;
	text: string;
	html?: string;
	charStart?: number;
	charEnd?: number;
	sourceUrl?: string;
};

export type FilingChunk = {
	id: string;
	companyId: string;
	filingId: string;
	sectionId?: string;
	form: string;
	filingDate: string;
	fiscalYear?: number;
	fiscalPeriod?: string;
	sectionType?: SectionType;
	text: string;
	textHash: string; // SHA-256 hex — used to avoid duplicates
	tokenCount?: number;
	embedding?: number[];
	sourceUrl?: string;
	sourceLocator?: string; // item label, anchor, char range, page number, etc.
	createdAt: string;
};

export type XbrlFact = {
	id: string;
	companyId: string;
	cik: string;
	taxonomy: "us-gaap" | "dei" | string;
	concept: string; // e.g. "Revenues"
	label?: string;
	description?: string;
	unit: string; // e.g. "USD", "shares"
	value: number | string;
	startDate?: string; // ISO date — for duration facts
	endDate?: string; // ISO date — for duration facts
	instantDate?: string; // ISO date — for instant facts
	fiscalYear?: number;
	fiscalPeriod?: string; // "FY", "Q1", etc.
	form?: string;
	accessionNumber?: string;
	frame?: string; // e.g. "CY2023Q4I"
	filed?: string; // ISO date
	source: "sec_companyfacts" | "sec_companyconcept" | string;
};

export type Transcript = {
	id: string;
	companyId: string;
	eventDate: string; // ISO date
	fiscalYear?: number;
	fiscalPeriod?: string;
	title?: string;
	provider: string; // "fixture", "uploaded", or licensed vendor name
	sourceUrl?: string;
	licenseNotes?: string;
	createdAt: string;
};

export type SpeakerRole = "CEO" | "CFO" | "Analyst" | "Operator" | "Other";
export type TranscriptSection = "prepared_remarks" | "qa" | "unknown";

export type TranscriptChunk = {
	id: string;
	transcriptId: string;
	companyId: string;
	eventDate: string;
	fiscalYear?: number;
	fiscalPeriod?: string;
	section: TranscriptSection;
	speaker?: string;
	speakerRole?: SpeakerRole;
	text: string;
	textHash: string;
	embedding?: number[];
	sourceUrl?: string;
	sourceLocator?: string;
};

export type EvidenceSourceType = "filing" | "xbrl_fact" | "transcript" | "uploaded_document";

export type Evidence = {
	id: string;
	sourceType: EvidenceSourceType;
	companyId: string;
	title: string;
	snippet: string;
	sourceUrl?: string;
	sourceLocator?: string;
	filingId?: string;
	filingChunkId?: string;
	transcriptId?: string;
	transcriptChunkId?: string;
	xbrlFactId?: string;
	metadata: Record<string, unknown>;
};

export type AnalystAnswer = {
	answer: string;
	keyPoints: Array<{
		claim: string;
		evidenceIds: string[];
	}>;
	tables?: Array<{
		title: string;
		columns: string[];
		rows: string[][];
		evidenceIds: string[];
	}>;
	caveats: string[];
	sources: Array<{
		evidenceId: string;
		title: string;
		sourceType: string;
		url?: string;
		locator?: string;
	}>;
	verification: {
		supported: boolean;
		warnings: string[];
	};
};

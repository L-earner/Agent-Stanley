import type { SpeakerRole, Transcript, TranscriptChunk, TranscriptSection } from "../schema.ts";

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

export type TranscriptFilters = {
	companyId?: string;
	fiscalYear?: number;
	fiscalPeriod?: string;
	provider?: string;
};

export interface TranscriptRepository {
	create(data: Omit<Transcript, "createdAt">): Promise<Transcript>;
	findById(id: string): Promise<Transcript | undefined>;
	find(filters?: TranscriptFilters): Promise<Transcript[]>;
	findLatest(companyId: string): Promise<Transcript | undefined>;
	delete(id: string): Promise<void>;
}

export class InMemoryTranscriptRepository implements TranscriptRepository {
	private readonly store = new Map<string, Transcript>();

	async create(data: Omit<Transcript, "createdAt">): Promise<Transcript> {
		const transcript: Transcript = { ...data, createdAt: new Date().toISOString() };
		this.store.set(transcript.id, transcript);
		return transcript;
	}

	async findById(id: string): Promise<Transcript | undefined> {
		return this.store.get(id);
	}

	async find(filters?: TranscriptFilters): Promise<Transcript[]> {
		let results = Array.from(this.store.values());
		if (!filters) return results;
		if (filters.companyId) results = results.filter((t) => t.companyId === filters.companyId);
		if (filters.fiscalYear != null) results = results.filter((t) => t.fiscalYear === filters.fiscalYear);
		if (filters.fiscalPeriod) results = results.filter((t) => t.fiscalPeriod === filters.fiscalPeriod);
		if (filters.provider) results = results.filter((t) => t.provider === filters.provider);
		return results;
	}

	async findLatest(companyId: string): Promise<Transcript | undefined> {
		const matches = (await this.find({ companyId })).sort((a, b) => b.eventDate.localeCompare(a.eventDate));
		return matches[0];
	}

	async delete(id: string): Promise<void> {
		this.store.delete(id);
	}
}

// ---------------------------------------------------------------------------
// TranscriptChunk
// ---------------------------------------------------------------------------

export type TranscriptChunkFilters = {
	transcriptId?: string;
	companyId?: string;
	fiscalYear?: number;
	fiscalPeriod?: string;
	section?: TranscriptSection;
	speakerRole?: SpeakerRole;
};

export interface TranscriptChunkRepository {
	create(data: TranscriptChunk): Promise<TranscriptChunk>;
	createBatch(data: TranscriptChunk[]): Promise<TranscriptChunk[]>;
	findById(id: string): Promise<TranscriptChunk | undefined>;
	findByTextHash(textHash: string): Promise<TranscriptChunk | undefined>;
	find(filters?: TranscriptChunkFilters): Promise<TranscriptChunk[]>;
	deleteByTranscriptId(transcriptId: string): Promise<number>;
}

export class InMemoryTranscriptChunkRepository implements TranscriptChunkRepository {
	private readonly store = new Map<string, TranscriptChunk>();

	async create(data: TranscriptChunk): Promise<TranscriptChunk> {
		this.store.set(data.id, data);
		return data;
	}

	async createBatch(data: TranscriptChunk[]): Promise<TranscriptChunk[]> {
		return Promise.all(data.map((d) => this.create(d)));
	}

	async findById(id: string): Promise<TranscriptChunk | undefined> {
		return this.store.get(id);
	}

	async findByTextHash(textHash: string): Promise<TranscriptChunk | undefined> {
		for (const c of this.store.values()) {
			if (c.textHash === textHash) return c;
		}
		return undefined;
	}

	async find(filters?: TranscriptChunkFilters): Promise<TranscriptChunk[]> {
		let results = Array.from(this.store.values());
		if (!filters) return results;
		if (filters.transcriptId) results = results.filter((c) => c.transcriptId === filters.transcriptId);
		if (filters.companyId) results = results.filter((c) => c.companyId === filters.companyId);
		if (filters.fiscalYear != null) results = results.filter((c) => c.fiscalYear === filters.fiscalYear);
		if (filters.fiscalPeriod) results = results.filter((c) => c.fiscalPeriod === filters.fiscalPeriod);
		if (filters.section) results = results.filter((c) => c.section === filters.section);
		if (filters.speakerRole) results = results.filter((c) => c.speakerRole === filters.speakerRole);
		return results;
	}

	async deleteByTranscriptId(transcriptId: string): Promise<number> {
		let count = 0;
		for (const [id, chunk] of this.store.entries()) {
			if (chunk.transcriptId === transcriptId) {
				this.store.delete(id);
				count++;
			}
		}
		return count;
	}
}

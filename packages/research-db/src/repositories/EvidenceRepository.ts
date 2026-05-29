import type { Evidence, EvidenceSourceType } from "../schema.ts";

export type EvidenceFilters = {
	companyId?: string;
	sourceType?: EvidenceSourceType;
	filingId?: string;
	transcriptId?: string;
	ids?: string[];
};

export interface EvidenceRepository {
	create(data: Evidence): Promise<Evidence>;
	createBatch(data: Evidence[]): Promise<Evidence[]>;
	findById(id: string): Promise<Evidence | undefined>;
	findByIds(ids: string[]): Promise<Evidence[]>;
	find(filters?: EvidenceFilters): Promise<Evidence[]>;
	deleteByFilingId(filingId: string): Promise<number>;
	deleteByTranscriptId(transcriptId: string): Promise<number>;
}

export class InMemoryEvidenceRepository implements EvidenceRepository {
	private readonly store = new Map<string, Evidence>();

	async create(data: Evidence): Promise<Evidence> {
		this.store.set(data.id, data);
		return data;
	}

	async createBatch(data: Evidence[]): Promise<Evidence[]> {
		return Promise.all(data.map((d) => this.create(d)));
	}

	async findById(id: string): Promise<Evidence | undefined> {
		return this.store.get(id);
	}

	async findByIds(ids: string[]): Promise<Evidence[]> {
		return ids.flatMap((id) => {
			const e = this.store.get(id);
			return e ? [e] : [];
		});
	}

	async find(filters?: EvidenceFilters): Promise<Evidence[]> {
		let results = Array.from(this.store.values());
		if (!filters) return results;
		if (filters.companyId) results = results.filter((e) => e.companyId === filters.companyId);
		if (filters.sourceType) results = results.filter((e) => e.sourceType === filters.sourceType);
		if (filters.filingId) results = results.filter((e) => e.filingId === filters.filingId);
		if (filters.transcriptId) results = results.filter((e) => e.transcriptId === filters.transcriptId);
		if (filters.ids?.length) results = results.filter((e) => filters.ids!.includes(e.id));
		return results;
	}

	async deleteByFilingId(filingId: string): Promise<number> {
		let count = 0;
		for (const [id, ev] of this.store.entries()) {
			if (ev.filingId === filingId) {
				this.store.delete(id);
				count++;
			}
		}
		return count;
	}

	async deleteByTranscriptId(transcriptId: string): Promise<number> {
		let count = 0;
		for (const [id, ev] of this.store.entries()) {
			if (ev.transcriptId === transcriptId) {
				this.store.delete(id);
				count++;
			}
		}
		return count;
	}
}

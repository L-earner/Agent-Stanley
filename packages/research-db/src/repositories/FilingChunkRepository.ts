import type { FilingChunk, SectionType } from "../schema.ts";

export type FilingChunkFilters = {
	companyId?: string;
	filingId?: string;
	sectionId?: string;
	form?: string;
	fiscalYear?: number;
	fiscalPeriod?: string;
	sectionType?: SectionType;
};

export interface FilingChunkRepository {
	create(data: Omit<FilingChunk, "createdAt">): Promise<FilingChunk>;
	createBatch(data: Array<Omit<FilingChunk, "createdAt">>): Promise<FilingChunk[]>;
	findById(id: string): Promise<FilingChunk | undefined>;
	findByTextHash(textHash: string): Promise<FilingChunk | undefined>;
	find(filters?: FilingChunkFilters): Promise<FilingChunk[]>;
	deleteByFilingId(filingId: string): Promise<number>; // returns count deleted
}

export class InMemoryFilingChunkRepository implements FilingChunkRepository {
	private readonly store = new Map<string, FilingChunk>();

	async create(data: Omit<FilingChunk, "createdAt">): Promise<FilingChunk> {
		const chunk: FilingChunk = { ...data, createdAt: new Date().toISOString() };
		this.store.set(chunk.id, chunk);
		return chunk;
	}

	async createBatch(data: Array<Omit<FilingChunk, "createdAt">>): Promise<FilingChunk[]> {
		return Promise.all(data.map((d) => this.create(d)));
	}

	async findById(id: string): Promise<FilingChunk | undefined> {
		return this.store.get(id);
	}

	async findByTextHash(textHash: string): Promise<FilingChunk | undefined> {
		for (const c of this.store.values()) {
			if (c.textHash === textHash) return c;
		}
		return undefined;
	}

	async find(filters?: FilingChunkFilters): Promise<FilingChunk[]> {
		let results = Array.from(this.store.values());
		if (!filters) return results;
		if (filters.companyId) results = results.filter((c) => c.companyId === filters.companyId);
		if (filters.filingId) results = results.filter((c) => c.filingId === filters.filingId);
		if (filters.sectionId) results = results.filter((c) => c.sectionId === filters.sectionId);
		if (filters.form) results = results.filter((c) => c.form === filters.form);
		if (filters.fiscalYear != null) results = results.filter((c) => c.fiscalYear === filters.fiscalYear);
		if (filters.fiscalPeriod) results = results.filter((c) => c.fiscalPeriod === filters.fiscalPeriod);
		if (filters.sectionType) results = results.filter((c) => c.sectionType === filters.sectionType);
		return results;
	}

	async deleteByFilingId(filingId: string): Promise<number> {
		let count = 0;
		for (const [id, chunk] of this.store.entries()) {
			if (chunk.filingId === filingId) {
				this.store.delete(id);
				count++;
			}
		}
		return count;
	}
}

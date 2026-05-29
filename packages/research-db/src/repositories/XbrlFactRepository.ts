import type { XbrlFact } from "../schema.ts";

export type XbrlFactFilters = {
	companyId?: string;
	cik?: string;
	taxonomy?: string;
	concept?: string;
	concepts?: string[];
	fiscalYear?: number;
	fiscalPeriod?: string;
	form?: string;
	unit?: string;
};

export interface XbrlFactRepository {
	create(data: XbrlFact): Promise<XbrlFact>;
	createBatch(data: XbrlFact[]): Promise<XbrlFact[]>;
	findById(id: string): Promise<XbrlFact | undefined>;
	find(filters?: XbrlFactFilters): Promise<XbrlFact[]>;
	deleteByCompanyId(companyId: string): Promise<number>;
}

export class InMemoryXbrlFactRepository implements XbrlFactRepository {
	private readonly store = new Map<string, XbrlFact>();

	async create(data: XbrlFact): Promise<XbrlFact> {
		this.store.set(data.id, data);
		return data;
	}

	async createBatch(data: XbrlFact[]): Promise<XbrlFact[]> {
		return Promise.all(data.map((d) => this.create(d)));
	}

	async findById(id: string): Promise<XbrlFact | undefined> {
		return this.store.get(id);
	}

	async find(filters?: XbrlFactFilters): Promise<XbrlFact[]> {
		let results = Array.from(this.store.values());
		if (!filters) return results;
		if (filters.companyId) results = results.filter((f) => f.companyId === filters.companyId);
		if (filters.cik) results = results.filter((f) => f.cik === filters.cik);
		if (filters.taxonomy) results = results.filter((f) => f.taxonomy === filters.taxonomy);
		if (filters.concept) results = results.filter((f) => f.concept === filters.concept);
		if (filters.concepts?.length) results = results.filter((f) => filters.concepts!.includes(f.concept));
		if (filters.fiscalYear != null) results = results.filter((f) => f.fiscalYear === filters.fiscalYear);
		if (filters.fiscalPeriod) results = results.filter((f) => f.fiscalPeriod === filters.fiscalPeriod);
		if (filters.form) results = results.filter((f) => f.form === filters.form);
		if (filters.unit) results = results.filter((f) => f.unit === filters.unit);
		return results;
	}

	async deleteByCompanyId(companyId: string): Promise<number> {
		let count = 0;
		for (const [id, fact] of this.store.entries()) {
			if (fact.companyId === companyId) {
				this.store.delete(id);
				count++;
			}
		}
		return count;
	}
}

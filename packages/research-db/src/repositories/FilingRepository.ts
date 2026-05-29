import type { Filing } from "../schema.ts";

export type FilingFilters = {
	companyId?: string;
	cik?: string;
	form?: string;
	fiscalYear?: number;
	fiscalPeriod?: string;
};

export interface FilingRepository {
	create(data: Omit<Filing, "createdAt" | "updatedAt">): Promise<Filing>;
	findById(id: string): Promise<Filing | undefined>;
	findByAccessionNumber(accessionNumber: string): Promise<Filing | undefined>;
	find(filters?: FilingFilters): Promise<Filing[]>;
	findLatest(companyId: string, form: string): Promise<Filing | undefined>;
	update(id: string, data: Partial<Omit<Filing, "id" | "createdAt">>): Promise<Filing | undefined>;
	delete(id: string): Promise<void>;
}

export class InMemoryFilingRepository implements FilingRepository {
	private readonly store = new Map<string, Filing>();

	async create(data: Omit<Filing, "createdAt" | "updatedAt">): Promise<Filing> {
		const now = new Date().toISOString();
		const filing: Filing = { ...data, createdAt: now, updatedAt: now };
		this.store.set(filing.id, filing);
		return filing;
	}

	async findById(id: string): Promise<Filing | undefined> {
		return this.store.get(id);
	}

	async findByAccessionNumber(accessionNumber: string): Promise<Filing | undefined> {
		for (const f of this.store.values()) {
			if (f.accessionNumber === accessionNumber || f.accessionNumberNoDashes === accessionNumber) return f;
		}
		return undefined;
	}

	async find(filters?: FilingFilters): Promise<Filing[]> {
		let results = Array.from(this.store.values());
		if (!filters) return results;
		if (filters.companyId) results = results.filter((f) => f.companyId === filters.companyId);
		if (filters.cik) results = results.filter((f) => f.cik === filters.cik);
		if (filters.form) results = results.filter((f) => f.form === filters.form);
		if (filters.fiscalYear != null) results = results.filter((f) => f.fiscalYear === filters.fiscalYear);
		if (filters.fiscalPeriod) results = results.filter((f) => f.fiscalPeriod === filters.fiscalPeriod);
		return results;
	}

	async findLatest(companyId: string, form: string): Promise<Filing | undefined> {
		const matches = (await this.find({ companyId, form })).sort((a, b) => b.filingDate.localeCompare(a.filingDate));
		return matches[0];
	}

	async update(id: string, data: Partial<Omit<Filing, "id" | "createdAt">>): Promise<Filing | undefined> {
		const existing = this.store.get(id);
		if (!existing) return undefined;
		const updated: Filing = { ...existing, ...data, id, updatedAt: new Date().toISOString() };
		this.store.set(id, updated);
		return updated;
	}

	async delete(id: string): Promise<void> {
		this.store.delete(id);
	}
}

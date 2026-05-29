import type { Company } from "../schema.ts";

export type CompanyFilters = {
	cik?: string;
	ticker?: string;
	name?: string; // substring match
};

export interface CompanyRepository {
	create(data: Omit<Company, "createdAt" | "updatedAt">): Promise<Company>;
	findById(id: string): Promise<Company | undefined>;
	findByCik(cik: string): Promise<Company | undefined>;
	findByTicker(ticker: string): Promise<Company | undefined>;
	find(filters?: CompanyFilters): Promise<Company[]>;
	update(id: string, data: Partial<Omit<Company, "id" | "createdAt">>): Promise<Company | undefined>;
	delete(id: string): Promise<void>;
}

export class InMemoryCompanyRepository implements CompanyRepository {
	private readonly store = new Map<string, Company>();

	async create(data: Omit<Company, "createdAt" | "updatedAt">): Promise<Company> {
		const now = new Date().toISOString();
		const company: Company = { ...data, createdAt: now, updatedAt: now };
		this.store.set(company.id, company);
		return company;
	}

	async findById(id: string): Promise<Company | undefined> {
		return this.store.get(id);
	}

	async findByCik(cik: string): Promise<Company | undefined> {
		for (const c of this.store.values()) {
			if (c.cik === cik) return c;
		}
		return undefined;
	}

	async findByTicker(ticker: string): Promise<Company | undefined> {
		const upper = ticker.toUpperCase();
		for (const c of this.store.values()) {
			if (c.ticker?.toUpperCase() === upper) return c;
		}
		return undefined;
	}

	async find(filters?: CompanyFilters): Promise<Company[]> {
		let results = Array.from(this.store.values());
		if (!filters) return results;
		if (filters.cik) results = results.filter((c) => c.cik === filters.cik);
		if (filters.ticker) results = results.filter((c) => c.ticker?.toUpperCase() === filters.ticker!.toUpperCase());
		if (filters.name) {
			const q = filters.name.toLowerCase();
			results = results.filter((c) => c.name.toLowerCase().includes(q));
		}
		return results;
	}

	async update(id: string, data: Partial<Omit<Company, "id" | "createdAt">>): Promise<Company | undefined> {
		const existing = this.store.get(id);
		if (!existing) return undefined;
		const updated: Company = { ...existing, ...data, id, updatedAt: new Date().toISOString() };
		this.store.set(id, updated);
		return updated;
	}

	async delete(id: string): Promise<void> {
		this.store.delete(id);
	}
}

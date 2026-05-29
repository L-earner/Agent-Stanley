/**
 * Token-bucket rate limiter.
 *
 * Callers await `throttle()` before each outbound request.
 * Excess calls queue and release as tokens refill.
 */
export class RateLimiter {
	private tokens: number;
	private readonly maxTokens: number;
	private readonly refillIntervalMs: number;
	private lastRefill: number;
	private readonly queue: Array<() => void> = [];

	constructor(maxRequestsPerSecond = 5) {
		if (maxRequestsPerSecond <= 0) throw new Error("maxRequestsPerSecond must be > 0");
		this.maxTokens = maxRequestsPerSecond;
		this.tokens = maxRequestsPerSecond;
		this.refillIntervalMs = 1000 / maxRequestsPerSecond;
		this.lastRefill = Date.now();
	}

	async throttle(): Promise<void> {
		this.refill();
		if (this.tokens >= 1) {
			this.tokens -= 1;
			return;
		}
		// No token available — queue until one refills.
		await new Promise<void>((resolve) => {
			this.queue.push(resolve);
		});
	}

	private refill(): void {
		const now = Date.now();
		const elapsed = now - this.lastRefill;
		const newTokens = Math.floor(elapsed / this.refillIntervalMs);
		if (newTokens > 0) {
			this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
			this.lastRefill = now;
			this.drainQueue();
		}
	}

	private drainQueue(): void {
		while (this.tokens >= 1 && this.queue.length > 0) {
			this.tokens -= 1;
			this.queue.shift()!();
		}
	}

	get pendingCount(): number {
		return this.queue.length;
	}
}

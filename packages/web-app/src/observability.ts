import type { ResearchAgentEvent } from "@earendil-works/pi-research-agent";

export type LogLevel = "info" | "warn" | "error";

export type ObservabilityLogger = {
	log(level: LogLevel, event: string, fields: Record<string, unknown>): void;
};

export type RequestTrace = {
	requestId: string;
	startedAt: number;
	messageChars: number;
	eventCounts: Record<string, number>;
};

export class ConsoleJsonLogger implements ObservabilityLogger {
	log(level: LogLevel, event: string, fields: Record<string, unknown>): void {
		const payload = {
			level,
			event,
			timestamp: new Date().toISOString(),
			...fields,
		};
		const line = JSON.stringify(payload);
		if (level === "error") {
			console.error(line);
		} else if (level === "warn") {
			console.warn(line);
		} else {
			console.log(line);
		}
	}
}

export function createNoopLogger(): ObservabilityLogger {
	return { log: () => {} };
}

export function createRequestTrace(message: string, requestId: string = crypto.randomUUID()): RequestTrace {
	return {
		requestId,
		startedAt: Date.now(),
		messageChars: message.length,
		eventCounts: {},
	};
}

export function recordAgentEvent(trace: RequestTrace, event: ResearchAgentEvent): void {
	trace.eventCounts[event.type] = (trace.eventCounts[event.type] ?? 0) + 1;
}

export function finishTraceFields(trace: RequestTrace): Record<string, unknown> {
	return {
		requestId: trace.requestId,
		durationMs: Date.now() - trace.startedAt,
		messageChars: trace.messageChars,
		eventCounts: trace.eventCounts,
	};
}

import type { Server } from "node:http";
import type { ResearchAgentEvent, ResearchAgentInput, ResearchAgentRuntime } from "@earendil-works/pi-research-agent";
import { afterEach, describe, expect, it } from "vitest";
import { createNoopLogger } from "../src/observability.ts";
import { createResearchServer } from "../src/server.ts";
import { parseFrame } from "../src/sseSerializer.ts";

class FakeRuntime implements ResearchAgentRuntime {
	readonly inputs: ResearchAgentInput[] = [];
	private readonly events: ResearchAgentEvent[];

	constructor(events: ResearchAgentEvent[]) {
		this.events = events;
	}

	async *stream(input: ResearchAgentInput): AsyncIterable<ResearchAgentEvent> {
		this.inputs.push(input);
		for (const event of this.events) {
			yield event;
		}
	}
}

const servers: Server[] = [];

afterEach(async () => {
	await Promise.all(
		servers.map(
			(server) =>
				new Promise<void>((resolve, reject) => {
					server.close((err) => (err ? reject(err) : resolve()));
				}),
		),
	);
	servers.length = 0;
});

async function startServer(runtime: ResearchAgentRuntime) {
	const server = createResearchServer({
		indexHtml: "<!doctype html><title>Test</title>",
		logger: createNoopLogger(),
		runtimeFactory: () => runtime,
	});
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Expected TCP server address");
	return `http://127.0.0.1:${address.port}`;
}

async function startServerWithThrowingRuntime(message: string) {
	const server = createResearchServer({
		indexHtml: "<!doctype html><title>Test</title>",
		logger: createNoopLogger(),
		runtimeFactory: () => {
			throw new Error(message);
		},
	});
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Expected TCP server address");
	return `http://127.0.0.1:${address.port}`;
}

function parseFrames(body: string) {
	return body
		.split("\n\n")
		.map((frame) => frame.trim())
		.filter(Boolean)
		.map((frame) => parseFrame(`${frame}\n\n`));
}

describe("research web server", () => {
	it("serves the chat shell", async () => {
		const runtime = new FakeRuntime([]);
		const baseUrl = await startServer(runtime);

		const response = await fetch(`${baseUrl}/`);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		expect(await response.text()).toContain("<title>Test</title>");
	});

	it("rejects invalid chat requests", async () => {
		const runtime = new FakeRuntime([]);
		const baseUrl = await startServer(runtime);

		const invalidJson = await fetch(`${baseUrl}/api/research/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{",
		});
		const missingMessage = await fetch(`${baseUrl}/api/research/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ message: "   " }),
		});

		expect(invalidJson.status).toBe(400);
		expect(await invalidJson.json()).toEqual({ error: "Invalid JSON body" });
		expect(missingMessage.status).toBe(400);
		expect(await missingMessage.json()).toEqual({ error: "message is required" });
	});

	it("streams research events as SSE frames", async () => {
		const runtime = new FakeRuntime([
			{ type: "tool_start", toolName: "resolve_company" },
			{ type: "text_delta", delta: "Looking at AAPL" },
			{
				type: "final",
				answer: {
					answer: "Apple revenue increased.",
					keyPoints: [{ claim: "Revenue increased.", evidenceIds: ["ev-1"] }],
					caveats: [],
					sources: [
						{
							evidenceId: "ev-1",
							title: "Apple 2023 10-K",
							sourceType: "filing",
							locator: "Item 8",
						},
					],
					verification: { supported: true, warnings: [] },
				},
			},
		]);
		const baseUrl = await startServer(runtime);

		const response = await fetch(`${baseUrl}/api/research/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ message: "Analyze AAPL revenue" }),
		});
		const frames = parseFrames(await response.text());

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");
		expect(runtime.inputs).toEqual([{ message: "Analyze AAPL revenue" }]);
		expect(frames.map((frame) => frame?.event)).toEqual(["tool_start", "text_delta", "final", "done"]);
		expect(frames[2]?.data).toMatchObject({
			type: "final",
			answer: { answer: "Apple revenue increased.", verification: { supported: true } },
		});
	});

	it("serializes runtime failures as error events", async () => {
		const runtime: ResearchAgentRuntime = {
			async *stream() {
				yield await Promise.reject(new Error("model unavailable"));
			},
		};
		const baseUrl = await startServer(runtime);

		const response = await fetch(`${baseUrl}/api/research/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ message: "Analyze AAPL revenue" }),
		});
		const frames = parseFrames(await response.text());

		expect(response.status).toBe(200);
		expect(frames.map((frame) => frame?.event)).toEqual(["error", "done"]);
		expect(frames[0]?.data).toEqual({ type: "error", message: "model unavailable" });
	});

	it("serializes runtime construction failures as error events", async () => {
		const baseUrl = await startServerWithThrowingRuntime("API_NINJAS_KEY is required");

		const response = await fetch(`${baseUrl}/api/research/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ message: "Analyze AAPL revenue" }),
		});
		const frames = parseFrames(await response.text());

		expect(response.status).toBe(200);
		expect(frames.map((frame) => frame?.event)).toEqual(["error", "done"]);
		expect(frames[0]?.data).toEqual({ type: "error", message: "API_NINJAS_KEY is required" });
	});
});

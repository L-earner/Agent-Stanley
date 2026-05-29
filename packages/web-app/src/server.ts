import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PiResearchAgentRuntime, type ResearchAgentRuntime } from "@earendil-works/pi-research-agent";
import {
	ConsoleJsonLogger,
	createRequestTrace,
	finishTraceFields,
	type ObservabilityLogger,
	recordAgentEvent,
} from "./observability.ts";
import { SSE_DONE, SSE_HEADERS, serializeEvent } from "./sseSerializer.ts";
import { buildToolDeps } from "./toolDeps.ts";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(__dirname, "../public/index.html"), "utf-8");

export type RuntimeFactory = () => ResearchAgentRuntime;

export type ResearchServerOptions = {
	runtimeFactory?: RuntimeFactory;
	indexHtml?: string;
	logger?: ObservabilityLogger;
	port?: number;
};

async function readBody(req: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks).toString("utf-8");
}

async function handleChat(
	req: IncomingMessage,
	res: ServerResponse,
	runtimeFactory: RuntimeFactory,
	logger: ObservabilityLogger,
): Promise<void> {
	let message: string;
	try {
		const body = JSON.parse(await readBody(req));
		message = String(body.message ?? "").trim();
	} catch {
		res.writeHead(400, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Invalid JSON body" }));
		return;
	}

	if (!message) {
		res.writeHead(400, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "message is required" }));
		return;
	}

	res.writeHead(200, SSE_HEADERS);
	const trace = createRequestTrace(message);
	logger.log("info", "research_chat_start", {
		requestId: trace.requestId,
		messageChars: trace.messageChars,
	});

	try {
		const runtime = runtimeFactory();
		for await (const event of runtime.stream({ message })) {
			if (res.writableEnded) break;
			recordAgentEvent(trace, event);
			res.write(serializeEvent(event));
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (!res.writableEnded) {
			recordAgentEvent(trace, { type: "error", message: msg });
			res.write(serializeEvent({ type: "error", message: msg }));
		}
		logger.log("error", "research_chat_error", {
			...finishTraceFields(trace),
			error: msg,
		});
	}

	if (!res.writableEnded) {
		res.write(SSE_DONE);
		res.end();
	}
	logger.log("info", "research_chat_end", finishTraceFields(trace));
}

export function createResearchServer(options: ResearchServerOptions = {}) {
	const port = options.port ?? PORT;
	const html = options.indexHtml ?? indexHtml;
	const logger = options.logger ?? new ConsoleJsonLogger();
	const runtimeFactory =
		options.runtimeFactory ??
		(() => {
			let toolDeps: ReturnType<typeof buildToolDeps> | null = null;
			return () => {
				toolDeps ??= buildToolDeps();
				return new PiResearchAgentRuntime({
					toolDeps,
					model: process.env.PI_RESEARCH_MODEL ?? process.env.PI_MODEL,
				});
			};
		})();

	return createServer(async (req, res) => {
		const url = new URL(req.url ?? "/", `http://localhost:${port}`);

		if (req.method === "OPTIONS") {
			res.writeHead(204, {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "POST, GET, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type",
			});
			res.end();
			return;
		}

		if (req.method === "GET" && url.pathname === "/") {
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(html);
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/research/chat") {
			await handleChat(req, res, runtimeFactory, logger);
			return;
		}

		res.writeHead(404, { "Content-Type": "text/plain" });
		res.end("Not found");
	});
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const server = createResearchServer();

	server.listen(PORT, "0.0.0.0", () => {
		console.log(`Finance Research Analyst running at http://localhost:${PORT}`);
		if (!process.env.API_NINJAS_KEY) {
			console.warn("  API_NINJAS_KEY not set — live SEC/transcript data unavailable");
		}
		if (!process.env.PI_RESEARCH_MODEL && !process.env.PI_MODEL) {
			console.warn("  PI_RESEARCH_MODEL not set — Pi will use its saved/default configured model");
		}
		console.warn(
			"  Configure any Pi-supported LLM provider via env/auth.json/models.json, e.g. OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY",
		);
	});
}

import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME_ENV = join(homedir(), ".agent-stanley");

const LLM_PROVIDERS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY"];

export type SavedKeyConfig = {
	provider: string;
	llmKey: string;
	ninjasKey: string;
	secAgent: string;
	model: string;
};

export type KeyStatus = {
	provider: string;
	model: string;
	hasLlmKey: boolean;
	hasNinjasKey: boolean;
	hasSecAgent: boolean;
};

function parseEnvFile(content: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let val = trimmed.slice(eq + 1).trim();
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
			val = val.slice(1, -1);
		}
		result[key] = val;
	}
	return result;
}

function toEnvLine(key: string, value: string): string {
	return `${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function readKeyStatus(): KeyStatus {
	let provider = "OPENAI_API_KEY";
	let hasLlmKey = false;
	for (const p of LLM_PROVIDERS) {
		if (process.env[p]) {
			provider = p;
			hasLlmKey = true;
			break;
		}
	}
	return {
		provider,
		hasLlmKey,
		hasNinjasKey: Boolean(process.env.API_NINJAS_KEY),
		hasSecAgent: Boolean(process.env.SEC_USER_AGENT),
		model: process.env.PI_RESEARCH_MODEL ?? process.env.PI_MODEL ?? "",
	};
}

export function saveKeys(config: SavedKeyConfig): void {
	if (!LLM_PROVIDERS.includes(config.provider)) {
		throw new Error(`Unknown provider: ${config.provider}`);
	}

	// Read existing file so we preserve keys we don't manage
	const existing: Record<string, string> = {};
	if (existsSync(HOME_ENV)) {
		try {
			Object.assign(existing, parseEnvFile(readFileSync(HOME_ENV, "utf-8")));
		} catch {
			// Ignore parse errors; start fresh
		}
	}

	// Remove all managed keys (one LLM provider replaces any previous one)
	for (const p of LLM_PROVIDERS) delete existing[p];
	delete existing.API_NINJAS_KEY;
	delete existing.SEC_USER_AGENT;
	delete existing.PI_RESEARCH_MODEL;

	if (config.llmKey) existing[config.provider] = config.llmKey;
	if (config.ninjasKey) existing.API_NINJAS_KEY = config.ninjasKey;
	if (config.secAgent) existing.SEC_USER_AGENT = config.secAgent;
	if (config.model) existing.PI_RESEARCH_MODEL = config.model;

	const content =
		Object.entries(existing)
			.filter(([, v]) => v)
			.map(([k, v]) => toEnvLine(k, v))
			.join("\n") + "\n";

	writeFileSync(HOME_ENV, content);
	try {
		chmodSync(HOME_ENV, 0o600);
	} catch {
		// chmod not supported on this platform; continue
	}

	// Update process.env immediately — next request picks up new keys without restart
	for (const p of LLM_PROVIDERS) delete process.env[p];
	if (config.llmKey) process.env[config.provider] = config.llmKey;

	if (config.ninjasKey) process.env.API_NINJAS_KEY = config.ninjasKey;
	else delete process.env.API_NINJAS_KEY;

	if (config.secAgent) process.env.SEC_USER_AGENT = config.secAgent;
	else delete process.env.SEC_USER_AGENT;

	if (config.model) process.env.PI_RESEARCH_MODEL = config.model;
	else delete process.env.PI_RESEARCH_MODEL;
}

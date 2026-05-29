import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AuthStorage, getAgentDir } from "@earendil-works/pi-coding-agent";

const CONFIG_FILE = join(getAgentDir(), "research-config.json");

export interface ResearchConfig {
	apiNinjasKey?: string;
}

export function loadConfig(): ResearchConfig {
	if (!existsSync(CONFIG_FILE)) return {};
	try {
		return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as ResearchConfig;
	} catch {
		return {};
	}
}

export function saveConfig(config: ResearchConfig): void {
	const dir = getAgentDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
	writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Check whether any LLM provider key is reachable — env var, auth.json OAuth token, or stored API key.
 */
export function hasAnyLlmConfigured(authStorage: AuthStorage): boolean {
	const providers = ["anthropic", "openai", "google", "openrouter", "groq", "deepseek"];
	return providers.some((p) => authStorage.hasAuth(p));
}

export interface DetectedProvider {
	provider: string;
	label: string;
}

/**
 * Guess which LLM provider an API key belongs to from its prefix.
 * Falls back to openrouter (accepts most provider keys via its proxy).
 */
export function detectProvider(key: string): DetectedProvider {
	const k = key.trim();
	if (k.startsWith("sk-ant-")) return { provider: "anthropic", label: "Anthropic (Claude)" };
	if (k.startsWith("sk-or-")) return { provider: "openrouter", label: "OpenRouter" };
	if (k.startsWith("AIza") || k.startsWith("ya29.")) return { provider: "google", label: "Google (Gemini)" };
	if (k.startsWith("gsk_")) return { provider: "groq", label: "Groq" };
	if (k.startsWith("sk-")) return { provider: "openai", label: "OpenAI" };
	return { provider: "openrouter", label: "OpenRouter (proxy)" };
}

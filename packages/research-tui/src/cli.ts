#!/usr/bin/env node
import { PiResearchAgentRuntime } from "@earendil-works/pi-research-agent";
import { ResearchTUI } from "./research-tui.ts";
import { buildToolDeps } from "./tool-deps.ts";

const tui = new ResearchTUI(() => {
	// Called after setup completes so env vars (API_NINJAS_KEY, etc.) are in place
	const toolDeps = buildToolDeps();
	return new PiResearchAgentRuntime({
		toolDeps,
		model: process.env.PI_RESEARCH_MODEL ?? process.env.PI_MODEL,
	});
});

tui.start();

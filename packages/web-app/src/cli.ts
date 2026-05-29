import { createResearchServer } from "./server.ts";

const port = parseInt(process.env.PORT ?? "3000", 10);
const server = createResearchServer({ port });

server.listen(port, "0.0.0.0", () => {
	console.log(`Finance Research Analyst running at http://localhost:${port}`);
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

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			"@earendil-works/pi-research-agent": resolve(__dirname, "../research-agent/src/index.ts"),
			"@earendil-works/pi-research-db": resolve(__dirname, "../research-db/src/index.ts"),
			"@earendil-works/pi-sec-ingestion": resolve(__dirname, "../sec-ingestion/src/index.ts"),
			"@earendil-works/pi-transcript-ingestion": resolve(__dirname, "../transcript-ingestion/src/index.ts"),
		},
	},
	test: {
		include: ["test/**/*.test.ts"],
	},
});

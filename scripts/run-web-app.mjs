import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const envFile = join(repoRoot, ".env");
const watch = process.argv.includes("--watch");

const args = [];
if (existsSync(envFile)) {
	args.push(`--env-file=${envFile}`);
} else {
	console.warn(".env not found. Continuing without it. Copy .env.example to .env to configure API keys.");
}
args.push("--import", "tsx/esm");
if (watch) args.push("--watch");
args.push("src/server.ts");

const child = spawn(process.execPath, args, {
	stdio: "inherit",
	cwd: join(repoRoot, "packages/web-app"),
	env: process.env,
});

child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 0);
});

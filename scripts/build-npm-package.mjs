import { chmodSync, cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";

const distDir = join(process.cwd(), "dist");
const publicDir = join(process.cwd(), "public");

rmSync(distDir, { recursive: true, force: true });
rmSync(publicDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

await build({
	entryPoints: ["packages/web-app/src/cli.ts"],
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node22",
	outfile: join(distDir, "agent-stanley.js"),
	banner: { js: "#!/usr/bin/env node" },
	external: [
		"@silvia-odwyer/photon-node",
		"cross-spawn",
		"hosted-git-info",
		"jiti",
		"proper-lockfile",
		"undici",
		"yaml",
	],
	logLevel: "info",
});
chmodSync(join(distDir, "agent-stanley.js"), 0o755);

cpSync("packages/web-app/public", publicDir, { recursive: true });

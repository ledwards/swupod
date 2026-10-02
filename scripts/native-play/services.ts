/** Run each local service independently using PTP's ignored .env.local. */
import dotenv from "dotenv";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  nativeConfig,
  verifyRuntimeRevision,
} from "../../src/services/play/native/runtimeClient";
const production = process.env.NODE_ENV === "production";
if (!production) {
  dotenv.config({ quiet: true });
  dotenv.config({ path: ".env.local", override: true, quiet: true });
}
const command = process.argv[2] ?? "check";
const config = nativeConfig(process.env, true);
function required(name: string) {
  const value = process.env[name];
  if (!value)
    throw Error(`Set ${name} in .env.local before starting this service.`);
  return value;
}
function local(value: string) {
  const u = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
    throw Error("Local service commands require loopback URLs.");
  return u;
}
function run(
  binary: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
) {
  const child = spawn(binary, args, { cwd, env, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => child.kill(signal));
  child.on("error", () => {
    console.error(
      "Service could not start. Check the configured executable and directory.",
    );
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
async function check(
  name: string,
  url: string,
  headers?: Record<string, string>,
) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(5000),
    redirect: "error",
  });
  if (!response.ok) throw Error(`${name} failed (HTTP ${response.status}).`);
  console.log(`PASS ${name}`);
}
try {
  if (command === "check") {
    // No game creation, credentials, or private hands are emitted by this check.
    await check("PTP", `${config.hostOrigin}/api/health`);
    await check("Purrgil public origin", `${config.publicOrigin}/health`);
    await check("Purrgil → Baize readiness", `${config.gatewayUrl}/ready`);
    await check("Baize readiness", `${config.baizeUrl}/readyz`, {
      authorization: `Bearer ${config.baizeKey}`,
    });
    const support = JSON.parse(readFileSync(config.supportPath, "utf8"));
    await verifyRuntimeRevision(config, support.engineRevision);
    console.log("PASS engine revision matches the support manifest");
    console.log("Browser entry: " + config.hostOrigin + "/limited/play");
  } else {
    if (production)
      throw Error(
        "Start production services using their own deployment entrypoints, not this local runner.",
      );
    for (const url of [
      config.hostOrigin,
      config.publicOrigin,
      config.gatewayUrl,
      config.baizeUrl,
    ])
      local(url);
    if (command === "purrgil") {
      const cwd = resolve(required("PURRGIL_REPO"));
      if (!existsSync(resolve(cwd, "dist/index.html")))
        throw Error("Build Purrgil first: npm run build in PURRGIL_REPO.");
      const settings = {
        origin: config.publicOrigin,
        hostOrigin: config.hostOrigin,
        issuer: "ptp",
        hostKey: config.gatewayKey,
        backendKey: config.baizeKey,
        backendUrl: config.baizeUrl,
        directory: resolve(required("PURRGIL_SESSION_DIR")),
        dist: resolve(cwd, "dist"),
        secure: false,
      };
      // Secrets travel in the child environment, never in command-line arguments.
      const source = `import {createApp} from ${JSON.stringify(pathToFileURL(resolve(cwd, "server/index.mjs")).href)}; const app=createApp(JSON.parse(process.env.PTP_LOCAL_GATEWAY_CONFIG)); await app.ready; app.server.listen(${Number(local(config.gatewayUrl).port || 80)},'127.0.0.1');`;
      run(process.execPath, ["--input-type=module", "-e", source], cwd, {
        ...process.env,
        PTP_LOCAL_GATEWAY_CONFIG: JSON.stringify(settings),
      });
    } else if (command === "baize") {
      const binary = resolve(required("BAIZE_BINARY"));
      required("BAIZE_ENGINE_REVISION");
      const directory = resolve(required("BAIZE_PVP_DATA_DIR"));
      run(binary, [], process.cwd(), {
        ...process.env,
        PORT: String(local(config.baizeUrl).port || 80),
        BAIZE_PVP_DATA_DIR: directory,
        BAIZE_PVP_ISSUER: "ptp",
      });
    } else throw Error("Usage: npm run play:check | play:purrgil | play:baize");
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Service check failed",
  );
  if (command === "check")
    console.error(
      "Start PTP with npm run dev, Baize with npm run play:baize, and Purrgil with npm run play:purrgil in separate terminals. See docs/operations/native-play-local.md.",
    );
  process.exitCode = 1;
}

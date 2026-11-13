#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLISHED_ENTRIES = new Set(["dist", "assets", "README.md", "package.json"]);
const LOOPBACK_HOST = "127.0.0.1";
const STARTUP_TIMEOUT_MS = 60_000;
const STARTUP_POLL_INTERVAL_MS = 500;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const WEB_APP_ROOT_ELEMENT = '<div id="root"></div>';
const SESSION_COOKIE_PREFIX = "forja_session=";
const COOKIE_ATTRIBUTE_SEPARATOR = ";";
const IS_WINDOWS = process.platform === "win32";

const workDir = mkdtempSync(path.join(tmpdir(), "forja-smoke-"));
try {
    await smokeTestPackage(workDir);
    console.log("Pacote verificado: instala, sobe e responde em /api/health e /.");
} catch (error) {
    console.error(`O smoke test do pacote falhou: ${describeError(error)}`);
    process.exitCode = 1;
} finally {
    rmSync(workDir, { recursive: true, force: true });
}

async function smokeTestPackage(workDir) {
    const manifest = readManifest(REPOSITORY_ROOT);
    const tarball = buildAndPack(workDir);
    assertOnlyPublishedEntries(tarball.files);

    const cliFile = installTarball(tarball.path, path.join(workDir, "install"), manifest.name);
    const dataDir = path.join(workDir, "data");
    const forja = await startForja(cliFile, dataDir);
    try {
        const sessionCookie = await checkWebApp(forja);
        await checkHealth(forja, sessionCookie, { version: manifest.version, dataDir });
    } finally {
        await stopForja(forja.process);
    }
}

function buildAndPack(destination) {
    runNpm(["run", "build"], { cwd: REPOSITORY_ROOT, stdio: "inherit" });
    // The build already ran above; prepack would run it again and mix its output into the JSON.
    const packOutput = runNpm(
        ["pack", "--ignore-scripts", "--json", "--pack-destination", destination],
        { cwd: REPOSITORY_ROOT, encoding: "utf8" },
    );
    const [packed] = JSON.parse(packOutput);

    return {
        path: path.join(destination, packed.filename),
        files: packed.files.map((file) => file.path),
    };
}

function assertOnlyPublishedEntries(files) {
    const unexpectedFiles = files.filter((file) => !PUBLISHED_ENTRIES.has(topLevelEntryOf(file)));
    if (unexpectedFiles.length > 0) {
        throw new Error(`o tarball tem arquivos fora do pacote: ${unexpectedFiles.join(", ")}`);
    }
}

function topLevelEntryOf(file) {
    const [entry = ""] = file.split("/");
    return entry;
}

function installTarball(tarballPath, installDir, packageName) {
    mkdirSync(installDir);
    writeFileSync(path.join(installDir, "package.json"), JSON.stringify({ private: true }));
    runNpm(["install", "--no-audit", "--no-fund", tarballPath], {
        cwd: installDir,
        stdio: "inherit",
    });

    const packageDir = path.join(installDir, "node_modules", packageName);
    return path.join(packageDir, readManifest(packageDir).bin.forja);
}

async function startForja(cliFile, dataDir) {
    const port = await findFreePort();
    const forjaProcess = spawn(
        process.execPath,
        [cliFile, "--no-open", "--data-dir", dataDir, "--port", String(port)],
        {
            env: { ...process.env, FORJA_AGENT_RUNTIME: "fake" },
            stdio: ["ignore", "inherit", "inherit"],
        },
    );

    return { process: forjaProcess, baseUrl: `http://${LOOPBACK_HOST}:${port}` };
}

// The session cookie comes with index.html, as in the browser: every /api route requires it.
async function checkWebApp(forja) {
    const response = await waitForWebApp(forja);
    const html = await response.text();
    if (!html.includes(WEB_APP_ROOT_ELEMENT)) {
        throw new Error("GET / não devolveu o index.html da interface");
    }

    return readSessionCookie(response);
}

async function waitForWebApp(forja) {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
        assertStillRunning(forja.process);
        const response = await fetchIfListening(`${forja.baseUrl}/`);
        if (response?.ok) {
            return response;
        }

        await sleep(STARTUP_POLL_INTERVAL_MS);
    }

    throw new Error(`a Forja não respondeu em ${STARTUP_TIMEOUT_MS / 1000} s`);
}

function assertStillRunning(forjaProcess) {
    if (forjaProcess.exitCode !== null) {
        throw new Error(`a Forja encerrou antes de responder (código ${forjaProcess.exitCode})`);
    }
}

async function fetchIfListening(url) {
    try {
        return await fetch(url);
    } catch {
        return undefined;
    }
}

function readSessionCookie(response) {
    const sessionCookie = response.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith(SESSION_COOKIE_PREFIX));
    if (sessionCookie === undefined) {
        throw new Error("GET / não entregou o cookie de sessão");
    }

    const [nameAndValue] = sessionCookie.split(COOKIE_ATTRIBUTE_SEPARATOR);
    return nameAndValue;
}

async function checkHealth(forja, sessionCookie, expected) {
    const response = await fetch(`${forja.baseUrl}/api/health`, {
        headers: { cookie: sessionCookie },
    });
    if (!response.ok) {
        throw new Error(`GET /api/health respondeu ${response.status}`);
    }

    const health = await response.json();
    const expectedHealth = { status: "ok", version: expected.version, dataDir: expected.dataDir };
    if (!isDeepStrictEqual(health, expectedHealth)) {
        throw new Error(`GET /api/health devolveu ${JSON.stringify(health)}`);
    }
}

async function stopForja(forjaProcess) {
    if (forjaProcess.exitCode !== null) {
        return;
    }

    const exited = once(forjaProcess, "exit");
    forjaProcess.kill("SIGTERM");
    const stoppedInTime = await Promise.race([
        exited.then(() => true),
        sleep(SHUTDOWN_TIMEOUT_MS).then(() => false),
    ]);
    if (!stoppedInTime) {
        forjaProcess.kill("SIGKILL");
        await exited;
    }
}

function findFreePort() {
    const server = createServer();
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, LOOPBACK_HOST, () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

function readManifest(packageDir) {
    return JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
}

function runNpm(args, options) {
    if (!IS_WINDOWS) {
        return execFileSync("npm", args, options);
    }

    // npm is a .cmd script on Windows, and Node only runs those through the shell.
    return execFileSync("npm", args.map(quoteForWindowsShell), { ...options, shell: true });
}

function quoteForWindowsShell(arg) {
    return `"${arg}"`;
}

function describeError(error) {
    return error instanceof Error ? error.message : String(error);
}

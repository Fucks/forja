import {
    checkNodeVersion,
    createAgentImageCheck,
    createForjaDiskUsageCheck,
    DIAGNOSTIC_CHECKS,
} from "@/server/diagnostics/diagnostic_checks.js";
import { createDiagnosticService } from "@/server/diagnostics/diagnostic_service.js";
import type { DiagnosticItem } from "@/shared/diagnostic_types.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeCommandRunner } from "@/test/fakes/fake_command_runner.js";

const CHECKED_AT = new Date("2026-06-01T10:00:00Z");
const CACHE_MS = 30_000;
const COMMAND_TIMEOUT_MS = 10_000;
const COMMAND_NOT_FOUND = 127;
const DOCKER_SERVER_VERSION_ARGS = ["version", "--format", "{{.Server.Version}}"];
const AGENT_IMAGE = "forja-agent:latest";
const IMAGE_NOT_FOUND = 1;
const BYTES_PER_MB = 1024 * 1024;

function scriptHealthyMachine(commands: FakeCommandRunner): void {
    commands.when("git", ["--version"]).returns({ stdout: "git version 2.47.1" });
    commands.when("docker", ["--version"]).returns({ stdout: "Docker version 27.3.1" });
    commands.when("docker", DOCKER_SERVER_VERSION_ARGS).returns({ stdout: "27.3.1" });
    commands.when("gh", ["--version"]).returns({ stdout: "gh version 2.63.0 (2024-11-27)" });
    commands.when("gh", ["auth", "status"]).returns({ stdout: "Logged in to github.com" });
}

function findItem(items: DiagnosticItem[], id: string): DiagnosticItem | undefined {
    return items.find((item) => item.id === id);
}

describe("DiagnosticService", () => {
    let commands: FakeCommandRunner;
    let clock: FakeClock;

    beforeEach(() => {
        commands = new FakeCommandRunner();
        scriptHealthyMachine(commands);
        clock = new FakeClock(CHECKED_AT);
    });

    function createService(): ReturnType<typeof createDiagnosticService> {
        return createDiagnosticService({ listChecks: () => DIAGNOSTIC_CHECKS, commands, clock });
    }

    it("reports every item as ok when the whole toolchain is ready", async () => {
        const service = createService();

        const report = await service.run();

        expect(report.checkedAt).toBe(CHECKED_AT.toISOString());
        expect(report.items.map((item) => [item.id, item.status])).toEqual([
            ["node", "ok"],
            ["git", "ok"],
            ["docker", "ok"],
            ["gh", "ok"],
            ["gh-auth", "ok"],
        ]);
    });

    it("reports Docker as an error with the fix to install it when the client is missing", async () => {
        commands.when("docker", ["--version"]).returns({ exitCode: COMMAND_NOT_FOUND });
        const service = createService();

        const report = await service.run();

        expect(findItem(report.items, "docker")).toMatchObject({
            status: "error",
            fix: "Instale o Docker Desktop",
        });
    });

    it("reports Docker as an error when the client is installed but the daemon is not running", async () => {
        commands.when("docker", DOCKER_SERVER_VERSION_ARGS).returns({
            exitCode: 1,
            stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock.",
        });
        const service = createService();

        const report = await service.run();

        expect(findItem(report.items, "docker")).toMatchObject({
            status: "error",
            detail: "Docker instalado mas não está rodando",
        });
    });

    it("warns that GitHub will not work when gh is not authenticated", async () => {
        commands.when("gh", ["auth", "status"]).returns({ exitCode: 1 });
        const service = createService();

        const report = await service.run();

        expect(findItem(report.items, "gh-auth")).toMatchObject({
            status: "warning",
            detail: "PRs e issues do GitHub não vão funcionar",
            fix: "Rode gh auth login",
        });
    });

    it("warns when gh is not installed", async () => {
        commands.when("gh", ["--version"]).returns({ exitCode: COMMAND_NOT_FOUND });
        const service = createService();

        const report = await service.run();

        expect(findItem(report.items, "gh")).toMatchObject({ status: "warning" });
    });

    it("reports a command that exceeds the timeout as an error naming the command", async () => {
        commands.when("git", ["--version"]).returns({ exitCode: -1, timedOut: true });
        const service = createService();

        const report = await service.run();

        expect(findItem(report.items, "git")).toMatchObject({
            status: "error",
            detail: "git --version não respondeu em 10 s",
        });
    });

    it("gives every command a 10 second timeout", async () => {
        const service = createService();

        await service.run();

        const timeouts = commands.calls.map((call) => call.options.timeoutMs);
        expect(new Set(timeouts)).toEqual(new Set([COMMAND_TIMEOUT_MS]));
    });

    it("answers from the cache within 30 seconds of the last check", async () => {
        const service = createService();
        const first = await service.run();
        const callsAfterFirstCheck = commands.calls.length;
        clock.advance(CACHE_MS - 1);

        const second = await service.run();

        expect(second).toEqual(first);
        expect(commands.calls).toHaveLength(callsAfterFirstCheck);
    });

    it("checks again once the cache expires", async () => {
        const service = createService();
        await service.run();
        clock.advance(CACHE_MS);

        const report = await service.run();

        expect(report.checkedAt).toBe(clock.now().toISOString());
    });

    it("runs the checks listed at the time of each check", async () => {
        const listedChecks = [...DIAGNOSTIC_CHECKS];
        const service = createDiagnosticService({
            listChecks: () => listedChecks,
            commands,
            clock,
        });
        await service.run();
        listedChecks.push(createAgentImageCheck(AGENT_IMAGE));

        const report = await service.run(true);

        expect(findItem(report.items, `agent-image:${AGENT_IMAGE}`)).toBeDefined();
    });

    it("checks again when forced even if the cache is fresh", async () => {
        const service = createService();
        await service.run();
        commands.when("gh", ["auth", "status"]).returns({ exitCode: 1 });

        const report = await service.run(true);

        expect(findItem(report.items, "gh-auth")?.status).toBe("warning");
    });
});

describe("checkNodeVersion", () => {
    const commands = new FakeCommandRunner();

    it("accepts Node 22", async () => {
        const item = await checkNodeVersion({ commands, nodeVersion: "22.0.0" });

        expect(item).toMatchObject({ status: "ok", detail: "Node 22.0.0" });
    });

    it("reports Node older than 22 as an error", async () => {
        const item = await checkNodeVersion({ commands, nodeVersion: "20.11.1" });

        expect(item).toMatchObject({ status: "error", fix: "Instale o Node 22 ou mais recente" });
    });
});

describe("createAgentImageCheck", () => {
    let commands: FakeCommandRunner;

    beforeEach(() => {
        commands = new FakeCommandRunner();
    });

    function checkAgentImage(): Promise<DiagnosticItem> {
        return createAgentImageCheck(AGENT_IMAGE)({ commands, nodeVersion: "22.0.0" });
    }

    it("reports a missing image as an error with the fix to build it", async () => {
        commands.when("docker", ["image", "inspect", AGENT_IMAGE]).returns({
            exitCode: IMAGE_NOT_FOUND,
        });

        const item = await checkAgentImage();

        expect(item).toEqual({
            id: `agent-image:${AGENT_IMAGE}`,
            label: "Imagem do agente",
            status: "error",
            detail: "Imagem forja-agent:latest não encontrada",
            fix: "Construir imagem",
        });
    });

    it("accepts an image that docker image inspect finds", async () => {
        commands.when("docker", ["image", "inspect", AGENT_IMAGE]).returns({ stdout: "[{}]" });

        const item = await checkAgentImage();

        expect(item).toMatchObject({ status: "ok", detail: "Imagem forja-agent:latest pronta" });
    });
});

describe("createForjaDiskUsageCheck", () => {
    function checkDiskUsage(logsMb: number, maxLogsMb: number): Promise<DiagnosticItem> {
        const readDiskUsage = () =>
            Promise.resolve({
                logsBytes: logsMb * BYTES_PER_MB,
                maxLogsBytes: maxLogsMb * BYTES_PER_MB,
            });

        return createForjaDiskUsageCheck(readDiskUsage)({
            commands: new FakeCommandRunner(),
            nodeVersion: "22.0.0",
        });
    }

    it("reports how much of the log ceiling the logs use", async () => {
        const item = await checkDiskUsage(120, 2_048);

        expect(item).toEqual({
            id: "forja-disk",
            label: "Espaço em disco da Forja",
            status: "ok",
            detail: "Logs ocupam 120 MB de 2.048 MB",
        });
    });

    it("warns when the logs are close to the ceiling", async () => {
        const item = await checkDiskUsage(1_900, 2_048);

        expect(item).toMatchObject({
            status: "warning",
            detail: "Logs ocupam 1.900 MB de 2.048 MB",
        });
        expect(item.fix).toBeDefined();
    });
});

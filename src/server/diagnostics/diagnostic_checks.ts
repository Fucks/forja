import { commandSucceeded } from "@/integrations/process/command_runner.js";
import type { CommandResult, CommandRunner } from "@/integrations/process/command_runner.js";
import { formatDuration, formatMegabytes } from "@/lib/format.js";
import type { DiagnosticItem } from "@/shared/diagnostic_types.js";

interface DiagnosticCheckDeps {
    commands: CommandRunner;
    nodeVersion: string;
}

export type DiagnosticCheck = (deps: DiagnosticCheckDeps) => Promise<DiagnosticItem>;

type ItemIdentity = Pick<DiagnosticItem, "id" | "label">;

export interface ForjaDiskUsage {
    logsBytes: number;
    maxLogsBytes: number;
}

interface DiagnosticCommand {
    command: string;
    args: string[];
}

const COMMAND_TIMEOUT_MS = 10_000;
const MINIMUM_NODE_MAJOR_VERSION = 22;

const NODE_ITEM: ItemIdentity = { id: "node", label: "Node.js" };
const GIT_ITEM: ItemIdentity = { id: "git", label: "git" };
const DOCKER_ITEM: ItemIdentity = { id: "docker", label: "Docker" };
const GH_ITEM: ItemIdentity = { id: "gh", label: "GitHub CLI (gh)" };
const GH_AUTH_ITEM: ItemIdentity = { id: "gh-auth", label: "Autenticação do gh" };
const AGENT_IMAGE_LABEL = "Imagem do agente";
const FORJA_DISK_ITEM: ItemIdentity = { id: "forja-disk", label: "Espaço em disco da Forja" };
const LOGS_NEAR_CEILING_RATIO = 0.9;

const GIT_VERSION: DiagnosticCommand = { command: "git", args: ["--version"] };
const DOCKER_CLIENT_VERSION: DiagnosticCommand = { command: "docker", args: ["--version"] };
// No shell runs the command, so the Go template goes without the quotes a terminal would need.
const DOCKER_SERVER_VERSION: DiagnosticCommand = {
    command: "docker",
    args: ["version", "--format", "{{.Server.Version}}"],
};
const GH_VERSION: DiagnosticCommand = { command: "gh", args: ["--version"] };
const GH_AUTH_STATUS: DiagnosticCommand = { command: "gh", args: ["auth", "status"] };

const GITHUB_UNAVAILABLE = "PRs e issues do GitHub não vão funcionar";

export const DIAGNOSTIC_CHECKS: DiagnosticCheck[] = [
    checkNodeVersion,
    checkGit,
    checkDocker,
    checkGhInstalled,
    checkGhAuthenticated,
];

export function createAgentImageCheck(image: string): DiagnosticCheck {
    const identity: ItemIdentity = { id: `agent-image:${image}`, label: AGENT_IMAGE_LABEL };
    const inspectImage: DiagnosticCommand = {
        command: "docker",
        args: ["image", "inspect", image],
    };

    return async function checkAgentImage({ commands }) {
        const result = await runDiagnosticCommand(commands, inspectImage);
        if (result.timedOut) {
            return reportTimeout(identity, inspectImage);
        }
        if (!commandSucceeded(result)) {
            return {
                ...identity,
                status: "error",
                detail: `Imagem ${image} não encontrada`,
                fix: "Construir imagem",
            };
        }

        return { ...identity, status: "ok", detail: `Imagem ${image} pronta` };
    };
}

export function createForjaDiskUsageCheck(
    readDiskUsage: () => Promise<ForjaDiskUsage>,
): DiagnosticCheck {
    return async function checkForjaDiskUsage() {
        const { logsBytes, maxLogsBytes } = await readDiskUsage();
        const detail = `Logs ocupam ${formatMegabytes(logsBytes)} de ${formatMegabytes(maxLogsBytes)}`;
        if (logsBytes >= maxLogsBytes * LOGS_NEAR_CEILING_RATIO) {
            return {
                ...FORJA_DISK_ITEM,
                status: "warning",
                detail,
                fix: "Diminua a retenção ou aumente o teto de logs nas configurações globais",
            };
        }

        return { ...FORJA_DISK_ITEM, status: "ok", detail };
    };
}

export function checkNodeVersion({ nodeVersion }: DiagnosticCheckDeps): Promise<DiagnosticItem> {
    if (readMajorVersion(nodeVersion) < MINIMUM_NODE_MAJOR_VERSION) {
        return Promise.resolve({
            ...NODE_ITEM,
            status: "error",
            detail: `Node ${nodeVersion} é anterior ao mínimo exigido (${MINIMUM_NODE_MAJOR_VERSION})`,
            fix: `Instale o Node ${MINIMUM_NODE_MAJOR_VERSION} ou mais recente`,
        });
    }

    return Promise.resolve({ ...NODE_ITEM, status: "ok", detail: `Node ${nodeVersion}` });
}

async function checkGit({ commands }: DiagnosticCheckDeps): Promise<DiagnosticItem> {
    const result = await runDiagnosticCommand(commands, GIT_VERSION);
    if (result.timedOut) {
        return reportTimeout(GIT_ITEM, GIT_VERSION);
    }
    if (!commandSucceeded(result)) {
        return {
            ...GIT_ITEM,
            status: "error",
            detail: "git não encontrado",
            fix: "Instale o git e confira se ele está no PATH",
        };
    }

    return { ...GIT_ITEM, status: "ok", detail: firstLineOf(result.stdout) };
}

async function checkDocker({ commands }: DiagnosticCheckDeps): Promise<DiagnosticItem> {
    const client = await runDiagnosticCommand(commands, DOCKER_CLIENT_VERSION);
    if (client.timedOut) {
        return reportTimeout(DOCKER_ITEM, DOCKER_CLIENT_VERSION);
    }
    if (!commandSucceeded(client)) {
        return {
            ...DOCKER_ITEM,
            status: "error",
            detail: "Docker não encontrado",
            fix: "Instale o Docker Desktop",
        };
    }

    return checkDockerDaemon(commands);
}

async function checkDockerDaemon(commands: CommandRunner): Promise<DiagnosticItem> {
    const server = await runDiagnosticCommand(commands, DOCKER_SERVER_VERSION);
    if (server.timedOut) {
        return reportTimeout(DOCKER_ITEM, DOCKER_SERVER_VERSION);
    }
    if (!commandSucceeded(server)) {
        return {
            ...DOCKER_ITEM,
            status: "error",
            detail: "Docker instalado mas não está rodando",
            fix: "Abra o Docker Desktop (ou inicie o serviço docker) e verifique de novo",
        };
    }

    return { ...DOCKER_ITEM, status: "ok", detail: `Docker ${server.stdout.trim()} rodando` };
}

async function checkGhInstalled({ commands }: DiagnosticCheckDeps): Promise<DiagnosticItem> {
    const result = await runDiagnosticCommand(commands, GH_VERSION);
    if (result.timedOut) {
        return reportTimeout(GH_ITEM, GH_VERSION);
    }
    if (!commandSucceeded(result)) {
        return {
            ...GH_ITEM,
            status: "warning",
            detail: `gh não encontrado: ${GITHUB_UNAVAILABLE}`,
            fix: "Instale o GitHub CLI (https://cli.github.com)",
        };
    }

    return { ...GH_ITEM, status: "ok", detail: firstLineOf(result.stdout) };
}

async function checkGhAuthenticated({ commands }: DiagnosticCheckDeps): Promise<DiagnosticItem> {
    const result = await runDiagnosticCommand(commands, GH_AUTH_STATUS);
    if (result.timedOut) {
        return reportTimeout(GH_AUTH_ITEM, GH_AUTH_STATUS);
    }
    if (!commandSucceeded(result)) {
        return {
            ...GH_AUTH_ITEM,
            status: "warning",
            detail: GITHUB_UNAVAILABLE,
            fix: "Rode gh auth login",
        };
    }

    return { ...GH_AUTH_ITEM, status: "ok", detail: "gh autenticado no GitHub" };
}

function runDiagnosticCommand(
    commands: CommandRunner,
    { command, args }: DiagnosticCommand,
): Promise<CommandResult> {
    return commands.run(command, args, { timeoutMs: COMMAND_TIMEOUT_MS });
}

function reportTimeout(identity: ItemIdentity, command: DiagnosticCommand): DiagnosticItem {
    const commandLine = [command.command, ...command.args].join(" ");

    return {
        ...identity,
        status: "error",
        detail: `${commandLine} não respondeu em ${formatDuration(COMMAND_TIMEOUT_MS)}`,
        fix: "Confira se o programa não está travado ou esperando uma resposta e verifique de novo",
    };
}

function readMajorVersion(version: string): number {
    return Number.parseInt(version, 10);
}

function firstLineOf(output: string): string {
    const [firstLine = ""] = output.trim().split("\n");
    return firstLine.trim();
}

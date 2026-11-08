import type {
    ApiRetryMessage,
    InitMessage,
} from "@/integrations/agent_runtime/stream_json_messages.js";

export interface InitInfo {
    model?: string;
    tools: string[];
    mcpServers: { name: string; status: string }[];
}

const CONNECTED_MCP_STATUS = "connected";
const UNKNOWN_MODEL = "desconhecido";
const NO_MCP_SERVERS = "nenhum";
const UNKNOWN_API_ERROR = "erro desconhecido";

export function toInitInfo(message: InitMessage): InitInfo {
    return { model: message.model, tools: message.tools, mcpServers: message.mcp_servers };
}

/** The init summary, followed by one warning per MCP server that is not connected. */
export function describeInit(initInfo: InitInfo): string[] {
    const disconnectedServers = initInfo.mcpServers.filter(
        (server) => server.status !== CONNECTED_MCP_STATUS,
    );

    return [
        summarizeInit(initInfo),
        ...disconnectedServers.map(
            (server) => `MCP ${server.name} não conectado (${server.status})`,
        ),
    ];
}

export function describeApiRetry(message: ApiRetryMessage): string {
    const attempt = `${message.attempt}/${message.max_retries}`;
    return `nova tentativa da API (${attempt}): ${apiRetryError(message)}`;
}

function summarizeInit(initInfo: InitInfo): string {
    return [
        `modelo ${initInfo.model ?? UNKNOWN_MODEL}`,
        countTools(initInfo.tools.length),
        `MCP: ${listMcpServers(initInfo.mcpServers)}`,
    ].join(" · ");
}

function countTools(count: number): string {
    if (count === 1) {
        return "1 ferramenta";
    }

    return `${count} ferramentas`;
}

function listMcpServers(servers: InitInfo["mcpServers"]): string {
    if (servers.length === 0) {
        return NO_MCP_SERVERS;
    }

    return servers.map((server) => `${server.name} (${server.status})`).join(", ");
}

function apiRetryError(message: ApiRetryMessage): string {
    if (message.error) {
        return message.error;
    }

    if (typeof message.error_status === "number") {
        return `HTTP ${message.error_status}`;
    }

    return UNKNOWN_API_ERROR;
}

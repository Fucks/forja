import type { AgentEvent } from "@/integrations/agent_runtime/agent_runtime.js";
import { toClaudeResult, type ClaudeResult } from "@/integrations/agent_runtime/claude_result.js";
import {
    assistantBlockSchema,
    blocksMatching,
    knownMessageHeaderSchema,
    streamJsonMessageSchema,
    textBlockSchema,
    toolResultBlockSchema,
    type ApiRetryMessage,
    type AssistantBlock,
    type InitMessage,
    type StreamJsonMessage,
    type ToolResultBlock,
} from "@/integrations/agent_runtime/stream_json_messages.js";
import {
    describeApiRetry,
    describeInit,
    toInitInfo,
    type InitInfo,
} from "@/integrations/agent_runtime/system_messages.js";
import { assertNever } from "@/lib/assert_never.js";

export type { ClaudeResult } from "@/integrations/agent_runtime/claude_result.js";
export type { InitInfo } from "@/integrations/agent_runtime/system_messages.js";

export interface StreamJsonParser {
    /** One stdout line; a line that cannot be understood becomes a `raw` event. */
    push(line: string): AgentEvent[];
    init(): InitInfo | undefined;
    /** Present after the `result` line. */
    result(): ClaudeResult | undefined;
    /** The last text block, used as the summary when the result has no text. */
    lastAssistantText(): string;
}

export interface StreamJsonParserOptions {
    now(): Date;
    iteration: number;
}

const TOOL_ARGS_MAX_CHARS = 4_096;
const TOOL_RESULT_MAX_CHARS = 500;
const TRUNCATION_MARK = "…";
const UNKNOWN_TOOL_NAME = "ferramenta desconhecida";

export function createStreamJsonParser(options: StreamJsonParserOptions): StreamJsonParser {
    const toolNamesById = new Map<string, string>();
    let initInfo: InitInfo | undefined;
    let claudeResult: ClaudeResult | undefined;
    let lastAssistantText = "";

    function push(line: string): AgentEvent[] {
        if (line.trim() === "") {
            return [];
        }

        const json = parseJson(line);
        if (json === undefined) {
            return [rawEvent(line)];
        }

        const message = streamJsonMessageSchema.safeParse(json);
        if (message.success) {
            return consumeMessage(message.data);
        }

        const isKnownMessage = knownMessageHeaderSchema.safeParse(json).success;
        return isKnownMessage ? [rawEvent(line)] : [];
    }

    function consumeMessage(message: StreamJsonMessage): AgentEvent[] {
        switch (message.type) {
            case "assistant":
                return consumeAssistantContent(message.message.content);
            case "user":
                return toolResultsIn(message.message.content).map(toolResultEvent);
            case "system":
                return consumeSystemMessage(message);
            case "result":
                claudeResult = toClaudeResult(message);
                return [];
            default:
                return assertNever(message);
        }
    }

    function consumeAssistantContent(content: unknown[]): AgentEvent[] {
        return blocksMatching(assistantBlockSchema, content).map(consumeAssistantBlock);
    }

    function consumeAssistantBlock(block: AssistantBlock): AgentEvent {
        if (block.type === "text") {
            lastAssistantText = block.text;
            return { kind: "text", text: block.text, ...stamp() };
        }

        toolNamesById.set(block.id, block.name);
        return {
            kind: "tool_call",
            name: block.name,
            args: compactToolArgs(block.input),
            ...stamp(),
        };
    }

    function toolResultEvent(toolResult: ToolResultBlock): AgentEvent {
        const toolName = toolNamesById.get(toolResult.tool_use_id) ?? UNKNOWN_TOOL_NAME;
        const output = truncate(toolResultText(toolResult), TOOL_RESULT_MAX_CHARS);
        return rawEvent(`[resultado de ${toolName}] ${output}`);
    }

    function consumeSystemMessage(message: InitMessage | ApiRetryMessage): AgentEvent[] {
        switch (message.subtype) {
            case "init":
                initInfo = toInitInfo(message);
                return describeInit(initInfo).map(systemEvent);
            case "api_retry":
                return [systemEvent(describeApiRetry(message))];
            default:
                return assertNever(message);
        }
    }

    function stamp(): { at: Date; iteration: number } {
        return { at: options.now(), iteration: options.iteration };
    }

    function rawEvent(line: string): AgentEvent {
        return { kind: "raw", line, ...stamp() };
    }

    function systemEvent(message: string): AgentEvent {
        return { kind: "system", message, at: options.now() };
    }

    return {
        push,
        init: () => initInfo,
        result: () => claudeResult,
        lastAssistantText: () => lastAssistantText,
    };
}

function parseJson(line: string): unknown {
    try {
        const parsed: unknown = JSON.parse(line);
        return parsed;
    } catch {
        return undefined;
    }
}

function toolResultsIn(content: string | unknown[]): ToolResultBlock[] {
    if (typeof content === "string") {
        return [];
    }

    return blocksMatching(toolResultBlockSchema, content);
}

function toolResultText(toolResult: ToolResultBlock): string {
    const content = toolResult.content ?? "";
    if (typeof content === "string") {
        return content;
    }

    const textParts = blocksMatching(textBlockSchema, content);
    return textParts.map((part) => part.text).join("\n");
}

function compactToolArgs(input: unknown): string {
    // JSON.stringify returns undefined for a missing input, despite its typing.
    const json: string | undefined = JSON.stringify(input);
    return truncate(json ?? "", TOOL_ARGS_MAX_CHARS);
}

function truncate(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
        return text;
    }

    return text.slice(0, maxChars) + TRUNCATION_MARK;
}

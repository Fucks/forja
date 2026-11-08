import { readFileSync } from "node:fs";
import path from "node:path";

import type { AgentEvent } from "@/integrations/agent_runtime/agent_runtime.js";
import {
    createStreamJsonParser,
    type StreamJsonParser,
} from "@/integrations/agent_runtime/stream_json_parser.js";

const NOW = new Date("2026-11-08T12:00:00Z");
const ITERATION = 2;
const FIXTURES_DIR = path.resolve(import.meta.dirname, "../../test/fixtures/stream_json");

function createParser(): StreamJsonParser {
    return createStreamJsonParser({ now: () => NOW, iteration: ITERATION });
}

function pushAll(parser: StreamJsonParser, lines: string[]): AgentEvent[] {
    return lines.flatMap((line) => parser.push(line));
}

function pushFixture(parser: StreamJsonParser, fixtureName: string): AgentEvent[] {
    const content = readFileSync(path.join(FIXTURES_DIR, fixtureName), "utf8");
    return pushAll(parser, content.split("\n"));
}

function assistantLine(content: unknown[]): string {
    return JSON.stringify({ type: "assistant", message: { content } });
}

function toolResultLine(toolUseId: string, content: unknown): string {
    return JSON.stringify({
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: toolUseId, content }] },
    });
}

function systemEvent(message: string): AgentEvent {
    return { kind: "system", message, at: NOW };
}

function textEvent(text: string): AgentEvent {
    return { kind: "text", text, at: NOW, iteration: ITERATION };
}

function rawEvent(line: string): AgentEvent {
    return { kind: "raw", line, at: NOW, iteration: ITERATION };
}

function toolCallEvent(name: string, args: string): AgentEvent {
    return { kind: "tool_call", name, args, at: NOW, iteration: ITERATION };
}

describe("createStreamJsonParser", () => {
    describe("lines that are not stream-json messages", () => {
        it("turns a line that is not JSON into a raw event", () => {
            const parser = createParser();

            const events = parser.push("Warning: something went sideways");

            expect(events).toEqual([rawEvent("Warning: something went sideways")]);
        });

        it("turns a truncated JSON line into a raw event", () => {
            const parser = createParser();

            const events = parser.push('{"type":"assistant","message":{"content":[{"ty');

            expect(events).toEqual([rawEvent('{"type":"assistant","message":{"content":[{"ty')]);
        });

        it("turns a known message with an unexpected shape into a raw event", () => {
            const parser = createParser();
            const line = JSON.stringify({ type: "assistant", message: "not an object" });

            const events = parser.push(line);

            expect(events).toEqual([rawEvent(line)]);
        });

        it("ignores blank lines", () => {
            const parser = createParser();

            const events = pushAll(parser, ["", "   ", "\r"]);

            expect(events).toEqual([]);
        });

        it("ignores the synthetic fixture marker and unknown message types", () => {
            const parser = createParser();

            const events = pushAll(parser, [
                '{"_fixture":"sintética"}',
                '{"type":"stream_event","event":{"type":"content_block_delta"}}',
                '{"type":"system","subtype":"compact_boundary"}',
                "[1, 2, 3]",
            ]);

            expect(events).toEqual([]);
        });
    });

    describe("assistant messages", () => {
        it("emits a text event for each text block, ignoring unknown fields and blocks", () => {
            const parser = createParser();
            const line = JSON.stringify({
                type: "assistant",
                brandNewField: true,
                message: {
                    content: [
                        { type: "thinking", thinking: "hmm" },
                        { type: "text", text: "Primeiro", citations: [] },
                        { type: "text", text: "Segundo" },
                    ],
                },
            });

            const events = parser.push(line);

            expect(events).toEqual([textEvent("Primeiro"), textEvent("Segundo")]);
        });

        it("remembers the last text block", () => {
            const parser = createParser();

            pushAll(parser, [
                assistantLine([{ type: "text", text: "Primeiro" }]),
                assistantLine([{ type: "text", text: "Último" }]),
                assistantLine([{ type: "tool_use", id: "toolu_1", name: "Bash", input: {} }]),
            ]);

            expect(parser.lastAssistantText()).toBe("Último");
        });

        it("has no last text before any text block", () => {
            const parser = createParser();

            expect(parser.lastAssistantText()).toBe("");
        });

        it("emits a tool_call event with the input as compact JSON", () => {
            const parser = createParser();
            const toolUse = {
                type: "tool_use",
                id: "toolu_1",
                name: "Bash",
                input: { command: "npm test", timeout: 1000 },
            };

            const events = parser.push(assistantLine([toolUse]));

            expect(events).toEqual([
                toolCallEvent("Bash", '{"command":"npm test","timeout":1000}'),
            ]);
        });

        it("truncates tool_call arguments at 4 KB", () => {
            const parser = createParser();
            const input = { content: "x".repeat(10_000) };

            const [event] = parser.push(
                assistantLine([{ type: "tool_use", id: "toolu_1", name: "Write", input }]),
            );

            const expectedArgs = `${JSON.stringify(input).slice(0, 4_096)}…`;
            expect(event).toEqual(toolCallEvent("Write", expectedArgs));
        });
    });

    describe("tool results", () => {
        it("summarizes a tool result with the name of the tool that produced it", () => {
            const parser = createParser();
            parser.push(
                assistantLine([{ type: "tool_use", id: "toolu_1", name: "Bash", input: {} }]),
            );

            const events = parser.push(toolResultLine("toolu_1", "12 passed"));

            expect(events).toEqual([rawEvent("[resultado de Bash] 12 passed")]);
        });

        it("joins the text parts of a tool result given as content blocks", () => {
            const parser = createParser();
            parser.push(
                assistantLine([{ type: "tool_use", id: "toolu_1", name: "Read", input: {} }]),
            );

            const events = parser.push(
                toolResultLine("toolu_1", [
                    { type: "text", text: "linha 1" },
                    { type: "image", source: {} },
                    { type: "text", text: "linha 2" },
                ]),
            );

            expect(events).toEqual([rawEvent("[resultado de Read] linha 1\nlinha 2")]);
        });

        it("keeps only the first 500 characters of a tool result", () => {
            const parser = createParser();
            parser.push(
                assistantLine([{ type: "tool_use", id: "toolu_1", name: "Bash", input: {} }]),
            );

            const events = parser.push(toolResultLine("toolu_1", "y".repeat(2_000)));

            expect(events).toEqual([rawEvent(`[resultado de Bash] ${"y".repeat(500)}…`)]);
        });

        it("names the tool as unknown when its tool_use was never seen", () => {
            const parser = createParser();

            const events = parser.push(toolResultLine("toolu_missing", "ok"));

            expect(events).toEqual([rawEvent("[resultado de ferramenta desconhecida] ok")]);
        });

        it("ignores user messages that carry a plain prompt", () => {
            const parser = createParser();

            const events = parser.push(
                JSON.stringify({ type: "user", message: { content: "Faça a tarefa" } }),
            );

            expect(events).toEqual([]);
        });
    });

    describe("system messages", () => {
        it("records the init info and summarizes it", () => {
            const parser = createParser();
            const line = JSON.stringify({
                type: "system",
                subtype: "init",
                model: "claude-opus-5-5",
                tools: ["Bash", "Read"],
                mcp_servers: [{ name: "codegraph", status: "connected" }],
            });

            const events = parser.push(line);

            expect(events).toEqual([
                systemEvent("modelo claude-opus-5-5 · 2 ferramentas · MCP: codegraph (connected)"),
            ]);
            expect(parser.init()).toEqual({
                model: "claude-opus-5-5",
                tools: ["Bash", "Read"],
                mcpServers: [{ name: "codegraph", status: "connected" }],
            });
        });

        it("summarizes an init without model, tools or MCP servers", () => {
            const parser = createParser();

            const events = parser.push('{"type":"system","subtype":"init"}');

            expect(events).toEqual([
                systemEvent("modelo desconhecido · 0 ferramentas · MCP: nenhum"),
            ]);
            expect(parser.init()).toEqual({ model: undefined, tools: [], mcpServers: [] });
        });

        it("warns about each MCP server that is not connected", () => {
            const parser = createParser();
            const line = JSON.stringify({
                type: "system",
                subtype: "init",
                model: "claude-sonnet-5-5",
                tools: ["Bash"],
                mcp_servers: [
                    { name: "codegraph", status: "connected" },
                    { name: "github", status: "failed" },
                    { name: "slack", status: "needs-auth" },
                ],
            });

            const events = parser.push(line);

            expect(events).toEqual([
                systemEvent(
                    "modelo claude-sonnet-5-5 · 1 ferramenta · " +
                        "MCP: codegraph (connected), github (failed), slack (needs-auth)",
                ),
                systemEvent("MCP github não conectado (failed)"),
                systemEvent("MCP slack não conectado (needs-auth)"),
            ]);
        });

        it("has no init info before the init message", () => {
            const parser = createParser();

            expect(parser.init()).toBeUndefined();
        });

        it("reports an API retry with its attempt and error", () => {
            const parser = createParser();
            const line = JSON.stringify({
                type: "system",
                subtype: "api_retry",
                attempt: 2,
                max_retries: 10,
                retry_delay_ms: 2000,
                error_status: 529,
                error: "overloaded_error",
            });

            const events = parser.push(line);

            expect(events).toEqual([systemEvent("nova tentativa da API (2/10): overloaded_error")]);
        });

        it("reports an API retry by its status when the error is missing", () => {
            const parser = createParser();

            const events = parser.push(
                '{"type":"system","subtype":"api_retry","attempt":1,"max_retries":3,"error_status":500}',
            );

            expect(events).toEqual([systemEvent("nova tentativa da API (1/3): HTTP 500")]);
        });
    });

    describe("the result message", () => {
        it("has no result before the result message", () => {
            const parser = createParser();

            expect(parser.result()).toBeUndefined();
        });

        it("maps the result fields and emits no event", () => {
            const parser = createParser();
            const line = JSON.stringify({
                type: "result",
                subtype: "success",
                is_error: false,
                result: "Feito.",
                structured_output: { verdict: "approve" },
                usage: {
                    input_tokens: 10,
                    output_tokens: 5,
                    cache_read_input_tokens: 3,
                    cache_creation_input_tokens: 2,
                    server_tool_use: { web_search_requests: 0 },
                },
                total_cost_usd: 0.5,
                num_turns: 4,
                session_id: "sess-1",
                duration_ms: 1234,
                permission_denials: [
                    { tool_name: "Bash", tool_use_id: "toolu_1", tool_input: {} },
                    { tool_name: "Write", reason: "fora do diretório" },
                ],
                errors: ["algo falhou"],
                unknownField: "ignored",
            });

            const events = parser.push(line);

            expect(events).toEqual([]);
            expect(parser.result()).toEqual({
                subtype: "success",
                isError: false,
                text: "Feito.",
                structuredOutput: { verdict: "approve" },
                usage: {
                    inputTokens: 10,
                    outputTokens: 5,
                    cacheReadInputTokens: 3,
                    cacheCreationInputTokens: 2,
                },
                costUsd: 0.5,
                numTurns: 4,
                sessionId: "sess-1",
                durationMs: 1234,
                permissionDenials: [
                    { toolName: "Bash", reason: undefined },
                    { toolName: "Write", reason: "fora do diretório" },
                ],
                errors: ["algo falhou"],
            });
        });

        it("sums modelUsage across models when present", () => {
            const parser = createParser();
            const line = JSON.stringify({
                type: "result",
                subtype: "success",
                is_error: false,
                usage: { input_tokens: 1, output_tokens: 1 },
                modelUsage: {
                    "claude-opus-5-5": {
                        inputTokens: 100,
                        outputTokens: 20,
                        cacheReadInputTokens: 300,
                        cacheCreationInputTokens: 4,
                        costUSD: 0.3,
                    },
                    "claude-haiku-5-5": { inputTokens: 50, outputTokens: 5 },
                },
            });

            parser.push(line);

            expect(parser.result()?.usage).toEqual({
                inputTokens: 150,
                outputTokens: 25,
                cacheReadInputTokens: 300,
                cacheCreationInputTokens: 4,
            });
        });

        it("defaults the optional result fields of a minimal error result", () => {
            const parser = createParser();

            parser.push('{"type":"result","subtype":"error_during_execution","is_error":true}');

            expect(parser.result()).toEqual({
                subtype: "error_during_execution",
                isError: true,
                text: undefined,
                structuredOutput: undefined,
                usage: {
                    inputTokens: 0,
                    outputTokens: 0,
                    cacheReadInputTokens: 0,
                    cacheCreationInputTokens: 0,
                },
                costUsd: undefined,
                numTurns: undefined,
                sessionId: undefined,
                durationMs: undefined,
                permissionDenials: [],
                errors: [],
            });
        });
    });

    describe("fixtures", () => {
        it("parses a simple successful run", () => {
            const parser = createParser();

            const events = pushFixture(parser, "success_simple.ndjson");

            expect(events).toEqual([
                systemEvent("modelo claude-sonnet-5-5 · 3 ferramentas · MCP: nenhum"),
                textEvent("Pronto, o README foi revisado."),
            ]);
            expect(parser.result()).toEqual({
                subtype: "success",
                isError: false,
                text: "Pronto, o README foi revisado.",
                usage: {
                    inputTokens: 120,
                    outputTokens: 45,
                    cacheReadInputTokens: 300,
                    cacheCreationInputTokens: 50,
                },
                costUsd: 0.0123,
                numTurns: 1,
                sessionId: "sess-simple",
                durationMs: 4200,
                permissionDenials: [],
                errors: [],
            });
        });

        it("parses a run with tool calls, a retry and usage from several models", () => {
            const parser = createParser();

            const events = pushFixture(parser, "tool_calls.ndjson");

            expect(events).toEqual([
                systemEvent("modelo claude-opus-5-5 · 3 ferramentas · MCP: codegraph (connected)"),
                systemEvent("nova tentativa da API (1/10): overloaded_error"),
                textEvent("Vou rodar os testes."),
                toolCallEvent("Bash", '{"command":"npm run test","description":"Roda os testes"}'),
                rawEvent("[resultado de Bash] Test Files  12 passed (12)"),
                toolCallEvent("Read", '{"file_path":"src/cli.ts"}'),
                rawEvent('[resultado de Read] import { main } from "./main.js";'),
                textEvent("Todos os testes passam."),
            ]);
            expect(parser.result()).toMatchObject({
                subtype: "success",
                text: "Todos os testes passam.",
                usage: {
                    inputTokens: 1400,
                    outputTokens: 250,
                    cacheReadInputTokens: 5000,
                    cacheCreationInputTokens: 400,
                },
                costUsd: 0.25,
                numTurns: 3,
            });
            expect(parser.lastAssistantText()).toBe("Todos os testes passam.");
        });

        it("exposes the structured output of the result", () => {
            const parser = createParser();

            const events = pushFixture(parser, "structured_output.ndjson");

            expect(events).toEqual([
                systemEvent("modelo claude-sonnet-5-5 · 1 ferramenta · MCP: nenhum"),
                toolCallEvent("StructuredOutput", '{"verdict":"approve","issues":[]}'),
            ]);
            expect(parser.result()).toMatchObject({
                subtype: "success",
                isError: false,
                text: undefined,
                structuredOutput: { verdict: "approve", issues: [] },
            });
            expect(parser.lastAssistantText()).toBe("");
        });

        it("parses a run that hit the turn limit", () => {
            const parser = createParser();

            const events = pushFixture(parser, "error_max_turns.ndjson");

            expect(events).toEqual([
                systemEvent("modelo claude-sonnet-5-5 · 1 ferramenta · MCP: nenhum"),
                textEvent("Ainda investigando a falha."),
                toolCallEvent("Bash", '{"command":"rm -rf dist"}'),
                rawEvent("[resultado de Bash] Permissão negada para Bash"),
            ]);
            expect(parser.result()).toMatchObject({
                subtype: "error_max_turns",
                isError: true,
                text: undefined,
                numTurns: 5,
                permissionDenials: [{ toolName: "Bash" }],
                errors: ["Reached maximum number of turns (5)"],
            });
            expect(parser.lastAssistantText()).toBe("Ainda investigando a falha.");
        });

        it("warns when an MCP server failed to connect", () => {
            const parser = createParser();

            const events = pushFixture(parser, "mcp_failed.ndjson");

            expect(events).toEqual([
                systemEvent(
                    "modelo claude-sonnet-5-5 · 2 ferramentas · " +
                        "MCP: codegraph (connected), github (failed)",
                ),
                systemEvent("MCP github não conectado (failed)"),
                textEvent("O MCP do GitHub não está disponível; sigo sem ele."),
            ]);
            expect(parser.init()).toEqual({
                model: "claude-sonnet-5-5",
                tools: ["Bash", "Read"],
                mcpServers: [
                    { name: "codegraph", status: "connected" },
                    { name: "github", status: "failed" },
                ],
            });
            expect(parser.result()).toMatchObject({ subtype: "success", isError: false });
        });
    });
});

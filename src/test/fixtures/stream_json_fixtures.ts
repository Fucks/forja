import { readFileSync } from "node:fs";
import path from "node:path";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "stream_json");

export function readStreamJsonFixture(fileName: string): string[] {
    return readFileSync(path.join(FIXTURES_DIR, fileName), "utf8").split("\n");
}

export function assistantTextLine(text: string): string {
    return JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }] } });
}

export function resultLine(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "feito",
        session_id: "sess-1",
        usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
        },
        ...overrides,
    });
}

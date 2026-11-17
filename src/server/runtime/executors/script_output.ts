import { assertNever } from "@/lib/assert_never.js";
import type { ScriptOutputMode } from "@/shared/node_configs/script_config.js";

export type ScriptOutputParsing =
    { kind: "not_parsed" } | { kind: "parsed"; data: unknown } | { kind: "invalid" };

const LINE_SEPARATOR = "\n";

export function parseScriptOutput(stdout: string, mode: ScriptOutputMode): ScriptOutputParsing {
    switch (mode) {
        case "none":
            return { kind: "not_parsed" };
        case "json":
            return parseJson(stdout);
        case "lastLineJson":
            return parseJson(lastNonEmptyLine(stdout));
        default:
            return assertNever(mode);
    }
}

function lastNonEmptyLine(text: string): string {
    const lines = text.split(LINE_SEPARATOR).filter((line) => line.trim() !== "");

    return lines.at(-1) ?? "";
}

function parseJson(text: string): ScriptOutputParsing {
    try {
        return { kind: "parsed", data: JSON.parse(text) };
    } catch {
        return { kind: "invalid" };
    }
}

import type { StoredLogEvent } from "@/shared/log_types.js";
import { buildStoredLogEvent, LOG_STARTED_AT } from "@/test/factories/stored_log_event_factory.js";
import { toLogLines } from "@/web/logs/to_log_lines.js";

describe("toLogLines", () => {
    it("turns a text event into a text line", () => {
        const events = [storedEvent({ seq: 1, kind: "text", text: "Vou ler o arquivo." })];

        expect(toLogLines(events, LOG_STARTED_AT)).toEqual([
            { seq: 1, offsetMs: 0, kind: "text", text: "Vou ler o arquivo." },
        ]);
    });

    it("measures the offset of each line from the start", () => {
        const events = [
            storedEvent({ seq: 1, at: "2026-01-01T12:00:42.000Z", kind: "text", text: "a" }),
        ];

        const [line] = toLogLines(events, LOG_STARTED_AT);

        expect(line?.offsetMs).toBe(42_000);
    });

    it("never gives an event older than the start a negative offset", () => {
        const events = [
            storedEvent({ seq: 1, at: "2026-01-01T11:59:59.000Z", kind: "text", text: "a" }),
        ];

        const [line] = toLogLines(events, LOG_STARTED_AT);

        expect(line?.offsetMs).toBe(0);
    });

    it("turns a system event into a system line", () => {
        const events = [storedEvent({ seq: 1, kind: "system", message: "Container iniciado" })];

        expect(toLogLines(events, LOG_STARTED_AT)).toEqual([
            { seq: 1, offsetMs: 0, kind: "system", text: "Container iniciado" },
        ]);
    });

    it("names the tool of a tool call and indents its JSON arguments", () => {
        const events = [
            storedEvent({
                seq: 1,
                kind: "tool_call",
                name: "Read",
                args: '{"file_path":"src/app.tsx"}',
            }),
        ];

        expect(toLogLines(events, LOG_STARTED_AT)).toEqual([
            {
                seq: 1,
                offsetMs: 0,
                kind: "tool_call",
                text: "▸ Read",
                detail: '{\n  "file_path": "src/app.tsx"\n}',
            },
        ]);
    });

    it("keeps the arguments of a tool call as they are when they are not JSON", () => {
        const events = [
            storedEvent({ seq: 1, kind: "tool_call", name: "Bash", args: "ls -la… (truncado" }),
        ];

        const [line] = toLogLines(events, LOG_STARTED_AT);

        expect(line?.detail).toBe("ls -la… (truncado");
    });

    it("collapses the output of a tool result into its detail", () => {
        const events = [
            storedEvent({ seq: 1, kind: "raw", line: '[resultado de Read] {"lines":12}' }),
        ];

        expect(toLogLines(events, LOG_STARTED_AT)).toEqual([
            {
                seq: 1,
                offsetMs: 0,
                kind: "tool_result",
                text: "◂ resultado de Read",
                detail: '{\n  "lines": 12\n}',
            },
        ]);
    });

    it("keeps the output of a tool result as it is when it is not JSON", () => {
        const events = [storedEvent({ seq: 1, kind: "raw", line: "[resultado de Bash] total 8" })];

        const [line] = toLogLines(events, LOG_STARTED_AT);

        expect(line?.detail).toBe("total 8");
    });

    it("shows any other raw line as raw output", () => {
        const events = [storedEvent({ seq: 1, kind: "raw", line: "npm WARN deprecated" })];

        expect(toLogLines(events, LOG_STARTED_AT)).toEqual([
            { seq: 1, offsetMs: 0, kind: "system", text: "npm WARN deprecated", isRawOutput: true },
        ]);
    });

    it("keeps the order of the events", () => {
        const events = [
            storedEvent({ seq: 1, kind: "system", message: "Container iniciado" }),
            storedEvent({ seq: 2, kind: "text", text: "Pronto." }),
        ];

        expect(toLogLines(events, LOG_STARTED_AT).map((line) => line.seq)).toEqual([1, 2]);
    });
});

function storedEvent(
    overrides: Partial<StoredLogEvent> & Pick<StoredLogEvent, "seq" | "kind">,
): StoredLogEvent {
    return buildStoredLogEvent({ at: LOG_STARTED_AT.toISOString(), ...overrides });
}

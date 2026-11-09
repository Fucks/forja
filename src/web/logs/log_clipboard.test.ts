import { buildLogLine } from "@/test/factories/log_line_factory.js";
import { formatLineForClipboard, formatLinesForClipboard } from "@/web/logs/log_clipboard.js";

const BASH_CALL = buildLogLine({
    seq: 1,
    offsetMs: 42_000,
    kind: "tool_call",
    toolName: "Bash",
    text: "npm test",
    detail: '{ "command": "npm test" }',
});
const PLAIN_LINE = buildLogLine({ seq: 2, offsetMs: 43_000, text: "Testes passaram" });

describe("formatLineForClipboard", () => {
    it("copies the offset, tool name, text and detail of a line", () => {
        expect(formatLineForClipboard(BASH_CALL)).toBe(
            '+00:42 Bash npm test\n{ "command": "npm test" }',
        );
    });
});

describe("formatLinesForClipboard", () => {
    it("copies one line per entry, with the detail only of expanded lines", () => {
        const text = formatLinesForClipboard([BASH_CALL, PLAIN_LINE], () => false);

        expect(text).toBe("+00:42 Bash npm test\n+00:43 Testes passaram");
    });

    it("includes the detail of expanded lines", () => {
        const text = formatLinesForClipboard([BASH_CALL], (seq) => seq === BASH_CALL.seq);

        expect(text).toBe('+00:42 Bash npm test\n{ "command": "npm test" }');
    });
});

import { render, screen } from "@testing-library/react";

import { buildLogLine, buildLogLines } from "@/test/factories/log_line_factory.js";
import { stubElementSizes } from "@/test/fakes/fake_element_size.js";
import { measureMs } from "@/test/measure_ms.js";
import { LogViewer } from "@/web/logs/log_viewer.js";
import type { LogLine } from "@/web/logs/log_types.js";

const CI_SLACK_FACTOR = 2;
const MOUNT_TARGET_MS = 500;
const APPEND_TARGET_MS = 50;
const LARGE_LOG_LINE_COUNT = 100_000;
const APPENDED_LINE_COUNT = 1_000;

describe("LogViewer performance", () => {
    beforeEach(() => {
        stubElementSizes({ viewportHeightPx: 400, rowHeightPx: 20 });
    });

    it("mounts with 100 thousand lines in under 500 ms", () => {
        const lines = buildLogLines(LARGE_LOG_LINE_COUNT);

        const elapsedMs = measureMs(() => render(<LogViewer lines={lines} follow />));

        expect(screen.getByText(`Linha ${LARGE_LOG_LINE_COUNT}`)).toBeInTheDocument();
        expect(elapsedMs).toBeLessThan(MOUNT_TARGET_MS * CI_SLACK_FACTOR);
    });

    it("appends 1 000 lines to a log of 100 thousand in under 50 ms", () => {
        const lines = buildLogLines(LARGE_LOG_LINE_COUNT);
        const { rerender } = render(<LogViewer lines={lines} follow />);
        const linesWithAppended = [...lines, ...linesAfter(LARGE_LOG_LINE_COUNT)];

        const elapsedMs = measureMs(() => rerender(<LogViewer lines={linesWithAppended} follow />));

        const lastLineNumber = LARGE_LOG_LINE_COUNT + APPENDED_LINE_COUNT;
        expect(screen.getByText(`Linha ${lastLineNumber}`)).toBeInTheDocument();
        expect(elapsedMs).toBeLessThan(APPEND_TARGET_MS * CI_SLACK_FACTOR);
    });
});

function linesAfter(lastSeq: number): LogLine[] {
    return Array.from({ length: APPENDED_LINE_COUNT }, (_, index) =>
        buildLogLine({ seq: lastSeq + index + 1 }),
    );
}

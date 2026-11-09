import { render, screen, within } from "@testing-library/react";

import { buildLogLines } from "@/test/factories/log_line_factory.js";
import { stubElementSizes } from "@/test/fakes/fake_element_size.js";
import { LogViewer } from "@/web/logs/log_viewer.js";

const VIEWPORT_HEIGHT_PX = 400;
const ROW_HEIGHT_PX = 20;
const MAX_MOUNTED_ROWS = 200;

describe("LogViewer", () => {
    beforeEach(() => {
        stubElementSizes({ viewportHeightPx: VIEWPORT_HEIGHT_PX, rowHeightPx: ROW_HEIGHT_PX });
    });

    it("mounts only the visible rows of a log with 100 thousand lines", () => {
        render(<LogViewer lines={buildLogLines(100_000)} />);

        const mountedRows = within(screen.getByRole("log")).getAllByRole("listitem");
        expect(mountedRows.length).toBeGreaterThan(0);
        expect(mountedRows.length).toBeLessThan(MAX_MOUNTED_ROWS);
    });

    it("starts at the end of the log", async () => {
        render(<LogViewer lines={buildLogLines(1_000)} />);

        expect(await screen.findByText("Linha 1000")).toBeInTheDocument();
        expect(screen.queryByText("Linha 1")).not.toBeInTheDocument();
    });

    it("shows the offset of each line relative to the start of the run", () => {
        render(<LogViewer lines={buildLogLines(1)} />);

        expect(screen.getByText("+00:00")).toBeInTheDocument();
    });

    it("shows the empty label when there are no lines", () => {
        render(<LogViewer lines={[]} emptyLabel="Este nó ainda não rodou" />);

        expect(screen.getByText("Este nó ainda não rodou")).toBeInTheDocument();
    });

    it("shows a loading placeholder instead of the lines while loading", () => {
        render(<LogViewer lines={[]} loading />);

        expect(screen.getByRole("status", { name: "Carregando logs" })).toBeInTheDocument();
        expect(screen.queryByRole("log")).not.toBeInTheDocument();
    });
});

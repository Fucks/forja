import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { buildLogLine, buildLogLines } from "@/test/factories/log_line_factory.js";
import { stubElementSizes } from "@/test/fakes/fake_element_size.js";
import { LogViewer } from "@/web/logs/log_viewer.js";

const VIEWPORT_HEIGHT_PX = 400;
const ROW_HEIGHT_PX = 20;
const MAX_MOUNTED_ROWS = 200;

const READ_ARGUMENTS = '{ "file_path": "src/app.tsx" }';
const READ_TOOL_CALL = buildLogLine({
    seq: 1,
    kind: "tool_call",
    toolName: "Read",
    text: "src/app.tsx",
    detail: READ_ARGUMENTS,
});

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

    it("expands the detail of a line by clicking it", async () => {
        const user = userEvent.setup();
        render(<LogViewer lines={[READ_TOOL_CALL]} />);

        await user.click(screen.getByRole("button", { name: /Read/ }));

        expect(screen.getByText(READ_ARGUMENTS)).toBeInTheDocument();
    });

    it("collapses an expanded line by clicking it again", async () => {
        const user = userEvent.setup();
        render(<LogViewer lines={[READ_TOOL_CALL]} />);
        const toggle = screen.getByRole("button", { name: /Read/ });

        await user.click(toggle);
        await user.click(toggle);

        expect(toggle).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByText(READ_ARGUMENTS)).not.toBeInTheDocument();
    });

    it("expands the detail of a line with the keyboard", async () => {
        const user = userEvent.setup();
        render(<LogViewer lines={[READ_TOOL_CALL]} />);
        const toggle = screen.getByRole("button", { name: /Read/ });

        toggle.focus();
        await user.keyboard("{Enter}");

        expect(toggle).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByText(READ_ARGUMENTS)).toBeInTheDocument();
    });

    it("does not offer to expand lines without detail", () => {
        render(<LogViewer lines={buildLogLines(1)} />);

        expect(screen.queryByRole("button", { expanded: false })).not.toBeInTheDocument();
    });
});

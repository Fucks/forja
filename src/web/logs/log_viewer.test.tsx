import { fireEvent, render, screen, within } from "@testing-library/react";
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

const SEARCHABLE_LINES = buildLogLines(1_000).map((line) => {
    if (line.seq === 1) {
        return { ...line, text: "Compilar o projeto" };
    }
    if (line.seq === 200 || line.seq === 400) {
        return { ...line, text: `${line.text} compilar` };
    }
    return line;
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

    it("follows new lines while following the end", async () => {
        const { rerender } = render(<LogViewer lines={buildLogLines(1_000)} />);

        rerender(<LogViewer lines={buildLogLines(1_050)} />);

        expect(await screen.findByText("Linha 1050")).toBeInTheDocument();
    });

    it("stops following and offers to go back to the end when scrolled up", () => {
        const onFollowChange = vi.fn();
        render(<LogViewer lines={buildLogLines(1_000)} onFollowChange={onFollowChange} />);

        scrollLogTo(0);

        expect(onFollowChange).toHaveBeenCalledWith(false);
        expect(screen.getByRole("button", { name: "Ir para o fim" })).toBeInTheDocument();
    });

    it("stays where the reader scrolled when new lines arrive after it stopped following", () => {
        const { rerender } = render(<LogViewer lines={buildLogLines(1_000)} />);
        scrollLogTo(0);

        rerender(<LogViewer lines={buildLogLines(1_050)} />);

        expect(screen.getByText("Linha 1")).toBeInTheDocument();
        expect(screen.queryByText("Linha 1050")).not.toBeInTheDocument();
    });

    it("goes back to the end and follows again from the go-to-end button", async () => {
        const user = userEvent.setup();
        render(<LogViewer lines={buildLogLines(1_000)} />);
        scrollLogTo(0);

        await user.click(screen.getByRole("button", { name: "Ir para o fim" }));

        expect(await screen.findByText("Linha 1000")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Ir para o fim" })).not.toBeInTheDocument();
    });

    it("does not follow when the parent turns following off", () => {
        render(<LogViewer lines={buildLogLines(1_000)} follow={false} />);

        expect(screen.getByText("Linha 1")).toBeInTheDocument();
    });

    it("focuses the search field with Ctrl+F inside the viewer", async () => {
        const user = userEvent.setup();
        render(<LogViewer lines={buildLogLines(10)} />);

        screen.getByRole("log").focus();
        await user.keyboard("{Control>}f{/Control}");

        expect(screen.getByRole("searchbox", { name: "Buscar nos logs" })).toHaveFocus();
    });

    it("focuses the search field with Cmd+F inside the viewer", async () => {
        const user = userEvent.setup();
        render(<LogViewer lines={buildLogLines(10)} />);

        screen.getByRole("log").focus();
        await user.keyboard("{Meta>}f{/Meta}");

        expect(screen.getByRole("searchbox", { name: "Buscar nos logs" })).toHaveFocus();
    });

    it("counts the lines that match the search", async () => {
        const user = userEvent.setup();
        render(<LogViewer lines={SEARCHABLE_LINES} />);

        await user.type(screen.getByRole("searchbox"), "compilar");

        expect(screen.getByText("3 ocorrências")).toBeInTheDocument();
    });

    it("goes to the first match with Enter and highlights it", async () => {
        const user = userEvent.setup();
        render(<LogViewer lines={SEARCHABLE_LINES} />);

        await user.type(screen.getByRole("searchbox"), "compilar{Enter}");

        expect(screen.getByText("1 de 3")).toBeInTheDocument();
        expect(screen.getByText("Compilar", { selector: "mark" })).toBeInTheDocument();
    });

    it("goes back to the previous match with Shift+Enter, wrapping to the last one", async () => {
        const user = userEvent.setup();
        render(<LogViewer lines={SEARCHABLE_LINES} />);

        await user.type(screen.getByRole("searchbox"), "compilar{Enter}{Shift>}{Enter}{/Shift}");

        expect(screen.getByText("3 de 3")).toBeInTheDocument();
        expect(await screen.findByRole("listitem", { current: true })).toHaveTextContent(
            "Linha 400 compilar",
        );
    });

    it("expands a line whose detail matches when going to it", async () => {
        const user = userEvent.setup();
        render(<LogViewer lines={[READ_TOOL_CALL, ...buildLogLines(5).slice(1)]} />);

        await user.type(screen.getByRole("searchbox"), "file_path{Enter}");

        expect(screen.getByRole("button", { name: /Read/ })).toHaveAttribute(
            "aria-expanded",
            "true",
        );
    });

    it("highlights matches inside an expanded detail", async () => {
        const user = userEvent.setup();
        render(<LogViewer lines={[READ_TOOL_CALL]} />);

        await user.type(screen.getByRole("searchbox"), "file_path{Enter}");

        expect(screen.getByText("file_path", { selector: "mark" })).toBeInTheDocument();
    });

    it("stops following the end when going to a match", async () => {
        const onFollowChange = vi.fn();
        const user = userEvent.setup();
        render(<LogViewer lines={SEARCHABLE_LINES} onFollowChange={onFollowChange} />);

        await user.type(screen.getByRole("searchbox"), "compilar{Enter}");

        expect(onFollowChange).toHaveBeenCalledWith(false);
    });

    it("copies a line from its copy button", async () => {
        const user = userEvent.setup();
        render(<LogViewer lines={buildLogLines(1)} />);

        await user.click(screen.getByRole("button", { name: "Copiar linha" }));

        expect(await navigator.clipboard.readText()).toBe("+00:00 Linha 1");
    });

    it("copies every line of the log", async () => {
        const user = userEvent.setup();
        render(<LogViewer lines={buildLogLines(3)} />);

        await user.click(screen.getByRole("button", { name: "Copiar tudo" }));

        expect(await navigator.clipboard.readText()).toBe(
            "+00:00 Linha 1\n+00:00 Linha 2\n+00:00 Linha 3",
        );
    });

    it("asks the parent for the raw log from the download button", async () => {
        const onDownloadRaw = vi.fn();
        const user = userEvent.setup();
        render(<LogViewer lines={buildLogLines(3)} onDownloadRaw={onDownloadRaw} />);

        await user.click(screen.getByRole("button", { name: "Baixar log bruto" }));

        expect(onDownloadRaw).toHaveBeenCalledOnce();
    });

    it("renders each line with the renderer given by the parent", () => {
        render(
            <LogViewer
                lines={buildLogLines(1)}
                renderLine={(line) => <strong>{line.text.toUpperCase()}</strong>}
            />,
        );

        expect(screen.getByText("LINHA 1").tagName).toBe("STRONG");
    });

    it("hides the download button when the parent cannot provide the raw log", () => {
        render(<LogViewer lines={buildLogLines(3)} />);

        expect(screen.queryByRole("button", { name: "Baixar log bruto" })).not.toBeInTheDocument();
    });
});

function scrollLogTo(scrollTopPx: number): void {
    const log = screen.getByRole("log");
    log.scrollTop = scrollTopPx;
    fireEvent.scroll(log);
}

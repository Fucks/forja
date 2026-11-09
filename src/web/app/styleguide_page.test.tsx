import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { stubElementSizes } from "@/test/fakes/fake_element_size.js";
import { StyleguidePage } from "@/web/app/styleguide_page.js";
import {
    EXECUTION_STATUS_STYLES,
    EXECUTION_STATUSES,
} from "@/web/components/ui/execution_status.js";
import { ToastProvider } from "@/web/components/ui/toast.js";

const COMPONENT_SECTIONS = [
    "Button",
    "IconButton",
    "Field, Input e Textarea",
    "Select",
    "Switch",
    "Slider",
    "SegmentedControl",
    "StatusBadge",
    "Tooltip",
    "Toast",
    "Dialog",
    "Drawer",
    "Tabs",
    "EmptyState",
    "Skeleton",
    "KeyValue",
    "LogViewer",
];

const ALL_STATUS_LABELS = EXECUTION_STATUSES.map((status) => EXECUTION_STATUS_STYLES[status].label);

describe("StyleguidePage", () => {
    it.each(COMPONENT_SECTIONS)("has a section for %s", (sectionTitle) => {
        renderStyleguide();

        expect(screen.getByRole("region", { name: sectionTitle })).toBeInTheDocument();
    });

    it.each(ALL_STATUS_LABELS)("shows the %s execution status", (statusLabel) => {
        renderStyleguide();

        const statusSection = screen.getByRole("region", { name: "StatusBadge" });
        expect(within(statusSection).getAllByText(statusLabel).length).toBeGreaterThan(0);
    });

    it("shows generated lines in the LogViewer sample", async () => {
        stubElementSizes({ viewportHeightPx: 400, rowHeightPx: 20 });
        renderStyleguide();

        const logViewerSection = screen.getByRole("region", { name: "LogViewer" });
        expect(await within(logViewerSection).findAllByRole("listitem")).not.toHaveLength(0);
    });

    it("opens the dialog sample", async () => {
        const user = userEvent.setup();
        renderStyleguide();

        await user.click(screen.getByRole("button", { name: "Abrir diálogo" }));

        expect(screen.getByRole("dialog", { name: "Excluir fluxo?" })).toBeInTheDocument();
    });

    it("shows a toast from the toast sample", async () => {
        const user = userEvent.setup();
        renderStyleguide();

        await user.click(screen.getByRole("button", { name: "Mostrar sucesso" }));

        expect(await screen.findByText("Fluxo publicado")).toBeInTheDocument();
    });
});

function renderStyleguide(): void {
    render(
        <ToastProvider>
            <StyleguidePage />
        </ToastProvider>,
    );
}

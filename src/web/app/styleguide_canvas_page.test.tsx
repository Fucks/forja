import { render, screen, within } from "@testing-library/react";

import { StyleguideCanvasPage } from "@/web/app/styleguide_canvas_page.js";
import {
    EXECUTION_STATUS_STYLES,
    EXECUTION_STATUSES,
} from "@/web/components/ui/execution_status.js";

const ALL_STATUS_LABELS = EXECUTION_STATUSES.map((status) => EXECUTION_STATUS_STYLES[status].label);

// React Flow keeps nodes hidden until it measures them, which never happens in jsdom, so the nodes
// are found by their labels instead of by their accessible roles.
describe("StyleguideCanvasPage", () => {
    it.each(["BaseNode", "GroupFrame", "FlowEdge"])("has a section for %s", (sectionTitle) => {
        render(<StyleguideCanvasPage />);

        expect(screen.getByRole("region", { name: sectionTitle })).toBeInTheDocument();
    });

    it.each(ALL_STATUS_LABELS)("shows a node in the %s execution status", (statusLabel) => {
        render(<StyleguideCanvasPage />);

        const nodeSection = screen.getByRole("region", { name: "BaseNode" });
        const statusBadges = within(nodeSection)
            .getAllByLabelText(statusLabel)
            .filter((element) => element.getAttribute("role") === "img");
        expect(statusBadges).toHaveLength(1);
    });

    it("shows a group with live counters", () => {
        render(<StyleguideCanvasPage />);

        const groupSection = screen.getByRole("region", { name: "GroupFrame" });
        expect(
            within(groupSection).getByText("2 rodando · 1 na fila · 4 feitos"),
        ).toBeInTheDocument();
    });
});

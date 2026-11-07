import { render, screen } from "@testing-library/react";

import { StatusBadge } from "@/web/components/ui/status_badge.js";

describe("StatusBadge", () => {
    it("shows the status label next to its icon", () => {
        render(<StatusBadge status="SUCCEEDED" />);

        const label = screen.getByText("Sucesso");
        expect(label).toBeVisible();
        expect(label.parentElement?.querySelector("svg")).toBeInTheDocument();
    });

    it("moves the label to aria-label when the label is hidden", () => {
        render(<StatusBadge status="WAITING_APPROVAL" showLabel={false} />);

        expect(screen.getByRole("img", { name: "Aguardando aprovação" })).toBeInTheDocument();
        expect(screen.queryByText("Aguardando aprovação")).not.toBeInTheDocument();
    });

    it("animates the running status", () => {
        render(<StatusBadge status="RUNNING" />);

        expect(screen.getByText("Rodando").parentElement).toHaveClass("animate-ember");
    });
});

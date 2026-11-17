import { render, screen } from "@testing-library/react";

import { GroupFrame } from "@/web/canvas/base/group_frame.js";

describe("GroupFrame", () => {
    it("shows the group label and its configuration", () => {
        render(<GroupFrame kind="map" label="Issues abertas" configLabel="map ×3" />);

        expect(screen.getByText("Issues abertas")).toBeInTheDocument();
        expect(screen.getByText("map ×3")).toBeInTheDocument();
    });

    it("counts the running, queued and finished items", () => {
        render(
            <GroupFrame
                kind="map"
                label="Issues abertas"
                configLabel="map ×3"
                progress={{ queued: 1, running: 2, succeeded: 4, failed: 0 }}
            />,
        );

        expect(screen.getByText("2 rodando · 1 na fila · 4 feitos")).toBeInTheDocument();
    });

    it("counts the failed items", () => {
        render(
            <GroupFrame
                kind="loop"
                label="Revisão"
                configLabel="loop ≤5"
                progress={{ queued: 0, running: 0, succeeded: 1, failed: 2 }}
            />,
        );

        expect(screen.getByText("1 feito · 2 com falha")).toBeInTheDocument();
    });

    it("shows no counters before the group starts", () => {
        render(<GroupFrame kind="loop" label="Revisão" configLabel="loop ≤5" />);

        expect(screen.queryByText(/rodando|na fila|feito|com falha/)).not.toBeInTheDocument();
    });

    it("warns about an invalid group", () => {
        render(<GroupFrame kind="loop" label="Revisão" configLabel="loop ≤5" invalid />);

        expect(screen.getByRole("img", { name: "Configuração inválida" })).toBeInTheDocument();
    });

    it("invites to drag nodes into an empty group", () => {
        render(<GroupFrame kind="map" label="Map" configLabel="map ×1" isEmpty />);

        expect(screen.getByText("Arraste nós para dentro")).toBeInTheDocument();
    });
});

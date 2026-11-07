import { act, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { useState } from "react";
import type { JSX } from "react";

import { Dialog } from "@/web/components/ui/dialog.js";
import { Drawer } from "@/web/components/ui/drawer.js";
import { StatusBadge } from "@/web/components/ui/status_badge.js";
import { ToastProvider, useToast } from "@/web/components/ui/toast.js";
import type { ToastTone } from "@/web/components/ui/toast.js";

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

describe("Dialog", () => {
    it("keeps the focus inside while it is open", async () => {
        const user = userEvent.setup();
        render(<OverlayHarness renderOverlay={renderDialog} />);
        await user.click(screen.getByRole("button", { name: "Abrir" }));

        await pressTabTimes(user, 3);

        const dialog = screen.getByRole("dialog", { name: "Excluir fluxo" });
        expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it("closes with Esc", async () => {
        const user = userEvent.setup();
        render(<OverlayHarness renderOverlay={renderDialog} />);
        await user.click(screen.getByRole("button", { name: "Abrir" }));

        await user.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});

describe("Drawer", () => {
    it("keeps the focus inside while it is open", async () => {
        const user = userEvent.setup();
        render(<OverlayHarness renderOverlay={renderRightDrawer} />);
        await user.click(screen.getByRole("button", { name: "Abrir" }));

        await pressTabTimes(user, 3);

        const drawer = screen.getByRole("dialog", { name: "Detalhes do nó" });
        expect(drawer.contains(document.activeElement)).toBe(true);
    });

    it("closes with Esc", async () => {
        const user = userEvent.setup();
        render(<OverlayHarness renderOverlay={renderRightDrawer} />);
        await user.click(screen.getByRole("button", { name: "Abrir" }));

        await user.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("uses size as the width of a side drawer", () => {
        render(
            <Drawer open onOpenChange={vi.fn()} side="right" title="Logs" size={600}>
                <p>Saída do agente</p>
            </Drawer>,
        );

        expect(screen.getByRole("dialog")).toHaveStyle({ width: "600px" });
    });

    it("uses size as the height of a bottom drawer", () => {
        render(
            <Drawer open onOpenChange={vi.fn()} side="bottom" title="Logs" size={240}>
                <p>Saída do agente</p>
            </Drawer>,
        );

        expect(screen.getByRole("dialog")).toHaveStyle({ height: "240px" });
    });
});

describe("Toast", () => {
    const TOAST_DURATION_MS = 5_000;
    const ONE_MINUTE_MS = 60_000;

    // Fake timers with fireEvent: user-event's async wrapper waits on a real setTimeout that
    // Vitest's fake timers never fire.
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("appears with its title and description and disappears after 5 seconds", () => {
        render(<ToastHarness tone="success" />);

        fireEvent.click(screen.getByRole("button", { name: "Avisar" }));
        expect(screen.getByText("Fluxo publicado")).toBeInTheDocument();
        expect(screen.getByText("Versão 3")).toBeInTheDocument();

        advanceTimersBy(TOAST_DURATION_MS);

        expect(screen.queryByText("Fluxo publicado")).not.toBeInTheDocument();
    });

    it("keeps an error toast until it is closed", () => {
        render(<ToastHarness tone="error" />);
        fireEvent.click(screen.getByRole("button", { name: "Avisar" }));

        advanceTimersBy(ONE_MINUTE_MS);
        expect(screen.getByText("Fluxo publicado")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
        expect(screen.queryByText("Fluxo publicado")).not.toBeInTheDocument();
    });

    it("refuses to be used outside the ToastProvider", () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        expect(() => render(<ToastButton tone="info" />)).toThrow(/ToastProvider/);
    });
});

function ToastHarness({ tone }: { tone: ToastTone }): JSX.Element {
    return (
        <ToastProvider>
            <ToastButton tone={tone} />
        </ToastProvider>
    );
}

function ToastButton({ tone }: { tone: ToastTone }): JSX.Element {
    const toast = useToast();

    return (
        <button
            onClick={() => toast.show({ title: "Fluxo publicado", description: "Versão 3", tone })}
        >
            Avisar
        </button>
    );
}

function advanceTimersBy(durationMs: number): void {
    act(() => {
        vi.advanceTimersByTime(durationMs);
    });
}

type RenderOverlay = (isOpen: boolean, onOpenChange: (open: boolean) => void) => JSX.Element;

function OverlayHarness({ renderOverlay }: { renderOverlay: RenderOverlay }): JSX.Element {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button onClick={() => setIsOpen(true)}>Abrir</button>
            {renderOverlay(isOpen, setIsOpen)}
        </>
    );
}

function renderDialog(isOpen: boolean, onOpenChange: (open: boolean) => void): JSX.Element {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange} title="Excluir fluxo">
            <input aria-label="Confirmação" />
        </Dialog>
    );
}

function renderRightDrawer(isOpen: boolean, onOpenChange: (open: boolean) => void): JSX.Element {
    return (
        <Drawer open={isOpen} onOpenChange={onOpenChange} side="right" title="Detalhes do nó">
            <input aria-label="Nome" />
        </Drawer>
    );
}

async function pressTabTimes(user: UserEvent, times: number): Promise<void> {
    for (let i = 0; i < times; i++) {
        await user.tab();
    }
}

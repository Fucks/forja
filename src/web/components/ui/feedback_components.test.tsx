import { act, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { useState } from "react";
import type { JSX } from "react";

import { Workflow } from "lucide-react";

import { Dialog } from "@/web/components/ui/dialog.js";
import { Drawer } from "@/web/components/ui/drawer.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { KeyValue } from "@/web/components/ui/key_value.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { StatusBadge } from "@/web/components/ui/status_badge.js";
import { Tabs } from "@/web/components/ui/tabs.js";
import { ToastProvider, useToast } from "@/web/components/ui/toast.js";
import { Tooltip } from "@/web/components/ui/tooltip.js";
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

describe("Tabs", () => {
    it("moves to the next tab with the arrow keys and shows its panel", async () => {
        const user = userEvent.setup();
        render(<TabsHarness />);
        await user.click(screen.getByRole("tab", { name: "Entrada" }));

        await user.keyboard("{ArrowRight}");

        expect(screen.getByRole("tab", { name: "Saída" })).toHaveFocus();
        expect(screen.getByRole("tabpanel", { name: "Saída" })).toHaveTextContent("resultado");
    });

    it("wraps from the last tab to the first", async () => {
        const user = userEvent.setup();
        render(<TabsHarness />);
        await user.click(screen.getByRole("tab", { name: "Logs" }));

        await user.keyboard("{ArrowRight}");

        expect(screen.getByRole("tab", { name: "Entrada" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
    });
});

describe("Tooltip", () => {
    it("shows its content when the trigger gets the keyboard focus", async () => {
        const user = userEvent.setup();
        render(
            <Tooltip content="Publicar versão">
                <button>Publicar</button>
            </Tooltip>,
        );

        await user.tab();

        expect(await screen.findByRole("tooltip", { name: "Publicar versão" })).toBeInTheDocument();
    });
});

describe("Skeleton", () => {
    it("is hidden from assistive technology", () => {
        const { container } = render(<Skeleton className="h-4 w-32" />);

        expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    });
});

describe("EmptyState", () => {
    it("shows the title, the description and the action", () => {
        render(
            <EmptyState
                icon={Workflow}
                title="Nenhum fluxo ainda"
                description="Crie um fluxo a partir de um template."
                action={<button>Criar fluxo</button>}
            />,
        );

        expect(screen.getByRole("heading", { name: "Nenhum fluxo ainda" })).toBeInTheDocument();
        expect(screen.getByText("Crie um fluxo a partir de um template.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Criar fluxo" })).toBeInTheDocument();
    });
});

describe("KeyValue", () => {
    it("pairs each label with its value and uses the mono font when asked", () => {
        render(
            <KeyValue
                items={[
                    { label: "Modelo", value: "claude-opus-5-5" },
                    { label: "Branch", value: "forja/issue-13", mono: true },
                ]}
            />,
        );

        expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual([
            "Modelo",
            "Branch",
        ]);
        expect(screen.getAllByRole("definition").map((value) => value.textContent)).toEqual([
            "claude-opus-5-5",
            "forja/issue-13",
        ]);
        expect(screen.getByText("claude-opus-5-5")).not.toHaveClass("font-mono");
        expect(screen.getByText("forja/issue-13")).toHaveClass("font-mono");
    });
});

type NodeRunTab = "input" | "output" | "logs";

function TabsHarness(): JSX.Element {
    const [selectedTab, setSelectedTab] = useState<NodeRunTab>("input");

    return (
        <Tabs
            label="Execução do nó"
            value={selectedTab}
            onValueChange={setSelectedTab}
            tabs={[
                { value: "input", label: "Entrada", content: "prompt" },
                { value: "output", label: "Saída", content: "resultado" },
                { value: "logs", label: "Logs", content: "linhas" },
            ]}
        />
    );
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

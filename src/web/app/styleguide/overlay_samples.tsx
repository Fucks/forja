import { useState } from "react";
import type { ComponentProps, JSX } from "react";

import { SampleRow, StyleguideSection } from "@/web/app/styleguide/styleguide_section.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";
import { Drawer } from "@/web/components/ui/drawer.js";
import { useToast } from "@/web/components/ui/toast.js";
import { Tooltip } from "@/web/components/ui/tooltip.js";

type DrawerSide = ComponentProps<typeof Drawer>["side"];

export function TooltipSamples(): JSX.Element {
    return (
        <StyleguideSection title="Tooltip">
            <Tooltip content="Publica a versão atual do fluxo">
                <Button>Passe o mouse ou foque</Button>
            </Tooltip>
        </StyleguideSection>
    );
}

export function ToastSamples(): JSX.Element {
    const toast = useToast();

    return (
        <StyleguideSection title="Toast">
            <SampleRow label="Tons">
                <Button onClick={() => toast.show({ title: "Run enfileirado", tone: "info" })}>
                    Mostrar informação
                </Button>
                <Button onClick={() => toast.show({ title: "Fluxo publicado", tone: "success" })}>
                    Mostrar sucesso
                </Button>
                <Button
                    onClick={() =>
                        toast.show({
                            title: "Falha ao iniciar o container",
                            description: "Verifique se o Docker está rodando.",
                            tone: "error",
                        })
                    }
                >
                    Mostrar erro
                </Button>
            </SampleRow>
        </StyleguideSection>
    );
}

export function DialogSamples(): JSX.Element {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <StyleguideSection title="Dialog">
            <Button onClick={() => setIsOpen(true)}>Abrir diálogo</Button>
            <Dialog
                open={isOpen}
                onOpenChange={setIsOpen}
                title="Excluir fluxo?"
                description="As versões publicadas continuam disponíveis nos runs antigos."
            >
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setIsOpen(false)}>
                        Cancelar
                    </Button>
                    <Button variant="danger" onClick={() => setIsOpen(false)}>
                        Excluir
                    </Button>
                </div>
            </Dialog>
        </StyleguideSection>
    );
}

export function DrawerSamples(): JSX.Element {
    const [openSide, setOpenSide] = useState<DrawerSide | null>(null);

    function closeWhenDismissed(isOpen: boolean): void {
        if (!isOpen) {
            setOpenSide(null);
        }
    }

    return (
        <StyleguideSection title="Drawer">
            <SampleRow label="Lados">
                <Button onClick={() => setOpenSide("right")}>Abrir à direita</Button>
                <Button onClick={() => setOpenSide("bottom")}>Abrir embaixo</Button>
            </SampleRow>
            <Drawer
                open={openSide === "right"}
                onOpenChange={closeWhenDismissed}
                side="right"
                title="Inspetor do nó"
            >
                <p className="text-muted">Configurações do nó selecionado.</p>
            </Drawer>
            <Drawer
                open={openSide === "bottom"}
                onOpenChange={closeWhenDismissed}
                side="bottom"
                title="Log do run"
            >
                <p className="font-mono text-muted">[agent] iniciando container…</p>
            </Drawer>
        </StyleguideSection>
    );
}

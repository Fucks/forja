import { Pencil, Play, Trash2 } from "lucide-react";
import type { JSX } from "react";

import { SampleRow, StyleguideSection } from "@/web/app/styleguide/styleguide_section.js";
import { Button } from "@/web/components/ui/button.js";
import { IconButton } from "@/web/components/ui/icon_button.js";

export function ButtonSamples(): JSX.Element {
    return (
        <StyleguideSection title="Button">
            <SampleRow label="Variantes">
                <Button variant="primary">Executar</Button>
                <Button variant="secondary">Salvar rascunho</Button>
                <Button variant="ghost">Cancelar</Button>
                <Button variant="danger">Excluir</Button>
            </SampleRow>
            <SampleRow label="Tamanhos">
                <Button size="sm">Pequeno</Button>
                <Button size="md">Médio</Button>
            </SampleRow>
            <SampleRow label="Estados">
                <Button variant="primary" loading>
                    Publicando
                </Button>
                <Button disabled>Indisponível</Button>
            </SampleRow>
        </StyleguideSection>
    );
}

export function IconButtonSamples(): JSX.Element {
    return (
        <StyleguideSection title="IconButton">
            <SampleRow label="Padrão e desabilitado">
                <IconButton label="Executar fluxo" icon={Play} />
                <IconButton label="Editar fluxo" icon={Pencil} />
                <IconButton label="Excluir fluxo" icon={Trash2} disabled />
            </SampleRow>
        </StyleguideSection>
    );
}

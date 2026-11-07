import "@xyflow/react/dist/style.css";
import "@/web/canvas/base/canvas_theme.css";

import type { JSX } from "react";

import { PageTitle } from "@/web/app/page_title.js";
import {
    BaseNodeSamples,
    FlowEdgeSamples,
    GroupFrameSamples,
} from "@/web/app/styleguide/canvas_samples.js";

export function StyleguideCanvasPage(): JSX.Element {
    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-1">
                <PageTitle>Styleguide do canvas</PageTitle>
                <p className="text-muted">
                    Nós, molduras de grupo e arestas em todos os estados. Use a alternância de tema
                    na barra superior para conferir os dois temas.
                </p>
            </header>
            <BaseNodeSamples />
            <GroupFrameSamples />
            <FlowEdgeSamples />
        </div>
    );
}

import { useState } from "react";
import type { JSX } from "react";

import { SampleRow, StyleguideSection } from "@/web/app/styleguide/styleguide_section.js";
import { Button } from "@/web/components/ui/button.js";
import { useToast } from "@/web/components/ui/toast.js";
import { LogViewer } from "@/web/logs/log_viewer.js";
import type { LogLine } from "@/web/logs/log_types.js";

const SAMPLE_LINE_COUNT = 10_000;
const LINES_ADDED_PER_CLICK = 50;
const MS_BETWEEN_SAMPLE_LINES = 350;

type SampleLineTemplate = Omit<LogLine, "seq" | "offsetMs">;

const CONTAINER_STARTED: SampleLineTemplate = {
    kind: "system",
    text: "Container forja-run iniciado",
};

const SAMPLE_LINE_TEMPLATES: SampleLineTemplate[] = [
    CONTAINER_STARTED,
    { kind: "text", text: "Vou ler o arquivo de rotas antes de alterar a navegação." },
    {
        kind: "tool_call",
        toolName: "Read",
        text: "src/web/app/routes.tsx",
        detail: '{\n  "file_path": "src/web/app/routes.tsx"\n}',
    },
    {
        kind: "tool_result",
        text: "112 linhas lidas",
        detail: 'import { createBrowserRouter } from "react-router";\n…',
    },
    {
        kind: "tool_call",
        toolName: "Bash",
        text: "npm run test",
        detail: '{\n  "command": "npm run test"\n}',
    },
    { kind: "error", text: "FAIL src/web/app/routes.test.tsx > redireciona para /projects" },
    { kind: "usage", text: "12,4 mil tokens de entrada · 1,8 mil de saída" },
];

export function LogViewerSamples(): JSX.Element {
    const toast = useToast();
    const [lines, setLines] = useState(() => generateSampleLines(SAMPLE_LINE_COUNT));

    function appendSampleLines(): void {
        setLines((current) => generateSampleLines(current.length + LINES_ADDED_PER_CLICK));
    }

    return (
        <StyleguideSection title="LogViewer">
            <SampleRow label="10 mil linhas">
                <Button onClick={appendSampleLines}>
                    Adicionar {LINES_ADDED_PER_CLICK} linhas
                </Button>
            </SampleRow>
            <div className="h-96 overflow-hidden rounded-md border border-border">
                <LogViewer
                    lines={lines}
                    onDownloadRaw={() => toast.show({ title: "Download do log bruto iniciado" })}
                />
            </div>
            <SampleRow label="Carregando e vazio">
                <div className="h-48 w-full max-w-md overflow-hidden rounded-md border border-border">
                    <LogViewer lines={[]} loading />
                </div>
                <div className="h-48 w-full max-w-md overflow-hidden rounded-md border border-border">
                    <LogViewer lines={[]} emptyLabel="Este nó ainda não rodou" />
                </div>
            </SampleRow>
        </StyleguideSection>
    );
}

function generateSampleLines(count: number): LogLine[] {
    return Array.from({ length: count }, (_, index) => ({
        ...pickTemplate(index),
        seq: index + 1,
        offsetMs: index * MS_BETWEEN_SAMPLE_LINES,
    }));
}

function pickTemplate(index: number): SampleLineTemplate {
    return SAMPLE_LINE_TEMPLATES[index % SAMPLE_LINE_TEMPLATES.length] ?? CONTAINER_STARTED;
}

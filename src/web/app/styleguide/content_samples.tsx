import { Workflow } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";

import { SampleRow, StyleguideSection } from "@/web/app/styleguide/styleguide_section.js";
import { Button } from "@/web/components/ui/button.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { KeyValue } from "@/web/components/ui/key_value.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { StatusBadge } from "@/web/components/ui/status_badge.js";
import { Tabs } from "@/web/components/ui/tabs.js";

type RunTab = "summary" | "logs" | "usage";

export function TabsSamples(): JSX.Element {
    const [selectedTab, setSelectedTab] = useState<RunTab>("summary");

    return (
        <StyleguideSection title="Tabs">
            <Tabs
                label="Detalhes do run"
                value={selectedTab}
                onValueChange={setSelectedTab}
                tabs={[
                    { value: "summary", label: "Resumo", content: <p>Resumo do run.</p> },
                    { value: "logs", label: "Logs", content: <p>Logs do run.</p> },
                    { value: "usage", label: "Uso", content: <p>Tokens consumidos.</p> },
                ]}
            />
        </StyleguideSection>
    );
}

export function EmptyStateSamples(): JSX.Element {
    return (
        <StyleguideSection title="EmptyState">
            <EmptyState
                icon={Workflow}
                title="Nenhum fluxo ainda"
                description="Crie um fluxo para orquestrar agentes neste projeto."
                action={<Button variant="primary">Criar fluxo</Button>}
            />
        </StyleguideSection>
    );
}

export function SkeletonSamples(): JSX.Element {
    return (
        <StyleguideSection title="Skeleton">
            <SampleRow label="Carregando lista">
                <div className="flex w-80 flex-col gap-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-8 w-full" />
                </div>
            </SampleRow>
        </StyleguideSection>
    );
}

export function KeyValueSamples(): JSX.Element {
    return (
        <StyleguideSection title="KeyValue">
            <KeyValue
                items={[
                    { label: "Run", value: "01JC3Z8K2W5Q", mono: true },
                    { label: "Estado", value: <StatusBadge status="RUNNING" size="sm" /> },
                    { label: "Branch", value: "forja/run-01JC3Z8K", mono: true },
                ]}
            />
        </StyleguideSection>
    );
}

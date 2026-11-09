import { AlertTriangle, CheckCircle2, CircleAlert, RotateCw, XOctagon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";

import type {
    DiagnosticItem,
    DiagnosticReport,
    DiagnosticStatus,
} from "@/shared/diagnostic_types.js";
import { PageTitle } from "@/web/app/page_title.js";
import { useDiagnostics, useRecheckDiagnostics } from "@/web/app/settings/use_diagnostics.js";
import { Button } from "@/web/components/ui/button.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { useToast } from "@/web/components/ui/toast.js";

interface DiagnosticStatusStyle {
    label: string;
    icon: LucideIcon;
    colorVar: string;
}

const DIAGNOSTIC_STATUS_STYLES: Record<DiagnosticStatus, DiagnosticStatusStyle> = {
    ok: { label: "OK", icon: CheckCircle2, colorVar: "--status-succeeded" },
    warning: { label: "Aviso", icon: AlertTriangle, colorVar: "--status-waiting-approval" },
    error: { label: "Erro", icon: XOctagon, colorVar: "--status-failed" },
};

const STATUS_ICON_SIZE_PX = 16;

export function DiagnosticsPage(): JSX.Element {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
                <PageTitle>Diagnóstico</PageTitle>
                <RecheckButton />
            </div>
            <DiagnosticsContent />
        </div>
    );
}

function RecheckButton(): JSX.Element {
    const recheck = useRecheckDiagnostics();
    const toast = useToast();

    function recheckDiagnostics(): void {
        recheck.mutate(undefined, {
            onError: (error) =>
                toast.show({
                    tone: "error",
                    title: "Não foi possível verificar de novo",
                    description: error.message,
                }),
        });
    }

    return (
        <Button loading={recheck.isPending} onClick={recheckDiagnostics}>
            <RotateCw aria-hidden className="size-3.5" />
            Verificar de novo
        </Button>
    );
}

function DiagnosticsContent(): JSX.Element {
    const diagnosticsQuery = useDiagnostics();

    if (diagnosticsQuery.isPending) {
        return <Skeleton className="h-48" />;
    }
    if (diagnosticsQuery.isError) {
        return (
            <EmptyState
                icon={CircleAlert}
                title="Não foi possível verificar o ambiente"
                description={diagnosticsQuery.error.message}
            />
        );
    }

    return <DiagnosticReportView report={diagnosticsQuery.data} />;
}

function DiagnosticReportView({ report }: { report: DiagnosticReport }): JSX.Element {
    return (
        <>
            <DiagnosticSummary items={report.items} />
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface">
                {report.items.map((item) => (
                    <DiagnosticRow key={item.id} item={item} />
                ))}
            </ul>
        </>
    );
}

function DiagnosticSummary({ items }: { items: DiagnosticItem[] }): JSX.Element {
    const { icon: Icon, colorVar } = DIAGNOSTIC_STATUS_STYLES[findWorstStatus(items)];

    return (
        <p className="flex items-center gap-2 text-md font-medium">
            <Icon
                size={STATUS_ICON_SIZE_PX}
                aria-hidden="true"
                style={{ color: `var(${colorVar})` }}
            />
            {describeReadiness(items)}
        </p>
    );
}

function DiagnosticRow({ item }: { item: DiagnosticItem }): JSX.Element {
    const labelId = `diagnostic-${item.id}`;

    return (
        <li aria-labelledby={labelId} className="flex items-start gap-3 px-4 py-3">
            <DiagnosticStatusLabel status={item.status} />
            <div className="flex min-w-0 flex-col gap-1">
                <span id={labelId} className="font-medium">
                    {item.label}
                </span>
                <span className="font-mono text-xs break-words text-muted">{item.detail}</span>
                {item.fix && (
                    <p className="flex flex-wrap gap-x-1 text-sm">
                        <span className="font-medium">Como resolver</span>
                        <span>{item.fix}</span>
                    </p>
                )}
            </div>
        </li>
    );
}

function DiagnosticStatusLabel({ status }: { status: DiagnosticStatus }): JSX.Element {
    const { label, icon: Icon, colorVar } = DIAGNOSTIC_STATUS_STYLES[status];

    return (
        <span
            className="inline-flex w-16 shrink-0 items-center gap-1.5 text-sm font-medium"
            style={{ color: `var(${colorVar})` }}
        >
            <Icon size={STATUS_ICON_SIZE_PX} aria-hidden="true" />
            <span>{label}</span>
        </span>
    );
}

function findWorstStatus(items: DiagnosticItem[]): DiagnosticStatus {
    if (items.some((item) => item.status === "error")) {
        return "error";
    }
    if (items.some((item) => item.status === "warning")) {
        return "warning";
    }

    return "ok";
}

function describeReadiness(items: DiagnosticItem[]): string {
    const errorCount = countWithStatus(items, "error");
    if (errorCount === 1) {
        return "1 problema impede rodar agentes";
    }
    if (errorCount > 1) {
        return `${errorCount} problemas impedem rodar agentes`;
    }

    const warningCount = countWithStatus(items, "warning");
    if (warningCount === 1) {
        return "Pronto para rodar agentes, com 1 aviso";
    }
    if (warningCount > 1) {
        return `Pronto para rodar agentes, com ${warningCount} avisos`;
    }

    return "Tudo pronto para rodar agentes";
}

function countWithStatus(items: DiagnosticItem[], status: DiagnosticStatus): number {
    return items.filter((item) => item.status === status).length;
}

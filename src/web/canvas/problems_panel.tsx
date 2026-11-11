import { useReactFlow } from "@xyflow/react";
import { ChevronDown, ChevronUp, CircleAlert, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";

import { formatCount } from "@/lib/format.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { describeIssueKey, ISSUE_NOUNS } from "@/web/canvas/use_validation.js";
import type { GraphValidation } from "@/web/canvas/use_validation.js";
import { cn } from "@/web/components/ui/cn.js";
import { IconButton } from "@/web/components/ui/icon_button.js";

type IssueLevel = ValidationIssue["level"];

const LEVEL_ICON_SIZE_PX = 14;
const FOCUS_ANIMATION_MS = 300;
const PANEL_TITLE = "Problemas";

const LEVEL_STYLES: Record<IssueLevel, { icon: LucideIcon; colorClass: string; label: string }> = {
    error: { icon: CircleAlert, colorClass: "text-status-failed", label: "Erro" },
    warning: { icon: TriangleAlert, colorClass: "text-status-waiting-approval", label: "Aviso" },
};

export function ProblemsPanel({
    validation,
    store,
}: {
    validation: GraphValidation;
    store: EditorStore;
}): JSX.Element {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const focusIssueTarget = useIssueTargetFocus(store);

    return (
        <section aria-label={PANEL_TITLE} className="border-t border-border bg-surface">
            <div className="flex items-center justify-between gap-2 px-3 py-1">
                <h2 className="text-sm font-medium">
                    {PANEL_TITLE} <span className="text-muted">{describeCounts(validation)}</span>
                </h2>
                <IconButton
                    label={isCollapsed ? `Mostrar ${PANEL_TITLE}` : `Recolher ${PANEL_TITLE}`}
                    icon={isCollapsed ? ChevronUp : ChevronDown}
                    aria-expanded={!isCollapsed}
                    onClick={() => setIsCollapsed(!isCollapsed)}
                />
            </div>
            {!isCollapsed && (
                <IssueList issues={validation.issues} onFocusTarget={focusIssueTarget} />
            )}
        </section>
    );
}

function IssueList({
    issues,
    onFocusTarget,
}: {
    issues: ValidationIssue[];
    onFocusTarget: (issue: ValidationIssue) => void;
}): JSX.Element {
    if (issues.length === 0) {
        return <p className="px-3 pb-2 text-sm text-muted">Nenhum problema encontrado.</p>;
    }

    return (
        <ul className="max-h-40 overflow-y-auto pb-1">
            {issues.map((issue) => (
                <li key={describeIssueKey(issue)}>
                    <IssueRow issue={issue} onFocusTarget={onFocusTarget} />
                </li>
            ))}
        </ul>
    );
}

function IssueRow({
    issue,
    onFocusTarget,
}: {
    issue: ValidationIssue;
    onFocusTarget: (issue: ValidationIssue) => void;
}): JSX.Element {
    const { icon: LevelIcon, colorClass, label } = LEVEL_STYLES[issue.level];
    const content = (
        <>
            <LevelIcon
                role="img"
                aria-label={label}
                size={LEVEL_ICON_SIZE_PX}
                className={cn("shrink-0", colorClass)}
            />
            <span>{issue.message}</span>
        </>
    );
    const rowClasses = "flex w-full items-center gap-2 px-3 py-1 text-left text-sm";

    // An issue about the whole flow has no node, edge or group to jump to.
    if (issue.target.id === undefined) {
        return <div className={rowClasses}>{content}</div>;
    }

    return (
        <button
            type="button"
            className={cn(rowClasses, "hover:bg-surface-raised")}
            onClick={() => onFocusTarget(issue)}
        >
            {content}
        </button>
    );
}

function useIssueTargetFocus(store: EditorStore): (issue: ValidationIssue) => void {
    const { fitView } = useReactFlow();

    return (issue) => {
        const targetId = issue.target.id;
        if (targetId === undefined) {
            return;
        }

        store.getState().select([targetId]);
        const nodeIds = listNodesToShow(issue.target.kind, targetId, store.getState().graph);
        void fitView({ nodes: nodeIds.map((id) => ({ id })), duration: FOCUS_ANIMATION_MS });
    };
}

// An edge is not a node React Flow can fit, so the view frames the two nodes it connects.
function listNodesToShow(
    targetKind: ValidationIssue["target"]["kind"],
    targetId: string,
    graph: FlowGraph,
): string[] {
    if (targetKind !== "edge") {
        return [targetId];
    }

    const edge = graph.edges.find((candidate) => candidate.id === targetId);
    if (!edge) {
        return [];
    }

    return [edge.from.nodeId, edge.to.nodeId];
}

function describeCounts({ errorCount, warningCount }: GraphValidation): string {
    const errors = formatCount(errorCount, ISSUE_NOUNS.error);
    const warnings = formatCount(warningCount, ISSUE_NOUNS.warning);

    return `${errors} · ${warnings}`;
}

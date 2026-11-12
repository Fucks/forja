import { useMemo } from "react";
import type { JSX, ReactNode } from "react";

import { diffFlowGraphs } from "@/engine/graph_diff.js";
import type { FlowGraphDiff } from "@/engine/graph_diff.js";
import type { FlowEdge, FlowGraph } from "@/shared/flow_graph.js";
import { ChangedElement } from "@/web/app/flows/changed_element.js";
import type { ComparedGraph } from "@/web/app/flows/use_version_comparison.js";

type ElementChangeKind = "added" | "removed";

const ELEMENT_CHANGE_STYLES: Record<
    ElementChangeKind,
    { marker: string; label: string; className: string }
> = {
    added: { marker: "+", label: "adicionado", className: "text-status-succeeded" },
    removed: { marker: "−", label: "removido", className: "text-status-failed" },
};

export function VersionDiffView({
    before,
    after,
}: {
    before: ComparedGraph;
    after: ComparedGraph;
}): JSX.Element {
    const diff = useMemo(() => diffFlowGraphs(before.graph, after.graph), [before, after]);

    if (isEmptyDiff(diff)) {
        return (
            <p className="p-4 text-muted">
                Nenhuma diferença entre {before.label} e {after.label}.
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-5 p-4">
            <NodeChanges diff={diff} />
            <GroupChanges diff={diff} afterGraph={after.graph} />
            <EdgeChanges diff={diff} nodeLabels={collectNodeLabels(before.graph, after.graph)} />
        </div>
    );
}

function NodeChanges({ diff }: { diff: FlowGraphDiff }): JSX.Element | null {
    const { addedNodes, removedNodes, changedNodes } = diff;
    if (addedNodes.length + removedNodes.length + changedNodes.length === 0) {
        return null;
    }

    return (
        <DiffSection title="Nós">
            {addedNodes.map((node) => (
                <ElementChangeRow key={node.id} kind="added" description={node.label} />
            ))}
            {removedNodes.map((node) => (
                <ElementChangeRow key={node.id} kind="removed" description={node.label} />
            ))}
            {changedNodes.map((node) => (
                <ChangedElement key={node.nodeId} label={node.label} changes={node.changes} />
            ))}
        </DiffSection>
    );
}

function GroupChanges({
    diff,
    afterGraph,
}: {
    diff: FlowGraphDiff;
    afterGraph: FlowGraph;
}): JSX.Element | null {
    const { addedGroups, removedGroups, changedGroups } = diff;
    if (addedGroups.length + removedGroups.length + changedGroups.length === 0) {
        return null;
    }

    return (
        <DiffSection title="Grupos">
            {addedGroups.map((group) => (
                <ElementChangeRow key={group.id} kind="added" description={group.label} />
            ))}
            {removedGroups.map((group) => (
                <ElementChangeRow key={group.id} kind="removed" description={group.label} />
            ))}
            {changedGroups.map((group) => (
                <ChangedElement
                    key={group.groupId}
                    label={findGroupLabel(afterGraph, group.groupId)}
                    changes={group.changes}
                />
            ))}
        </DiffSection>
    );
}

function EdgeChanges({
    diff,
    nodeLabels,
}: {
    diff: FlowGraphDiff;
    nodeLabels: Map<string, string>;
}): JSX.Element | null {
    const { addedEdges, removedEdges } = diff;
    if (addedEdges.length + removedEdges.length === 0) {
        return null;
    }

    return (
        <DiffSection title="Conexões">
            {addedEdges.map((edge) => (
                <ElementChangeRow
                    key={edge.id}
                    kind="added"
                    description={describeEdge(edge, nodeLabels)}
                />
            ))}
            {removedEdges.map((edge) => (
                <ElementChangeRow
                    key={edge.id}
                    kind="removed"
                    description={describeEdge(edge, nodeLabels)}
                />
            ))}
        </DiffSection>
    );
}

function DiffSection({ title, children }: { title: string; children: ReactNode }): JSX.Element {
    return (
        <section aria-label={title} className="flex flex-col gap-2">
            <h2 className="font-condensed text-base font-semibold">{title}</h2>
            {children}
        </section>
    );
}

function ElementChangeRow({
    kind,
    description,
}: {
    kind: ElementChangeKind;
    description: string;
}): JSX.Element {
    const { marker, label, className } = ELEMENT_CHANGE_STYLES[kind];

    return (
        <p className={className}>
            <span aria-hidden="true">{marker} </span>
            {description} <span className="text-xs text-muted">({label})</span>
        </p>
    );
}

function isEmptyDiff(diff: FlowGraphDiff): boolean {
    return Object.values(diff).every((elements: unknown[]) => elements.length === 0);
}

// Removed nodes exist only in the older graph, so both graphs name the edges' ends.
function collectNodeLabels(before: FlowGraph, after: FlowGraph): Map<string, string> {
    return new Map([...before.nodes, ...after.nodes].map((node) => [node.id, node.label]));
}

function describeEdge(edge: FlowEdge, nodeLabels: Map<string, string>): string {
    const fromLabel = nodeLabels.get(edge.from.nodeId) ?? edge.from.nodeId;
    const toLabel = nodeLabels.get(edge.to.nodeId) ?? edge.to.nodeId;

    return `${fromLabel}.${edge.from.port} → ${toLabel}.${edge.to.port}`;
}

function findGroupLabel(graph: FlowGraph, groupId: string): string {
    return graph.groups.find((group) => group.id === groupId)?.label ?? groupId;
}

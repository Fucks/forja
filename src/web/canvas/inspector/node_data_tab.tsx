import type { JSX, ReactNode } from "react";
import { useParams } from "react-router";

import { assertNever } from "@/lib/assert_never.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import { listInputSources } from "@/web/canvas/inspector/node_input_sources.js";
import type {
    InputSource,
    InputSourceState,
    PortOrigin,
} from "@/web/canvas/inspector/node_input_sources.js";
import { useLastNodeRunSample } from "@/web/canvas/inspector/use_last_node_run_sample.js";
import type { NodeRunSample } from "@/web/canvas/inspector/use_last_node_run_sample.js";
import type { GroupKind, PortDoc } from "@/web/docs/node_docs/node_doc.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";

interface OutputPortRow {
    name: string;
    label: string;
    type: string;
    description: string;
}

const NO_RUN_YET_MESSAGE =
    "Ainda não há execução deste nó. Rode o fluxo para ver dados reais aqui.";
const GROUP_INPUTS_MESSAGE = "Os nós dentro do grupo recebem os dados pelas próprias entradas.";
const JSON_INDENT_SPACES = 2;

export function NodeDataTab({ node, graph }: { node: FlowNode; graph: FlowGraph }): JSX.Element {
    return (
        <div className="flex flex-col gap-4 px-3 pb-3 text-sm">
            <DataSection title="Entradas">
                <InputSourceList sources={listInputSources(graph, node)} />
            </DataSection>
            <DataSection title="Saídas">
                <OutputPortList rows={listOutputPortRows(node)} />
            </DataSection>
            <DataSection title="Última execução">
                <LastRunSample nodeId={node.id} />
            </DataSection>
        </div>
    );
}

export function GroupDataTab({ kind }: { kind: GroupKind }): JSX.Element {
    return (
        <div className="flex flex-col gap-4 px-3 pb-3 text-sm">
            <DataSection title="Entradas">
                <p className="text-muted">{GROUP_INPUTS_MESSAGE}</p>
            </DataSection>
            <DataSection title="Saídas">
                <OutputPortList rows={getNodeDoc(kind).ports.outputs.map(toOutputPortRow)} />
            </DataSection>
        </div>
    );
}

function DataSection({ title, children }: { title: string; children: ReactNode }): JSX.Element {
    return (
        <section className="flex flex-col gap-2">
            <h3 className="font-medium text-text">{title}</h3>
            {children}
        </section>
    );
}

function InputSourceList({ sources }: { sources: InputSource[] }): JSX.Element {
    if (sources.length === 0) {
        return <p className="text-muted">Este nó não tem entradas.</p>;
    }

    return (
        <ul aria-label="Entradas" className="flex flex-col gap-1">
            {sources.map(({ portName, source }) => (
                <li key={portName}>
                    <span className="font-mono">{portName}</span> {describeSource(source)}
                </li>
            ))}
        </ul>
    );
}

function describeSource(source: InputSourceState): string {
    switch (source.status) {
        case "connected":
            return source.origins.map(describeOrigin).join(", ");
        case "automatic":
            return "automático";
        case "unconnected":
            return "não ligada";
        default:
            return assertNever(source);
    }
}

function describeOrigin(origin: PortOrigin): string {
    return `← ${origin.nodeLabel} › ${origin.portLabel}`;
}

function OutputPortList({ rows }: { rows: OutputPortRow[] }): JSX.Element {
    if (rows.length === 0) {
        return <p className="text-muted">Sem saídas.</p>;
    }

    return (
        <ul aria-label="Saídas" className="flex flex-col gap-2">
            {rows.map((row) => (
                <li key={row.name} className="flex flex-col">
                    <span>
                        <span className="font-medium">{row.label}</span>{" "}
                        <span className="font-mono text-xs text-muted">{row.type}</span>
                    </span>
                    {row.description && (
                        <span className="text-xs text-muted">{row.description}</span>
                    )}
                </li>
            ))}
        </ul>
    );
}

function listOutputPortRows(node: FlowNode): OutputPortRow[] {
    const portDocs = getNodeDoc(node.type).ports.outputs;

    return node.outputs.map((port) => {
        const portDoc = portDocs.find((candidate) => candidate.name === port.name);
        if (!portDoc) {
            return { name: port.name, label: port.name, type: port.type, description: "" };
        }

        return toOutputPortRow(portDoc);
    });
}

function toOutputPortRow({ name, label, type, description }: PortDoc): OutputPortRow {
    return { name, label, type, description };
}

// The sample is looked up in the runs of the flow open in the editor.
function LastRunSample({ nodeId }: { nodeId: string }): JSX.Element {
    const { projectId, flowId } = useParams();
    if (projectId === undefined || flowId === undefined) {
        return <p className="text-muted">{NO_RUN_YET_MESSAGE}</p>;
    }

    return <LastRunSampleOfFlow projectId={projectId} flowId={flowId} nodeId={nodeId} />;
}

function LastRunSampleOfFlow(nodeInFlow: {
    projectId: string;
    flowId: string;
    nodeId: string;
}): JSX.Element {
    const sample = useLastNodeRunSample(nodeInFlow);
    if (!sample) {
        return <p className="text-muted">{NO_RUN_YET_MESSAGE}</p>;
    }

    return <SampleValues sample={sample} />;
}

function SampleValues({ sample }: { sample: NodeRunSample }): JSX.Element {
    return (
        <div className="flex flex-col gap-2">
            <CollapsibleJson title="Entradas recebidas" json={sample.inputs} />
            <CollapsibleJson title="Saídas produzidas" json={sample.outputs} />
        </div>
    );
}

function CollapsibleJson({ title, json }: { title: string; json: unknown }): JSX.Element {
    return (
        <details>
            <summary className="cursor-pointer select-none">{title}</summary>
            <pre className="mt-1 overflow-x-auto rounded-sm bg-canvas p-2 font-mono text-xs">
                {JSON.stringify(json ?? {}, null, JSON_INDENT_SPACES)}
            </pre>
        </details>
    );
}

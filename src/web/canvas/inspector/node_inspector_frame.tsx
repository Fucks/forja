import type { JSX, ReactNode } from "react";

import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectorHeader } from "@/web/canvas/inspector/inspector_header.js";
import { InspectorTabs } from "@/web/canvas/inspector/inspector_tabs.js";
import { NodeDataTab } from "@/web/canvas/inspector/node_data_tab.js";
import { NodeDocView } from "@/web/docs/node_doc_view.js";
import type { DocumentedType } from "@/web/docs/node_docs/node_doc.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";

// Every inspector, of a node or of a group: the header, then the Configurar, Dados and Ajuda tabs.
export function InspectorFrame({
    type,
    label,
    onLabelChange,
    data,
    children,
}: {
    type: DocumentedType;
    label: string;
    onLabelChange: (label: string) => void;
    data: ReactNode;
    children: ReactNode;
}): JSX.Element {
    return (
        <div className="flex flex-col">
            <InspectorHeader type={type} label={label} onLabelChange={onLabelChange} />
            <InspectorTabs
                type={type}
                configure={<div className="flex flex-col">{children}</div>}
                data={data}
                help={
                    <div className="px-3 pb-3">
                        <NodeDocView doc={getNodeDoc(type)} placement="drawer" />
                    </div>
                }
            />
        </div>
    );
}

export function NodeInspectorFrame({
    node,
    graph,
    onChange,
    children,
}: Pick<InspectorProps, "node" | "graph" | "onChange"> & {
    children: ReactNode;
}): JSX.Element {
    return (
        <InspectorFrame
            type={node.type}
            label={node.label}
            onLabelChange={(label) => onChange((current) => ({ ...current, label }))}
            data={<NodeDataTab node={node} graph={graph} />}
        >
            {children}
        </InspectorFrame>
    );
}

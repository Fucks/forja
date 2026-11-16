import type { JSX } from "react";

import type { PortDoc } from "@/web/docs/node_docs/node_doc.js";

export function NodeDocPortsTable({
    caption,
    ports,
}: {
    caption: string;
    ports: PortDoc[];
}): JSX.Element {
    if (ports.length === 0) {
        return (
            <p>
                <span className="font-medium">{caption}:</span>{" "}
                <span className="text-muted">nenhuma.</span>
            </p>
        );
    }

    return (
        <table className="w-full border-collapse text-left">
            <caption className="text-left font-medium">{caption}</caption>
            <thead className="border-b border-border text-muted">
                <tr>
                    <th className="py-2 pr-4 font-medium">Porta</th>
                    <th className="py-2 pr-4 font-medium">Tipo</th>
                    <th className="py-2 pr-4 font-medium">Obrigatória</th>
                    <th className="py-2 font-medium">Descrição</th>
                </tr>
            </thead>
            <tbody>
                {ports.map((port) => (
                    <PortRow key={port.name} port={port} />
                ))}
            </tbody>
        </table>
    );
}

function PortRow({ port }: { port: PortDoc }): JSX.Element {
    return (
        <tr className="border-b border-border align-top">
            <td className="py-2 pr-4">
                <div>{port.label}</div>
                <code className="font-mono text-xs text-muted">{port.name}</code>
            </td>
            <td className="py-2 pr-4">
                <code className="font-mono text-xs">{port.type}</code>
            </td>
            <td className="py-2 pr-4">{port.required ? "Sim" : "Não"}</td>
            <td className="py-2">{port.description}</td>
        </tr>
    );
}

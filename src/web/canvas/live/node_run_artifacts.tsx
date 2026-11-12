import type { JSX } from "react";

import { assertNever } from "@/lib/assert_never.js";
import type { ArtifactKind, SerializedArtifact } from "@/shared/run_types.js";
import { JsonView } from "@/web/canvas/live/json_view.js";

const ARTIFACT_KIND_LABELS: Record<ArtifactKind, string> = {
    text: "Texto",
    json: "JSON",
    branch: "Branch",
    pr_url: "Pull request",
};

export function NodeRunArtifacts({ artifacts }: { artifacts: SerializedArtifact[] }): JSX.Element {
    if (artifacts.length === 0) {
        return <p className="text-sm text-muted">Esta execução não gerou artefatos.</p>;
    }

    return (
        <ul aria-label="Artefatos" className="flex flex-col gap-3">
            {artifacts.map((artifact) => (
                <li key={artifact.id} className="flex flex-col gap-1">
                    <p className="text-sm">
                        <span className="font-medium">{artifact.name}</span>{" "}
                        <span className="text-muted">{ARTIFACT_KIND_LABELS[artifact.kind]}</span>
                    </p>
                    <ArtifactValue artifact={artifact} />
                </li>
            ))}
        </ul>
    );
}

function ArtifactValue({ artifact }: { artifact: SerializedArtifact }): JSX.Element {
    const { kind, name, value } = artifact;
    if (typeof value !== "string") {
        return <JsonView label={name} value={value} />;
    }

    switch (kind) {
        case "pr_url":
            return (
                <a href={value} target="_blank" rel="noreferrer" className="text-accent underline">
                    {value}
                </a>
            );
        case "text":
        case "json":
        case "branch":
            return <p className="font-mono text-xs break-all whitespace-pre-wrap">{value}</p>;
        default:
            return assertNever(kind);
    }
}

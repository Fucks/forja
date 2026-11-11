import { useMemo, useState } from "react";

import type { ValidationContext } from "@/engine/graph_validation.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";
import { useCredentials } from "@/web/app/settings/use_credentials.js";
import { describeIssueKey, summarizeIssues, useValidation } from "@/web/canvas/use_validation.js";
import type { GraphValidation } from "@/web/canvas/use_validation.js";

export interface EditorIssues extends GraphValidation {
    showRefusedPublish: (issues: ValidationIssue[]) => void;
}

interface RefusedPublish {
    graph: FlowGraph;
    issues: ValidationIssue[];
}

const NO_ISSUES: ValidationIssue[] = [];

// The issues of a refused publish belong to the graph that was sent; once the graph changes the
// canvas validation speaks for it again.
export function useEditorIssues(graph: FlowGraph): EditorIssues {
    const validation = useValidation(graph, useEditorValidationContext());
    const [refusedPublish, setRefusedPublish] = useState<RefusedPublish>();
    const refusedIssues = refusedPublish?.graph === graph ? refusedPublish.issues : NO_ISSUES;
    const summary = useMemo(
        () => summarizeIssues(withoutRepeatedIssues([...validation.issues, ...refusedIssues])),
        [validation.issues, refusedIssues],
    );

    return {
        ...summary,
        showRefusedPublish: (serverIssues) => setRefusedPublish({ graph, issues: serverIssues }),
    };
}

// Only the credentials are checked, as the server does when publishing (tool profiles: #23).
function useEditorValidationContext(): ValidationContext {
    const credentials = useCredentials().data;

    return useMemo(
        () => ({ knownCredentialIds: credentials?.map((credential) => credential.id) }),
        [credentials],
    );
}

function withoutRepeatedIssues(issues: ValidationIssue[]): ValidationIssue[] {
    const seenKeys = new Set<string>();

    return issues.filter((issue) => {
        const key = describeIssueKey(issue);
        if (seenKeys.has(key)) {
            return false;
        }

        seenKeys.add(key);
        return true;
    });
}

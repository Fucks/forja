import type { ValidationIssue } from "@/shared/validation_issue.js";
import type { RFEdge } from "@/web/canvas/graph_mapping.js";
import { markInvalidEdges } from "@/web/canvas/validation_overlay.js";

const EDGE: RFEdge = { id: "dev.summary->reviewer.context", source: "dev", target: "reviewer" };

function edgeIssue(level: ValidationIssue["level"]): ValidationIssue {
    return {
        level,
        code: "incompatible_ports",
        message: "As portas ligadas têm tipos incompatíveis.",
        target: { kind: "edge", id: EDGE.id },
    };
}

describe("markInvalidEdges", () => {
    it("marks an edge with errors as invalid", () => {
        const issuesByTarget = new Map([[EDGE.id, [edgeIssue("error")]]]);

        const [markedEdge] = markInvalidEdges([EDGE], issuesByTarget);

        expect(markedEdge?.data).toEqual({ invalid: true });
    });

    it("leaves an edge with only warnings as it is", () => {
        const issuesByTarget = new Map([[EDGE.id, [edgeIssue("warning")]]]);

        expect(markInvalidEdges([EDGE], issuesByTarget)).toEqual([EDGE]);
    });
});

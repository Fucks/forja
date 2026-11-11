import { act, renderHook } from "@testing-library/react";

import type { ValidationContext } from "@/engine/graph_validation.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { buildCanonicalFlow, buildLoopFlow } from "@/test/factories/flow_graph_factory.js";
import {
    removeEdges,
    removeNodes,
    updateAgentConfig,
} from "@/test/factories/flow_graph_variations.js";
import { useValidation, VALIDATION_DEBOUNCE_MS } from "@/web/canvas/use_validation.js";

const NO_CONTEXT: ValidationContext = {};

describe("useValidation", () => {
    it("finds no issues in a valid flow", () => {
        const { result } = renderHook(() => useValidation(buildCanonicalFlow(), NO_CONTEXT));

        expect(result.current).toEqual({
            issues: [],
            byTarget: new Map(),
            errorCount: 0,
            warningCount: 0,
        });
    });

    it("groups the issues by the id of the node, edge or group they point to", () => {
        const graph = updateAgentConfig(buildCanonicalFlow(), "dev", { prompt: "" });

        const { result } = renderHook(() => useValidation(graph, NO_CONTEXT));

        expect(result.current.byTarget.get("dev")).toEqual([
            expect.objectContaining({ code: "empty_prompt" }),
        ]);
    });

    it("keeps issues about the whole flow out of the grouping by target", () => {
        const graph = removeNodes(buildCanonicalFlow(), ["trigger"]);

        const { result } = renderHook(() => useValidation(graph, NO_CONTEXT));

        expect(result.current.issues).toContainEqual(
            expect.objectContaining({ code: "no_trigger" }),
        );
        expect([...result.current.byTarget.values()].flat()).not.toContainEqual(
            expect.objectContaining({ code: "no_trigger" }),
        );
    });

    it("counts errors and warnings apart", () => {
        const loopWithoutBackEdge = removeEdges(buildLoopFlow(), ["review.summary->dev.notes"]);
        const graph = updateAgentConfig(loopWithoutBackEdge, "dev", { prompt: "" });

        const { result } = renderHook(() => useValidation(graph, NO_CONTEXT));

        expect(result.current.errorCount).toBe(1);
        expect(result.current.warningCount).toBe(1);
    });

    it("reports unknown variables in prompts, as the server does on publish", () => {
        const graph = updateAgentConfig(buildCanonicalFlow(), "dev", {
            prompt: "Implemente {{inputs.inexistente}}",
        });

        const { result } = renderHook(() => useValidation(graph, NO_CONTEXT));

        expect(result.current.byTarget.get("dev")).toEqual([
            expect.objectContaining({ code: "unknown_variable" }),
        ]);
    });

    it("uses the given context to find unknown credentials", () => {
        const graph = updateAgentConfig(buildCanonicalFlow(), "dev", { credentialId: "crd_gone" });

        const { result } = renderHook(() => useValidation(graph, { knownCredentialIds: [] }));

        expect(result.current.byTarget.get("dev")).toEqual([
            expect.objectContaining({ code: "unknown_credential" }),
        ]);
    });

    describe("when the graph changes", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it("keeps the previous issues until the graph stops changing for the debounce delay", () => {
            const { result, rerender } = renderValidationOf(buildCanonicalFlow());

            rerender({ graph: removeNodes(buildCanonicalFlow(), ["trigger"]) });
            advanceTime(VALIDATION_DEBOUNCE_MS - 1);

            expect(result.current.errorCount).toBe(0);
        });

        it("validates the latest graph once the debounce delay has passed", () => {
            const { result, rerender } = renderValidationOf(buildCanonicalFlow());

            rerender({ graph: removeNodes(buildCanonicalFlow(), ["trigger"]) });
            advanceTime(VALIDATION_DEBOUNCE_MS);

            expect(result.current.issues).toContainEqual(
                expect.objectContaining({ code: "no_trigger" }),
            );
        });

        it("restarts the delay on every change", () => {
            const { result, rerender } = renderValidationOf(buildCanonicalFlow());

            rerender({ graph: removeNodes(buildCanonicalFlow(), ["trigger"]) });
            advanceTime(VALIDATION_DEBOUNCE_MS - 1);
            rerender({ graph: removeNodes(buildCanonicalFlow(), ["trigger", "source"]) });
            advanceTime(VALIDATION_DEBOUNCE_MS - 1);

            expect(result.current.errorCount).toBe(0);
        });
    });
});

function renderValidationOf(
    initialGraph: FlowGraph,
): ReturnType<typeof renderHook<ReturnType<typeof useValidation>, { graph: FlowGraph }>> {
    return renderHook(({ graph }) => useValidation(graph, NO_CONTEXT), {
        initialProps: { graph: initialGraph },
    });
}

function advanceTime(ms: number): void {
    act(() => {
        vi.advanceTimersByTime(ms);
    });
}

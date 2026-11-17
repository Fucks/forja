import { findGroup, type LoopGroup } from "@/engine/graph_queries.js";
import {
    decideAfterIteration,
    iterationData,
    type LoopIterationData,
    type LoopInstanceState,
    startLoop,
} from "@/engine/loop_group.js";
import { type Condition, evaluateCondition } from "@/shared/conditions.js";
import { parseFlowGraph } from "@/shared/flow_graph.js";
import { buildLoopFlow } from "@/test/factories/flow_graph_factory.js";
import standardFlowV1 from "@/test/fixtures/standard_flow_v1.json" with { type: "json" };

const REVIEW_APPROVED: Condition = { op: "eq", path: "nodes.revisar.approved", value: true };
const NOTES_PORT = "notes";
// The until of the review loop in the v1 fixture, which read the node slugs at the root.
const UNTIL_V1: Condition = { op: "eq", path: "revisar.result.approved", value: true };

describe("startLoop", () => {
    it("starts at iteration 1 with the cap of the group and nothing carried", () => {
        const state = startLoop(reviewLoopOf(buildLoopFlow()), "42");

        expect(state).toEqual({
            groupId: "review_loop",
            itemId: "42",
            iteration: 1,
            maxIterations: 3,
            status: "running",
            carry: {},
        });
    });
});

describe("iterationData", () => {
    it("puts the outputs of each loop node under nodes, by the slug of its label", () => {
        const graph = buildLoopFlow();

        const data = iterationData(graph, reviewLoopOf(graph), {
            dev: { summary: "feito" },
            tests: { result: { exitCode: 1 } },
            review: { approved: false, notes: "faltam testes" },
        });

        expect(data).toEqual({
            nodes: {
                desenvolver: { summary: "feito" },
                testes: { result: { exitCode: 1 } },
                revisar: { approved: false, notes: "faltam testes" },
            },
        });
    });

    it("leaves out nodes outside the loop and loop nodes without outputs", () => {
        const graph = buildLoopFlow();

        const data = iterationData(graph, reviewLoopOf(graph), {
            source: { items: [] },
            review: { approved: true },
        });

        expect(data).toEqual({ nodes: { revisar: { approved: true } } });
    });
});

describe("decideAfterIteration", () => {
    it("exits when the condition holds on the outputs of the iteration", () => {
        const state = runningLoop({ iteration: 2 });

        const decision = decideAfterIteration(state, REVIEW_APPROVED, reviewData(true), []);

        expect(decision.next).toBe("exit");
        expect(decision.state).toEqual({ ...state, status: "succeeded" });
    });

    it("repeats with the next iteration while below the cap", () => {
        const state = runningLoop({ iteration: 1 });

        const decision = decideAfterIteration(state, REVIEW_APPROVED, reviewData(false), []);

        expect(decision.next).toBe("repeat");
        expect(decision.state).toEqual({ ...state, iteration: 2 });
    });

    it("leaves through exhausted when the condition is still false at the cap", () => {
        const state = runningLoop({ iteration: 3 });

        const decision = decideAfterIteration(state, REVIEW_APPROVED, reviewData(false), []);

        expect(decision.next).toBe("exhausted");
        expect(decision.state).toEqual({ ...state, status: "exhausted" });
    });

    it("carries the values of the carry ports of the iteration", () => {
        const state = runningLoop({ iteration: 1 });

        const decision = decideAfterIteration(state, REVIEW_APPROVED, reviewData(false), [
            NOTES_PORT,
        ]);

        expect(decision.state.carry).toEqual({ notes: "faltam testes" });
    });

    it("replaces the carry with the values of the last iteration", () => {
        const state = runningLoop({ iteration: 1, carry: { notes: "antigas", other: 1 } });
        const data = { nodes: { revisar: { approved: false, notes: "novas" } } };

        const decision = decideAfterIteration(state, REVIEW_APPROVED, data, [NOTES_PORT]);

        expect(decision.state.carry).toEqual({ notes: "novas" });
    });

    it("leaves out a carry port that no node produced in the iteration", () => {
        const state = runningLoop({ iteration: 1 });
        const data = { nodes: { revisar: { approved: false } } };

        const decision = decideAfterIteration(state, REVIEW_APPROVED, data, [NOTES_PORT]);

        expect(decision.state.carry).toEqual({});
    });
});

describe("a v1 until migrated to nodes", () => {
    it("exits on the same iteration as before the migration", () => {
        const graph = parseFlowGraph(standardFlowV1);
        const reviewLoop = findGroup(graph, "review_loop");
        if (reviewLoop?.kind !== "loop") {
            throw new Error("the standard flow has no review_loop loop group");
        }
        const reviewOutputs = { review: { result: { approved: true } } };
        const outputsV1 = { revisar: { result: { approved: true } } };

        const decision = decideAfterIteration(
            runningLoop({ iteration: 1 }),
            reviewLoop.config.until,
            iterationData(graph, reviewLoop, reviewOutputs),
            [],
        );

        expect(evaluateCondition(UNTIL_V1, outputsV1)).toBe(true);
        expect(decision.next).toBe("exit");
    });
});

function reviewLoopOf(graph: ReturnType<typeof buildLoopFlow>): LoopGroup {
    const group = findGroup(graph, "review_loop");
    if (group?.kind !== "loop") {
        throw new Error("buildLoopFlow has no review_loop loop group");
    }

    return group;
}

function runningLoop(overrides: Partial<LoopInstanceState>): LoopInstanceState {
    return {
        groupId: "review_loop",
        itemId: "1",
        iteration: 1,
        maxIterations: 3,
        status: "running",
        carry: {},
        ...overrides,
    };
}

function reviewData(isApproved: boolean): LoopIterationData {
    return {
        nodes: {
            testes: { result: { exitCode: 0 } },
            revisar: { approved: isApproved, notes: "faltam testes" },
        },
    };
}

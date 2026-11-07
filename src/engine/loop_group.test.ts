import { findGroup, type LoopGroup } from "@/engine/graph_queries.js";
import {
    decideAfterIteration,
    iterationData,
    type LoopInstanceState,
    startLoop,
} from "@/engine/loop_group.js";
import type { Condition } from "@/shared/conditions.js";
import { buildLoopFlow } from "@/test/factories/flow_graph_factory.js";

const REVIEW_APPROVED: Condition = { op: "eq", path: "revisar.approved", value: true };
const NOTES_PORT = "notes";

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
    it("names the outputs of each loop node by the slug of its label", () => {
        const graph = buildLoopFlow();

        const data = iterationData(graph, reviewLoopOf(graph), {
            dev: { summary: "feito" },
            tests: { result: { exitCode: 1 } },
            review: { approved: false, notes: "faltam testes" },
        });

        expect(data).toEqual({
            desenvolver: { summary: "feito" },
            testes: { result: { exitCode: 1 } },
            revisar: { approved: false, notes: "faltam testes" },
        });
    });

    it("leaves out nodes outside the loop and loop nodes without outputs", () => {
        const graph = buildLoopFlow();

        const data = iterationData(graph, reviewLoopOf(graph), {
            source: { items: [] },
            review: { approved: true },
        });

        expect(data).toEqual({ revisar: { approved: true } });
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
        const data = { revisar: { approved: false, notes: "novas" } };

        const decision = decideAfterIteration(state, REVIEW_APPROVED, data, [NOTES_PORT]);

        expect(decision.state.carry).toEqual({ notes: "novas" });
    });

    it("leaves out a carry port that no node produced in the iteration", () => {
        const state = runningLoop({ iteration: 1 });
        const data = { revisar: { approved: false } };

        const decision = decideAfterIteration(state, REVIEW_APPROVED, data, [NOTES_PORT]);

        expect(decision.state.carry).toEqual({});
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

function reviewData(isApproved: boolean): Record<string, unknown> {
    return {
        testes: { result: { exitCode: 0 } },
        revisar: { approved: isApproved, notes: "faltam testes" },
    };
}

import { buildSerializedNodeRun } from "@/test/factories/run_view_factory.js";
import { describeNodeRun, sortNodeRuns } from "@/web/canvas/live/node_run_sorting.js";

describe("sortNodeRuns", () => {
    it("puts the running NodeRuns first", () => {
        const succeeded = buildSerializedNodeRun({ id: "a", workItemId: "1", status: "SUCCEEDED" });
        const running = buildSerializedNodeRun({ id: "b", workItemId: "2", status: "RUNNING" });

        const sorted = sortNodeRuns([succeeded, running]);

        expect(sorted.map((nodeRun) => nodeRun.id)).toEqual(["b", "a"]);
    });

    it("orders the items by their number", () => {
        const itemTen = buildSerializedNodeRun({ id: "ten", workItemId: "10" });
        const itemTwo = buildSerializedNodeRun({ id: "two", workItemId: "2" });

        const sorted = sortNodeRuns([itemTen, itemTwo]);

        expect(sorted.map((nodeRun) => nodeRun.id)).toEqual(["two", "ten"]);
    });

    it("shows the latest iteration and then the latest attempt first within an item", () => {
        const firstIteration = buildSerializedNodeRun({ id: "i1a2", iteration: 1, attempt: 2 });
        const secondIteration = buildSerializedNodeRun({ id: "i2a1", iteration: 2, attempt: 1 });
        const secondIterationRetried = buildSerializedNodeRun({
            id: "i2a2",
            iteration: 2,
            attempt: 2,
        });

        const sorted = sortNodeRuns([firstIteration, secondIteration, secondIterationRetried]);

        expect(sorted.map((nodeRun) => nodeRun.id)).toEqual(["i2a2", "i2a1", "i1a2"]);
    });

    it("does not change the given list", () => {
        const nodeRuns = [
            buildSerializedNodeRun({ id: "a", workItemId: "2" }),
            buildSerializedNodeRun({ id: "b", workItemId: "1" }),
        ];

        sortNodeRuns(nodeRuns);

        expect(nodeRuns.map((nodeRun) => nodeRun.id)).toEqual(["a", "b"]);
    });
});

describe("describeNodeRun", () => {
    it("names the item, the iteration and the attempt", () => {
        const nodeRun = buildSerializedNodeRun({ workItemId: "42", iteration: 2, attempt: 1 });

        expect(describeNodeRun(nodeRun)).toBe("item #42 · iteração 2 · tentativa 1");
    });

    it("leaves out the iteration outside loops", () => {
        const nodeRun = buildSerializedNodeRun({ workItemId: "42", iteration: 0, attempt: 3 });

        expect(describeNodeRun(nodeRun)).toBe("item #42 · tentativa 3");
    });

    it("leaves out the item of a NodeRun that runs for every item", () => {
        const nodeRun = buildSerializedNodeRun({ iteration: 0, attempt: 1 });

        expect(describeNodeRun(nodeRun)).toBe("tentativa 1");
    });
});

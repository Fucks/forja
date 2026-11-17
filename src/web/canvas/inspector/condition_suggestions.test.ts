import { buildCanonicalFlow, buildLoopFlow } from "@/test/factories/flow_graph_factory.js";
import { listUpstreamOutputPaths } from "@/web/canvas/inspector/condition_suggestions.js";

describe("listUpstreamOutputPaths", () => {
    it("lists the outputs of every upstream node as nodes.<label-slug>.<port>, nearest first", () => {
        const graph = buildCanonicalFlow();

        const paths = listUpstreamOutputPaths(graph, "dev");

        expect(paths).toEqual([
            "nodes.tl.result",
            "nodes.tl.summary",
            "nodes.fonte.items",
            "nodes.gatilho.items",
        ]);
    });

    it("leaves out the node itself and nodes downstream of it", () => {
        const graph = buildCanonicalFlow();

        const paths = listUpstreamOutputPaths(graph, "tl");

        expect(paths).not.toContain("nodes.tl.summary");
        expect(paths).not.toContain("nodes.dev.summary");
    });

    it("lists each upstream node once when the flow has a loop", () => {
        const graph = buildLoopFlow();

        const paths = listUpstreamOutputPaths(graph, "review");

        expect(new Set(paths).size).toBe(paths.length);
    });

    it("lists nothing for a node without inputs connected", () => {
        const graph = buildCanonicalFlow();

        expect(listUpstreamOutputPaths(graph, "trigger")).toEqual([]);
    });
});

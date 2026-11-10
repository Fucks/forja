import { buildCanonicalFlow, buildLoopFlow } from "@/test/factories/flow_graph_factory.js";
import { listUpstreamOutputPaths } from "@/web/canvas/inspector/condition_suggestions.js";

describe("listUpstreamOutputPaths", () => {
    it("lists the outputs of every upstream node as <label-slug>.<port>, nearest first", () => {
        const graph = buildCanonicalFlow();

        const paths = listUpstreamOutputPaths(graph, "dev");

        expect(paths).toEqual(["tl.result", "tl.summary", "fonte.items", "gatilho.items"]);
    });

    it("leaves out the node itself and nodes downstream of it", () => {
        const graph = buildCanonicalFlow();

        const paths = listUpstreamOutputPaths(graph, "tl");

        expect(paths).not.toContain("tl.summary");
        expect(paths).not.toContain("dev.summary");
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

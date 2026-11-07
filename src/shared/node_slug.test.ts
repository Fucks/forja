import { nodeSlug } from "@/shared/node_slug.js";

describe("nodeSlug", () => {
    it("lowercases a single word label", () => {
        expect(nodeSlug("Revisar")).toBe("revisar");
    });

    it("removes accents", () => {
        expect(nodeSlug("Especificação")).toBe("especificacao");
    });

    it("joins words with underscores", () => {
        expect(nodeSlug("Abrir PR")).toBe("abrir_pr");
    });

    it("ignores surrounding spaces and collapses repeated spaces", () => {
        expect(nodeSlug("  Revisar   código ")).toBe("revisar_codigo");
    });
});

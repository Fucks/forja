import type { HandleType } from "@xyflow/react";

import type { NodeType, PortType } from "@/shared/flow_graph.js";
import {
    findFirstCompatiblePort,
    listCompatibleNodeTypes,
} from "@/web/canvas/palette/compatible_node_types.js";

describe("listCompatibleNodeTypes", () => {
    it.each<[PortType, NodeType[]]>([
        ["workItemList", ["source"]],
        ["workItem", ["source", "agent", "script", "gate", "git", "output"]],
        ["text", ["source", "agent", "git"]],
        ["json", ["source", "condition"]],
        ["any", ["source", "agent", "script", "condition", "gate", "git", "output"]],
    ])("lists the nodes with an input that accepts an output of type %s", (portType, expected) => {
        const compatibleTypes = listCompatibleNodeTypes(portType, "source");

        expect(compatibleTypes).toEqual(expected);
    });

    it.each<[PortType, NodeType[]]>([
        ["workItemList", ["trigger", "source", "condition"]],
        ["workItem", ["condition", "gate"]],
        ["text", ["agent", "script", "condition"]],
        ["json", ["agent", "script", "condition", "git"]],
        ["any", ["trigger", "source", "agent", "script", "condition", "gate", "git"]],
    ])("lists the nodes with an output that feeds an input of type %s", (portType, expected) => {
        const compatibleTypes = listCompatibleNodeTypes(portType, "target");

        expect(compatibleTypes).toEqual(expected);
    });
});

describe("findFirstCompatiblePort", () => {
    it.each<[NodeType, PortType, HandleType, string | undefined]>([
        ["agent", "text", "source", "context"],
        ["git", "workItem", "source", "item"],
        ["agent", "text", "target", "summary"],
        ["condition", "workItem", "target", "true"],
        ["trigger", "workItem", "source", undefined],
    ])(
        "picks on a new %s the first port that connects to a dragged %s %s",
        (nodeType, portType, from, expectedPort) => {
            const port = findFirstCompatiblePort(nodeType, portType, from);

            expect(port).toBe(expectedPort);
        },
    );
});

import type { Port } from "@/shared/flow_graph.js";
import { describePort } from "@/web/canvas/base/port_label.js";

const AGENT_RESULT_PORT: Port = { name: "result", type: "json", required: true };
const USER_PORT: Port = { name: "spec", type: "text", required: true };

describe("describePort", () => {
    it("names a default port and explains it from the node catalog", () => {
        const description = describePort("agent", AGENT_RESULT_PORT);

        expect(description).toEqual({
            label: "Resultado",
            description: "Os dados que seguem o Formato da resposta. É o que as Decisões leem.",
        });
    });

    it("shows the description the user wrote for a port they created", () => {
        const port: Port = { ...USER_PORT, description: "A especificação escrita pelo TL." };

        const description = describePort("agent", port);

        expect(description).toEqual({
            label: "spec",
            description: "A especificação escrita pelo TL.",
        });
    });

    it("names a user port without description by its own name", () => {
        const description = describePort("agent", USER_PORT);

        expect(description).toEqual({ label: "spec" });
    });
});

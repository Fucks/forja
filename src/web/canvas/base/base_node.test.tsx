import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import { Bot } from "lucide-react";
import type { ReactNode } from "react";

import { BaseNode } from "@/web/canvas/base/base_node.js";
import type { BaseNodeProps } from "@/web/canvas/base/base_node.js";
import { PortHandle } from "@/web/canvas/base/port_handle.js";
import type { PortView } from "@/web/canvas/base/port_handle.js";
import {
    EXECUTION_STATUS_STYLES,
    EXECUTION_STATUSES,
} from "@/web/components/ui/execution_status.js";

const ITEM_PORT: BaseNodeProps["inputs"][number] = {
    name: "item",
    label: "Item atual",
    type: "workItem",
    required: true,
};

const AGENT_NODE: BaseNodeProps = {
    typeIcon: Bot,
    typeLabel: "Agente",
    label: "Implementar issue",
    summary: "opus · effort high",
    inputs: [
        ITEM_PORT,
        { name: "context", label: "Contexto extra", type: "text", required: false },
    ],
    outputs: [{ name: "result", label: "Resultado", type: "json" }],
};

const RESULT_PORT: PortView = {
    name: "result",
    label: "Resultado",
    description: "Os dados que seguem o Formato da resposta.",
    type: "json",
};

describe("BaseNode", () => {
    it("shows the node label and its type", () => {
        renderInFlow(<BaseNode {...AGENT_NODE} />);

        expect(screen.getByText("Implementar issue")).toBeInTheDocument();
        expect(screen.getByText("Agente")).toBeInTheDocument();
    });

    it("labels every input and output port", () => {
        renderInFlow(<BaseNode {...AGENT_NODE} />);

        expect(screen.getByText("Item atual")).toBeInTheDocument();
        expect(screen.getByText("Contexto extra")).toBeInTheDocument();
        expect(screen.getByText("Resultado")).toBeInTheDocument();
    });

    it("shows the badge an input port carries next to its label", () => {
        const inputs = [{ ...ITEM_PORT, badge: "automático" }];

        renderInFlow(<BaseNode {...AGENT_NODE} inputs={inputs} />);

        expect(screen.getByText("automático")).toBeInTheDocument();
    });

    it("shows the summary in the body", () => {
        renderInFlow(<BaseNode {...AGENT_NODE} />);

        expect(screen.getByText("opus · effort high")).toBeInTheDocument();
    });

    it.each(EXECUTION_STATUSES)("names the %s status badge for assistive technology", (status) => {
        renderInFlow(<BaseNode {...AGENT_NODE} status={status} />);

        const statusLabel = EXECUTION_STATUS_STYLES[status].label;
        expect(screen.getByRole("img", { name: statusLabel })).toBeInTheDocument();
    });

    it("shows no status badge outside execution mode", () => {
        renderInFlow(<BaseNode {...AGENT_NODE} />);

        expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("glows while the node is running", () => {
        renderInFlow(<BaseNode {...AGENT_NODE} status="RUNNING" />);

        expect(findNodeFrame()).toHaveClass("animate-ember");
    });

    it("does not glow once the node has finished", () => {
        renderInFlow(<BaseNode {...AGENT_NODE} status="SUCCEEDED" />);

        expect(findNodeFrame()).not.toHaveClass("animate-ember");
    });

    it("shows the execution badge in the header", () => {
        renderInFlow(<BaseNode {...AGENT_NODE} status="RUNNING" badge="item #42" />);

        expect(screen.getByText("item #42")).toBeInTheDocument();
    });

    it("warns about an invalid node", () => {
        renderInFlow(<BaseNode {...AGENT_NODE} invalid />);

        expect(screen.getByRole("img", { name: "Configuração inválida" })).toBeInTheDocument();
    });

    it("links the header to the documentation of the node type", () => {
        renderInFlow(<BaseNode {...AGENT_NODE} documentationHref="/docs/nodes/agent" />);

        const link = screen.getByRole("link", { name: "Documentação de Agente" });
        expect(link).toHaveAttribute("href", "/docs/nodes/agent");
        expect(link).toHaveAttribute("target", "_blank");
    });

    it("hides the summary and the ports in compact mode", () => {
        renderInFlow(<BaseNode {...AGENT_NODE} compact />);

        expect(screen.getByText("Implementar issue")).toBeInTheDocument();
        expect(screen.queryByText("opus · effort high")).not.toBeInTheDocument();
        expect(screen.queryByText("Item atual")).not.toBeInTheDocument();
        expect(screen.queryByText("Resultado")).not.toBeInTheDocument();
    });
});

describe("PortHandle", () => {
    it("labels the port with its friendly name", () => {
        renderInFlow(<PortHandle side="right" {...RESULT_PORT} required />);

        expect(screen.getByText("Resultado")).toBeInTheDocument();
    });

    it("draws the icon of the port type", () => {
        const { container } = renderInFlow(<PortHandle side="right" {...RESULT_PORT} required />);

        expect(container.querySelector("svg.lucide-braces")).not.toBeNull();
    });

    it("explains the port in a tooltip with its name, type and whether it is required", async () => {
        const user = userEvent.setup();
        renderInFlow(<PortHandle side="right" {...RESULT_PORT} required />);

        await user.hover(screen.getByText("Resultado"));

        const tooltip = await screen.findByRole("tooltip");
        expect(tooltip).toHaveTextContent("Os dados que seguem o Formato da resposta.");
        expect(tooltip).toHaveTextContent("result · JSON · obrigatória");
    });

    it("tells in the tooltip that an optional port is optional", async () => {
        const user = userEvent.setup();
        renderInFlow(<PortHandle side="left" name="notes" label="notes" type="text" />);

        await user.hover(screen.getByText("notes"));

        expect(await screen.findByRole("tooltip")).toHaveTextContent("notes · texto · opcional");
    });

    it("draws a filled circle for a required port", () => {
        const { container } = renderInFlow(<PortHandle side="right" {...RESULT_PORT} required />);

        expect(findHandle(container)).not.toHaveClass("port-handle--optional");
    });

    it("draws a hollow circle for an optional port", () => {
        const { container } = renderInFlow(
            <PortHandle side="left" name="notes" label="notes" type="text" />,
        );

        expect(findHandle(container)).toHaveClass("port-handle--optional");
    });

    it("receives connections on the left and sends them on the right", () => {
        const { container } = renderInFlow(
            <>
                <PortHandle side="left" name="item" label="Item atual" type="workItem" />
                <PortHandle side="right" {...RESULT_PORT} />
            </>,
        );

        const [inputHandle, outputHandle] = container.querySelectorAll(".react-flow__handle");
        expect(inputHandle).toHaveClass("target");
        expect(outputHandle).toHaveClass("source");
    });
});

function renderInFlow(children: ReactNode): ReturnType<typeof render> {
    return render(<ReactFlowProvider>{children}</ReactFlowProvider>);
}

function findNodeFrame(): HTMLElement {
    return screen.getByRole("group", { name: "Implementar issue" });
}

function findHandle(container: HTMLElement): Element | null {
    return container.querySelector(".react-flow__handle");
}

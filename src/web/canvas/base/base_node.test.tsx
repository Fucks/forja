import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import { Bot } from "lucide-react";
import type { ReactNode } from "react";

import { BaseNode } from "@/web/canvas/base/base_node.js";
import type { BaseNodeProps } from "@/web/canvas/base/base_node.js";
import { PortHandle } from "@/web/canvas/base/port_handle.js";
import {
    EXECUTION_STATUS_STYLES,
    EXECUTION_STATUSES,
} from "@/web/components/ui/execution_status.js";

const AGENT_NODE: BaseNodeProps = {
    typeIcon: Bot,
    typeLabel: "Agente",
    label: "Implementar issue",
    summary: "opus · effort high",
    inputs: [
        { name: "issue", type: "Issue", required: true },
        { name: "notes", type: "string", required: false },
    ],
    outputs: [{ name: "branch", type: "string" }],
};

describe("BaseNode", () => {
    it("shows the node label and its type", () => {
        renderInFlow(<BaseNode {...AGENT_NODE} />);

        expect(screen.getByText("Implementar issue")).toBeInTheDocument();
        expect(screen.getByText("Agente")).toBeInTheDocument();
    });

    it("labels every input and output port", () => {
        renderInFlow(<BaseNode {...AGENT_NODE} />);

        expect(screen.getByText("issue")).toBeInTheDocument();
        expect(screen.getByText("notes")).toBeInTheDocument();
        expect(screen.getByText("branch")).toBeInTheDocument();
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

    it("hides the summary and the ports in compact mode", () => {
        renderInFlow(<BaseNode {...AGENT_NODE} compact />);

        expect(screen.getByText("Implementar issue")).toBeInTheDocument();
        expect(screen.queryByText("opus · effort high")).not.toBeInTheDocument();
        expect(screen.queryByText("issue")).not.toBeInTheDocument();
        expect(screen.queryByText("branch")).not.toBeInTheDocument();
    });
});

describe("PortHandle", () => {
    it("labels the port with its name", () => {
        renderInFlow(<PortHandle side="left" name="issue" type="Issue" required />);

        expect(screen.getByText("issue")).toBeInTheDocument();
    });

    it("shows the port type in a tooltip", async () => {
        const user = userEvent.setup();
        renderInFlow(<PortHandle side="left" name="issue" type="Issue" required />);

        await user.hover(screen.getByText("issue"));

        expect(await screen.findByRole("tooltip", { name: "Issue" })).toBeInTheDocument();
    });

    it("draws a filled circle for a required port", () => {
        const { container } = renderInFlow(
            <PortHandle side="left" name="issue" type="Issue" required />,
        );

        expect(findHandle(container)).not.toHaveClass("port-handle--optional");
    });

    it("draws a hollow circle for an optional port", () => {
        const { container } = renderInFlow(<PortHandle side="left" name="notes" type="string" />);

        expect(findHandle(container)).toHaveClass("port-handle--optional");
    });

    it("receives connections on the left and sends them on the right", () => {
        const { container } = renderInFlow(
            <>
                <PortHandle side="left" name="issue" type="Issue" />
                <PortHandle side="right" name="branch" type="string" />
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

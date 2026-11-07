import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import type { ReactNode } from "react";

import { PortHandle } from "@/web/canvas/base/port_handle.js";

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

function findHandle(container: HTMLElement): Element | null {
    return container.querySelector(".react-flow__handle");
}

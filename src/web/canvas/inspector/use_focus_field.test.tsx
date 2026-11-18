import { act, render, screen } from "@testing-library/react";
import type { JSX, ReactNode } from "react";

import {
    createFieldFocusStore,
    FieldFocusContext,
    InspectedTargetContext,
    useFocusField,
    useIsFieldFocusRequested,
} from "@/web/canvas/inspector/use_focus_field.js";
import type { FieldFocusStore } from "@/web/canvas/inspector/use_focus_field.js";

describe("useFocusField", () => {
    it("focuses the field of the inspected element that the request names", () => {
        const store = createFieldFocusStore();
        renderInspectorOf("dev", store, <PromptField />);

        act(() => store.getState().requestFocus({ targetId: "dev", fieldKey: "prompt" }));

        expect(screen.getByRole("textbox", { name: "Prompt" })).toHaveFocus();
    });

    it("focuses a field that appears after the request, once the inspector shows it", () => {
        const store = createFieldFocusStore();
        store.getState().requestFocus({ targetId: "dev", fieldKey: "prompt" });

        renderInspectorOf("dev", store, <PromptField />);

        expect(screen.getByRole("textbox", { name: "Prompt" })).toHaveFocus();
    });

    it("opens the folded section around the field", () => {
        const store = createFieldFocusStore();
        renderInspectorOf(
            "dev",
            store,
            <details data-testid="section">
                <summary>Avançado</summary>
                <PromptField />
            </details>,
        );

        act(() => store.getState().requestFocus({ targetId: "dev", fieldKey: "prompt" }));

        expect(screen.getByTestId("section")).toHaveAttribute("open");
        expect(screen.getByRole("textbox", { name: "Prompt" })).toHaveFocus();
    });

    it("prefers the editable control over the buttons of the field", () => {
        const store = createFieldFocusStore();
        renderInspectorOf("dev", store, <PromptField withToolbarButton />);

        act(() => store.getState().requestFocus({ targetId: "dev", fieldKey: "prompt" }));

        expect(screen.getByRole("textbox", { name: "Prompt" })).toHaveFocus();
    });

    it("forgets the request once the field is focused", () => {
        const store = createFieldFocusStore();
        renderInspectorOf("dev", store, <PromptField />);

        act(() => store.getState().requestFocus({ targetId: "dev", fieldKey: "prompt" }));

        expect(store.getState().pendingRequest).toBeUndefined();
    });

    it("leaves the field of another element alone", () => {
        const store = createFieldFocusStore();
        renderInspectorOf("reviewer", store, <PromptField />);

        act(() => store.getState().requestFocus({ targetId: "dev", fieldKey: "prompt" }));

        expect(screen.getByRole("textbox", { name: "Prompt" })).not.toHaveFocus();
        expect(store.getState().pendingRequest).toEqual({ targetId: "dev", fieldKey: "prompt" });
    });

    it("does nothing without a focus store, as in an inspector shown alone", () => {
        render(<PromptField />);

        expect(screen.getByRole("textbox", { name: "Prompt" })).not.toHaveFocus();
    });
});

describe("useIsFieldFocusRequested", () => {
    it("tells the inspector of the requested element that one of its fields is wanted", () => {
        const store = createFieldFocusStore();
        renderInspectorOf("dev", store, <RequestIndicator />);

        act(() => store.getState().requestFocus({ targetId: "dev", fieldKey: "prompt" }));

        expect(screen.getByText("pedido")).toBeInTheDocument();
    });

    it("stays quiet in the inspector of another element", () => {
        const store = createFieldFocusStore();
        renderInspectorOf("reviewer", store, <RequestIndicator />);

        act(() => store.getState().requestFocus({ targetId: "dev", fieldKey: "prompt" }));

        expect(screen.getByText("nenhum pedido")).toBeInTheDocument();
    });
});

function renderInspectorOf(targetId: string, store: FieldFocusStore, children: ReactNode): void {
    render(
        <FieldFocusContext value={store}>
            <InspectedTargetContext value={targetId}>{children}</InspectedTargetContext>
        </FieldFocusContext>,
    );
}

function PromptField({ withToolbarButton = false }: { withToolbarButton?: boolean }): JSX.Element {
    const fieldRef = useFocusField<HTMLDivElement>("prompt");

    return (
        <div ref={fieldRef}>
            {withToolbarButton && <button type="button">Inserir dado</button>}
            <textarea aria-label="Prompt" />
        </div>
    );
}

function RequestIndicator(): JSX.Element {
    return <p>{useIsFieldFocusRequested() ? "pedido" : "nenhum pedido"}</p>;
}

import { act, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
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

    it("waits for an editor that builds its control after mounting", async () => {
        const store = createFieldFocusStore();
        renderInspectorOf("dev", store, <LateEditorField />);

        act(() => store.getState().requestFocus({ targetId: "dev", fieldKey: "prompt" }));

        expect(await screen.findByRole("textbox", { name: "Prompt" })).toHaveFocus();
    });

    it("focuses the first button of a field without an editable control", () => {
        vi.useFakeTimers();
        const store = createFieldFocusStore();
        renderInspectorOf("dev", store, <ButtonsOnlyField />);

        act(() => store.getState().requestFocus({ targetId: "dev", fieldKey: "outputSchema" }));
        act(() => {
            vi.runAllTimers();
        });

        expect(screen.getByRole("button", { name: "Adicionar campo" })).toHaveFocus();
        expect(store.getState().pendingRequest).toBeUndefined();
        vi.useRealTimers();
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

function LateEditorField(): JSX.Element {
    const fieldRef = useFocusField<HTMLDivElement>("prompt");
    const [isEditorBuilt, setIsEditorBuilt] = useState(false);
    useEffect(() => {
        setTimeout(() => setIsEditorBuilt(true), 0);
    }, []);

    return (
        <div ref={fieldRef}>
            <button type="button">Inserir dado</button>
            {isEditorBuilt && <div role="textbox" aria-label="Prompt" contentEditable="true" />}
        </div>
    );
}

function ButtonsOnlyField(): JSX.Element {
    const fieldRef = useFocusField<HTMLDivElement>("outputSchema");

    return (
        <div ref={fieldRef}>
            <button type="button">Adicionar campo</button>
        </div>
    );
}

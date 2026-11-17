import CodeMirror from "@uiw/react-codemirror";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { Maximize2 } from "lucide-react";
import { useImperativeHandle, useMemo, useRef, useState } from "react";
import type { JSX, ReactNode, Ref } from "react";

import type { VariableInfo } from "@/engine/prompt_template.js";
import { buildPromptEditorExtensions } from "@/web/canvas/inspector/prompt_editor_extensions.js";
import { useDebouncedCallback } from "@/web/canvas/inspector/use_debounced_callback.js";
import { Dialog } from "@/web/components/ui/dialog.js";
import { IconButton } from "@/web/components/ui/icon_button.js";

const PROMPT_CHANGE_DEBOUNCE_MS = 300;

const CODEMIRROR_SETUP = { lineNumbers: false, foldGutter: false, highlightActiveLine: false };

export interface PromptEditorHandle {
    insertAtCursor: (text: string) => void;
}

export function PromptEditor({
    prompt,
    variables,
    onChange,
    toolbarActions,
    ref,
}: {
    prompt: string;
    variables: VariableInfo[];
    onChange: (prompt: string) => void;
    toolbarActions?: ReactNode;
    ref?: Ref<PromptEditorHandle>;
}): JSX.Element {
    const codeMirrorRef = useRef<ReactCodeMirrorRef>(null);
    const [editedPrompt, setEditedPrompt] = useState(prompt);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const applyPrompt = useDebouncedCallback(onChange, PROMPT_CHANGE_DEBOUNCE_MS);
    const extensions = useMemo(() => buildPromptEditorExtensions(variables), [variables]);
    useImperativeHandle(ref, () => ({
        insertAtCursor: (text) => replaceSelection(codeMirrorRef.current, text),
    }));

    function editPrompt(nextPrompt: string): void {
        setEditedPrompt(nextPrompt);
        applyPrompt(nextPrompt);
    }

    const editor = (
        <CodeMirror
            ref={codeMirrorRef}
            value={editedPrompt}
            onChange={editPrompt}
            extensions={extensions}
            basicSetup={CODEMIRROR_SETUP}
            theme="none"
            height="100%"
            className="h-full text-sm"
        />
    );

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-end gap-1">
                {toolbarActions}
                <IconButton
                    label="Editar prompt em tela cheia"
                    icon={Maximize2}
                    onClick={() => setIsFullScreen(true)}
                />
            </div>
            <div className="h-48 min-h-24 resize-y overflow-auto rounded-sm border border-border">
                {!isFullScreen && editor}
            </div>
            <Dialog open={isFullScreen} onOpenChange={setIsFullScreen} title="Prompt" size="lg">
                <div className="mt-3 h-[70vh] rounded-sm border border-border">{editor}</div>
            </Dialog>
        </div>
    );
}

// The editor reports the new text through its onChange, so the prompt is applied like typing.
function replaceSelection(codeMirror: ReactCodeMirrorRef | null, text: string): void {
    const view = codeMirror?.view;
    if (!view) {
        return;
    }

    view.dispatch(view.state.replaceSelection(text));
    view.focus();
}

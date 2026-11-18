import CodeMirror from "@uiw/react-codemirror";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { Maximize2 } from "lucide-react";
import { useImperativeHandle, useMemo, useRef, useState } from "react";
import type { JSX, ReactNode, Ref } from "react";

import type { VariableInfo } from "@/engine/prompt_template.js";
import { buildPromptEditorExtensions } from "@/web/canvas/inspector/prompt_editor_extensions.js";
import type { PromptLanguage } from "@/web/canvas/inspector/prompt_editor_extensions.js";
import { useDebouncedCallback } from "@/web/canvas/inspector/use_debounced_callback.js";
import { cn } from "@/web/components/ui/cn.js";
import { Dialog } from "@/web/components/ui/dialog.js";
import { IconButton } from "@/web/components/ui/icon_button.js";

const PROMPT_CHANGE_DEBOUNCE_MS = 300;

const CODEMIRROR_SETUP = { lineNumbers: false, foldGutter: false, highlightActiveLine: false };

// CodeMirror's default line height, used to size the shell editor by its number of lines.
const LINE_HEIGHT_EM = 1.4;
const SHELL_MIN_LINES = 4;
const SHELL_MAX_LINES = 12;

interface EditorSizing {
    boxClassName?: string;
    height?: string;
    minHeight?: string;
    maxHeight?: string;
}

interface LanguageSettings {
    label: string;
    sizing: EditorSizing;
}

const LANGUAGE_SETTINGS: Record<PromptLanguage, LanguageSettings> = {
    markdown: {
        label: "Prompt",
        sizing: { boxClassName: "h-48 min-h-24 resize-y overflow-auto", height: "100%" },
    },
    shell: {
        label: "Comando",
        sizing: {
            minHeight: toLinesHeight(SHELL_MIN_LINES),
            maxHeight: toLinesHeight(SHELL_MAX_LINES),
        },
    },
};

const FULL_SCREEN_SIZING: EditorSizing = { boxClassName: "h-[70vh]", height: "100%" };

export interface PromptEditorHandle {
    insertAtCursor: (text: string) => void;
    replaceAll: (text: string) => void;
}

export function PromptEditor({
    prompt,
    variables,
    onChange,
    toolbarActions,
    language = "markdown",
    ref,
}: {
    prompt: string;
    variables: VariableInfo[];
    onChange: (prompt: string) => void;
    toolbarActions?: ReactNode;
    language?: PromptLanguage;
    ref?: Ref<PromptEditorHandle>;
}): JSX.Element {
    const codeMirrorRef = useRef<ReactCodeMirrorRef>(null);
    const [editedPrompt, setEditedPrompt] = useState(prompt);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const applyPrompt = useDebouncedCallback(onChange, PROMPT_CHANGE_DEBOUNCE_MS);
    const { label, sizing } = LANGUAGE_SETTINGS[language];
    const extensions = useMemo(
        () => buildPromptEditorExtensions(variables, { label, language }),
        [variables, label, language],
    );
    useImperativeHandle(ref, () => ({
        insertAtCursor: (text) => replaceSelection(codeMirrorRef.current, text),
        replaceAll: (text) => replaceDocument(codeMirrorRef.current, text),
    }));

    function editPrompt(nextPrompt: string): void {
        setEditedPrompt(nextPrompt);
        applyPrompt(nextPrompt);
    }

    function renderEditor(editorSizing: EditorSizing): JSX.Element {
        return (
            <div className={cn("rounded-sm border border-border", editorSizing.boxClassName)}>
                <CodeMirror
                    ref={codeMirrorRef}
                    value={editedPrompt}
                    onChange={editPrompt}
                    extensions={extensions}
                    basicSetup={CODEMIRROR_SETUP}
                    theme="none"
                    height={editorSizing.height}
                    minHeight={editorSizing.minHeight}
                    maxHeight={editorSizing.maxHeight}
                    className="h-full text-sm"
                />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-end gap-1">
                {toolbarActions}
                <IconButton
                    label={`Editar ${label.toLowerCase()} em tela cheia`}
                    icon={Maximize2}
                    onClick={() => setIsFullScreen(true)}
                />
            </div>
            {!isFullScreen && renderEditor(sizing)}
            <Dialog open={isFullScreen} onOpenChange={setIsFullScreen} title={label} size="lg">
                <div className="mt-3">{renderEditor(FULL_SCREEN_SIZING)}</div>
            </Dialog>
        </div>
    );
}

function toLinesHeight(lines: number): string {
    return `${lines * LINE_HEIGHT_EM}em`;
}

// Both edits reach the editor's onChange, so the new text is applied like typing.
function replaceSelection(codeMirror: ReactCodeMirrorRef | null, text: string): void {
    const view = codeMirror?.view;
    if (!view) {
        return;
    }

    view.dispatch(view.state.replaceSelection(text));
    view.focus();
}

function replaceDocument(codeMirror: ReactCodeMirrorRef | null, text: string): void {
    const view = codeMirror?.view;
    if (!view) {
        return;
    }

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}

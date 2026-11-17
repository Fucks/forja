import { autocompletion } from "@codemirror/autocomplete";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { RangeSetBuilder } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";

import type { VariableInfo } from "@/engine/prompt_template.js";
import { promptCompletions } from "@/web/canvas/inspector/prompt_completion.js";
import { findPromptVariables } from "@/web/canvas/inspector/prompt_highlighting.js";

export type PromptLanguage = "markdown" | "shell";

interface PromptEditorSettings {
    label: string;
    language: PromptLanguage;
}

const LANGUAGE_EXTENSIONS: Record<PromptLanguage, () => Extension[]> = {
    markdown: () => [markdown()],
    shell: () => [],
};

const KNOWN_VARIABLE_MARK = Decoration.mark({ class: "text-status-succeeded" });
const UNKNOWN_VARIABLE_MARK = Decoration.mark({
    class: "text-status-failed underline decoration-wavy",
});

const PROMPT_EDITOR_THEME = EditorView.theme({
    "&": { height: "100%", backgroundColor: "var(--color-surface)", color: "var(--color-text)" },
    ".cm-content, .cm-scroller": { fontFamily: "var(--font-mono)" },
    "&.cm-focused": { outline: "none" },
    ".cm-cursor": { borderLeftColor: "var(--color-text)" },
});

export function buildPromptEditorExtensions(
    variables: VariableInfo[],
    { label, language }: PromptEditorSettings,
): Extension[] {
    return [
        ...LANGUAGE_EXTENSIONS[language](),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ "aria-label": label }),
        PROMPT_EDITOR_THEME,
        autocompletion({ override: [completeVariables(variables)] }),
        highlightVariables(new Set(variables.map((variable) => variable.path))),
    ];
}

function completeVariables(
    variables: VariableInfo[],
): (context: CompletionContext) => CompletionResult | null {
    return (context) => {
        const line = context.state.doc.lineAt(context.pos);
        const textBeforeCursor = context.state.sliceDoc(line.from, context.pos);
        const completions = promptCompletions(variables, textBeforeCursor);
        if (!completions) {
            return null;
        }

        return { from: line.from + completions.from, options: completions.options };
    };
}

function highlightVariables(knownPaths: ReadonlySet<string>): Extension {
    const decorate = (view: EditorView): DecorationSet =>
        buildVariableDecorations(view.state.doc.toString(), knownPaths);

    return ViewPlugin.define(
        (view) => ({
            decorations: decorate(view),
            update(update: ViewUpdate) {
                if (update.docChanged) {
                    this.decorations = decorate(update.view);
                }
            },
        }),
        { decorations: (plugin) => plugin.decorations },
    );
}

function buildVariableDecorations(prompt: string, knownPaths: ReadonlySet<string>): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    for (const variable of findPromptVariables(prompt, knownPaths)) {
        const mark = variable.isKnown ? KNOWN_VARIABLE_MARK : UNKNOWN_VARIABLE_MARK;
        builder.add(variable.from, variable.to, mark);
    }

    return builder.finish();
}

import type { GroupKind } from "@/web/canvas/grouping.js";

export type ShortcutCommand = "undo" | "redo" | "duplicate" | "selectAll" | "fitView" | "openHelp";

export type KeyPress = Pick<
    KeyboardEvent,
    "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
>;

export const GROUPING_SHORTCUT_LABELS: Record<GroupKind, string> = { map: "G M", loop: "G L" };

export const SHORTCUTS: { keys: string; action: string }[] = [
    { keys: "Ctrl/Cmd+Z", action: "Desfazer" },
    { keys: "Ctrl/Cmd+Shift+Z ou Ctrl+Y", action: "Refazer" },
    { keys: "Ctrl/Cmd+C", action: "Copiar a seleção" },
    { keys: "Ctrl/Cmd+V", action: "Colar" },
    { keys: "Ctrl/Cmd+D", action: "Duplicar a seleção" },
    { keys: "Delete", action: "Apagar a seleção" },
    { keys: "Ctrl/Cmd+A", action: "Selecionar tudo" },
    { keys: GROUPING_SHORTCUT_LABELS.map, action: "Agrupar a seleção em map" },
    { keys: GROUPING_SHORTCUT_LABELS.loop, action: "Agrupar a seleção em loop" },
    { keys: "Shift+1", action: "Ajustar à tela" },
    { keys: "?", action: "Mostrar os atalhos" },
];

// "mod" is Ctrl, or Cmd on macOS. Copy and paste come from the browser's clipboard events instead.
const COMMANDS_BY_KEY_COMBINATION: Partial<Record<string, ShortcutCommand>> = {
    "mod+z": "undo",
    "mod+shift+z": "redo",
    "mod+y": "redo",
    "mod+d": "duplicate",
    "mod+a": "selectAll",
    "shift+1": "fitView",
    "shift+?": "openHelp",
    "?": "openHelp",
};

const TYPING_TAG_NAMES = ["INPUT", "TEXTAREA", "SELECT"];
// CodeMirror, behind the prompt editor, types into a contenteditable element.
const EDITABLE_CONTENT_SELECTOR = '[contenteditable]:not([contenteditable="false"])';

export function findShortcutCommand(keyPress: KeyPress): ShortcutCommand | undefined {
    return COMMANDS_BY_KEY_COMBINATION[describeKeyCombination(keyPress)];
}

/** Text fields and the prompt editor keep their own keys, so their Ctrl+Z undoes the text. */
export function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return (
        TYPING_TAG_NAMES.includes(target.tagName) ||
        target.closest(EDITABLE_CONTENT_SELECTOR) !== null
    );
}

function describeKeyCombination(keyPress: KeyPress): string {
    const modifiers = [
        (keyPress.ctrlKey || keyPress.metaKey) && "mod",
        keyPress.altKey && "alt",
        keyPress.shiftKey && "shift",
    ].filter((modifier) => modifier !== false);

    return [...modifiers, readKeyName(keyPress)].join("+");
}

// With Shift held, the 1 key reports the symbol of the keyboard layout ("!" on US keyboards).
function readKeyName(keyPress: KeyPress): string {
    if (keyPress.code === "Digit1") {
        return "1";
    }

    return keyPress.key.toLowerCase();
}

import { findShortcutCommand, isTypingTarget, SHORTCUTS } from "@/web/canvas/shortcuts.js";
import type { KeyPress } from "@/web/canvas/shortcuts.js";

function press(key: string, modifiers: Partial<KeyPress> = {}): KeyPress {
    return {
        key,
        code: "",
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        ...modifiers,
    };
}

describe("findShortcutCommand", () => {
    it.each([
        ["Ctrl+Z", press("z", { ctrlKey: true }), "undo"],
        ["Cmd+Z", press("z", { metaKey: true }), "undo"],
        ["Ctrl+Shift+Z", press("Z", { ctrlKey: true, shiftKey: true }), "redo"],
        ["Cmd+Shift+Z", press("z", { metaKey: true, shiftKey: true }), "redo"],
        ["Ctrl+Y", press("y", { ctrlKey: true }), "redo"],
        ["Ctrl+D", press("d", { ctrlKey: true }), "duplicate"],
        ["Cmd+A", press("a", { metaKey: true }), "selectAll"],
        ["Shift+1", press("!", { shiftKey: true, code: "Digit1" }), "fitView"],
        ["?", press("?", { shiftKey: true }), "openHelp"],
    ])("maps %s to %s", (_keys, keyPress, command) => {
        expect(findShortcutCommand(keyPress)).toBe(command);
    });

    it.each([
        ["Z without a modifier", press("z")],
        ["Ctrl+Alt+Z", press("z", { ctrlKey: true, altKey: true })],
        ["1 without Shift", press("1", { code: "Digit1" })],
    ])("ignores %s", (_keys, keyPress) => {
        expect(findShortcutCommand(keyPress)).toBeUndefined();
    });
});

describe("isTypingTarget", () => {
    it.each(["input", "textarea", "select"])("treats a focused %s as typing", (tagName) => {
        expect(isTypingTarget(document.createElement(tagName))).toBe(true);
    });

    it("treats an editable element such as the prompt editor as typing", () => {
        const promptEditor = document.createElement("div");
        promptEditor.setAttribute("contenteditable", "true");

        expect(isTypingTarget(promptEditor)).toBe(true);
    });

    it("does not treat the canvas as typing", () => {
        expect(isTypingTarget(document.createElement("div"))).toBe(false);
    });
});

describe("SHORTCUTS", () => {
    it("documents every shortcut the issue asks for", () => {
        expect(SHORTCUTS.map((shortcut) => shortcut.keys)).toEqual([
            "Ctrl/Cmd+Z",
            "Ctrl/Cmd+Shift+Z ou Ctrl+Y",
            "Ctrl/Cmd+C",
            "Ctrl/Cmd+V",
            "Ctrl/Cmd+D",
            "Delete",
            "Ctrl/Cmd+A",
            "G M",
            "G L",
            "Shift+1",
            "?",
        ]);
    });
});

import { diffLines } from "diff";
import type { ChangeObject } from "diff";
import type { JSX } from "react";

type LineKind = "added" | "removed" | "unchanged";

interface DiffLine {
    kind: LineKind;
    text: string;
}

const LINE_STYLES: Record<
    LineKind,
    { Tag: "ins" | "del" | "span"; marker: string; className: string }
> = {
    added: {
        Tag: "ins",
        marker: "+",
        className: "bg-status-succeeded/15 text-status-succeeded no-underline",
    },
    removed: {
        Tag: "del",
        marker: "-",
        className: "bg-status-failed/15 text-status-failed no-underline",
    },
    unchanged: { Tag: "span", marker: " ", className: "text-muted" },
};

const LINE_BREAK = "\n";

export function PromptLineDiff({ before, after }: { before: string; after: string }): JSX.Element {
    return (
        <pre className="overflow-x-auto rounded-sm border border-border bg-canvas p-2 font-mono text-xs">
            {listDiffLines(before, after).map((line, index) => (
                <PromptDiffLine key={index} line={line} />
            ))}
        </pre>
    );
}

function PromptDiffLine({ line }: { line: DiffLine }): JSX.Element {
    const { Tag, marker, className } = LINE_STYLES[line.kind];

    return (
        <Tag className={`block ${className}`}>
            {marker} {line.text}
        </Tag>
    );
}

function listDiffLines(before: string, after: string): DiffLine[] {
    return diffLines(before, after).flatMap((change) =>
        splitIntoLines(change.value).map((text) => ({ kind: classifyChange(change), text })),
    );
}

function classifyChange(change: ChangeObject<string>): LineKind {
    if (change.added) {
        return "added";
    }
    if (change.removed) {
        return "removed";
    }

    return "unchanged";
}

// Each change ends with the line break of its last line; that break does not start another line.
function splitIntoLines(text: string): string[] {
    const withoutFinalBreak = text.endsWith(LINE_BREAK) ? text.slice(0, -LINE_BREAK.length) : text;

    return withoutFinalBreak.split(LINE_BREAK);
}

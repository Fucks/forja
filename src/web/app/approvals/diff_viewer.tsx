import { clsx } from "clsx";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { JSX } from "react";

import { parseUnifiedDiff } from "@/web/app/approvals/parse_unified_diff.js";
import type {
    DiffFile,
    DiffHunk,
    DiffLine,
    DiffLineKind,
} from "@/web/app/approvals/parse_unified_diff.js";

const LINE_STYLES: Record<DiffLineKind, { marker: string; className: string }> = {
    add: { marker: "+", className: "bg-status-succeeded/15" },
    del: { marker: "-", className: "bg-status-failed/15" },
    ctx: { marker: " ", className: "" },
};

const RENAME_ARROW = " → ";

export function DiffViewer({ diff }: { diff: string }): JSX.Element {
    const { stat, files } = useMemo(() => parseUnifiedDiff(diff), [diff]);

    return (
        <div className="flex flex-col gap-2 font-mono text-xs">
            {stat && <pre className="overflow-x-auto text-muted">{stat}</pre>}
            {files.length === 0 && <p className="text-muted">O diff está vazio.</p>}
            {files.map((file, index) => (
                <DiffFileSection key={`${index}-${file.path}`} file={file} />
            ))}
        </div>
    );
}

function DiffFileSection({ file }: { file: DiffFile }): JSX.Element {
    const [isExpanded, setIsExpanded] = useState(true);
    const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

    return (
        <section className="overflow-hidden rounded-sm border border-border">
            <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex w-full items-center gap-2 bg-surface px-2 py-1 text-left hover:bg-surface-raised"
            >
                <ChevronIcon aria-hidden className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{describeFilePath(file)}</span>
                <span className="text-status-succeeded">+{file.additions}</span>
                <span className="text-status-failed">-{file.deletions}</span>
            </button>
            {isExpanded && <DiffFileContent file={file} />}
        </section>
    );
}

function describeFilePath(file: DiffFile): string {
    if (file.previousPath === undefined) {
        return file.path;
    }

    return file.previousPath + RENAME_ARROW + file.path;
}

function DiffFileContent({ file }: { file: DiffFile }): JSX.Element {
    if (file.isBinary) {
        return <p className="px-2 py-1 text-muted">Arquivo binário.</p>;
    }
    if (file.hunks.length === 0) {
        return <p className="px-2 py-1 text-muted">Sem mudanças no conteúdo.</p>;
    }

    return (
        <div className="overflow-x-auto">
            {file.hunks.map((hunk, index) => (
                <DiffHunkLines key={index} hunk={hunk} />
            ))}
        </div>
    );
}

function DiffHunkLines({ hunk }: { hunk: DiffHunk }): JSX.Element {
    return (
        <pre>
            <span className="block bg-surface-raised px-2 text-muted">{hunk.header}</span>
            {hunk.lines.map((line, index) => (
                <DiffLineRow key={index} line={line} />
            ))}
        </pre>
    );
}

function DiffLineRow({ line }: { line: DiffLine }): JSX.Element {
    const { marker, className } = LINE_STYLES[line.kind];

    return (
        <span className={clsx("block px-2", className)}>
            <span aria-hidden className="text-muted select-none">
                {marker}{" "}
            </span>
            <span>{line.text}</span>
        </span>
    );
}

export type DiffLineKind = "add" | "del" | "ctx";

export interface DiffLine {
    kind: DiffLineKind;
    text: string;
}

export interface DiffHunk {
    header: string;
    lines: DiffLine[];
}

export interface DiffFile {
    path: string;
    previousPath?: string;
    isBinary?: boolean;
    additions: number;
    deletions: number;
    hunks: DiffHunk[];
}

export interface ParsedDiff {
    stat?: string;
    files: DiffFile[];
}

const FILE_HEADER_PREFIX = "diff --git ";
const NEW_PATH_MARKER = " b/";
const HUNK_HEADER_PREFIX = "@@";
const RENAME_FROM_PREFIX = "rename from ";
const RENAME_TO_PREFIX = "rename to ";
const BINARY_FILE_PATTERN = /^Binary files .* differ$/;

const LINE_KINDS_BY_MARKER: Readonly<Record<string, DiffLineKind>> = {
    "+": "add",
    "-": "del",
    " ": "ctx",
};

type FileIdentity = Pick<DiffFile, "path" | "previousPath" | "isBinary">;

export function parseUnifiedDiff(diff: string): ParsedDiff {
    const lines = diff.split("\n");
    const firstFileIndex = lines.findIndex(isFileHeader);
    if (firstFileIndex === -1) {
        return withStat(readStat(lines), []);
    }

    const files = splitBefore(lines.slice(firstFileIndex), isFileHeader).map(parseFileSection);

    return withStat(readStat(lines.slice(0, firstFileIndex)), files);
}

function withStat(stat: string | undefined, files: DiffFile[]): ParsedDiff {
    return stat === undefined ? { files } : { stat, files };
}

// `git diff --stat` comes before the patch, separated by blank lines.
function readStat(lines: string[]): string | undefined {
    const stat = lines.join("\n").trimEnd();

    return stat === "" ? undefined : stat;
}

function parseFileSection([fileHeader = "", ...lines]: string[]): DiffFile {
    const { headerLines, hunkLines } = splitAtFirstHunk(lines);
    const hunks = splitBefore(hunkLines, isHunkHeader).map(parseHunk);

    return {
        ...identifyFile(fileHeader, headerLines),
        additions: countLines(hunks, "add"),
        deletions: countLines(hunks, "del"),
        hunks,
    };
}

function splitAtFirstHunk(lines: string[]): { headerLines: string[]; hunkLines: string[] } {
    const firstHunkIndex = lines.findIndex(isHunkHeader);
    if (firstHunkIndex === -1) {
        return { headerLines: lines, hunkLines: [] };
    }

    return { headerLines: lines.slice(0, firstHunkIndex), hunkLines: lines.slice(firstHunkIndex) };
}

function identifyFile(fileHeader: string, headerLines: string[]): FileIdentity {
    const renamedFrom = findValueAfter(headerLines, RENAME_FROM_PREFIX);
    const renamedTo = findValueAfter(headerLines, RENAME_TO_PREFIX);
    const identity: FileIdentity = { path: renamedTo ?? readNewPath(fileHeader) };
    if (renamedFrom !== undefined) {
        identity.previousPath = renamedFrom;
    }
    if (headerLines.some((line) => BINARY_FILE_PATTERN.test(line))) {
        identity.isBinary = true;
    }

    return identity;
}

function readNewPath(fileHeader: string): string {
    const markerIndex = fileHeader.lastIndexOf(NEW_PATH_MARKER);

    return fileHeader.slice(markerIndex + NEW_PATH_MARKER.length);
}

function findValueAfter(lines: string[], prefix: string): string | undefined {
    const line = lines.find((candidate) => candidate.startsWith(prefix));

    return line?.slice(prefix.length);
}

function parseHunk([header = "", ...lines]: string[]): DiffHunk {
    return { header, lines: lines.flatMap(parseHunkLine) };
}

// Lines without a +, - or space marker (such as "\ No newline at end of file") are not content.
function parseHunkLine(line: string): DiffLine[] {
    const kind = LINE_KINDS_BY_MARKER[line.charAt(0)];
    if (kind === undefined) {
        return [];
    }

    return [{ kind, text: line.slice(1) }];
}

function countLines(hunks: DiffHunk[], kind: DiffLineKind): number {
    return hunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind === kind).length;
}

function splitBefore(lines: string[], isSectionStart: (line: string) => boolean): string[][] {
    const sections: string[][] = [];
    for (const line of lines) {
        const currentSection = sections.at(-1);
        if (isSectionStart(line) || !currentSection) {
            sections.push([line]);
        } else {
            currentSection.push(line);
        }
    }

    return sections;
}

function isFileHeader(line: string): boolean {
    return line.startsWith(FILE_HEADER_PREFIX);
}

function isHunkHeader(line: string): boolean {
    return line.startsWith(HUNK_HEADER_PREFIX);
}

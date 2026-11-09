const BLOCKED_BY_LINE = /^\s*[*_]*(?:bloqueada por|blocked by|depende de)\s*:[*_]*(.*)$/i;
const LISTED_ISSUE = /^\s*[-*]\s+#(\d+)/;
const ISSUE_REFERENCE = /#(\d+)/g;
const LINE_BREAK = /\r?\n/;

export function parseBlockedBy(body: string): number[] {
    const lines = body.split(LINE_BREAK);
    const blockingNumbers = lines.flatMap((line, index) =>
        blockingNumbersDeclaredBy(line, lines.slice(index + 1)),
    );
    return [...new Set(blockingNumbers)];
}

function blockingNumbersDeclaredBy(line: string, followingLines: string[]): number[] {
    const blockedByLine = BLOCKED_BY_LINE.exec(line);
    if (!blockedByLine) {
        return [];
    }

    const inlineNumbers = issueNumbersIn(blockedByLine[1] ?? "");
    if (inlineNumbers.length > 0) {
        return inlineNumbers;
    }

    return leadingListedIssueNumbers(followingLines);
}

function issueNumbersIn(text: string): number[] {
    return [...text.matchAll(ISSUE_REFERENCE)].map((match) => Number(match[1]));
}

function leadingListedIssueNumbers(lines: string[]): number[] {
    const listedNumbers: number[] = [];
    for (const line of lines) {
        if (line.trim() === "") {
            continue;
        }

        const listedIssue = LISTED_ISSUE.exec(line);
        if (!listedIssue) {
            break;
        }

        listedNumbers.push(Number(listedIssue[1]));
    }

    return listedNumbers;
}

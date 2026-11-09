const BLOCKED_BY_LINE = /^\s*[*_]*(?:bloqueada por|blocked by|depende de)\s*:[*_]*(.*)$/i;
const LISTED_ISSUE = /^\s*[-*]\s+#(\d+)/;
const ISSUE_REFERENCE = /#(\d+)/g;
const LINE_BREAK = /\r?\n/;

export function parseBlockedBy(body: string): number[] {
    const lines = body.split(LINE_BREAK);
    const blockingNumbers = lines.flatMap((line, index) => {
        const blockedByLine = BLOCKED_BY_LINE.exec(line);
        if (!blockedByLine) {
            return [];
        }

        const inlineNumbers = issueNumbersIn(blockedByLine[1] ?? "");
        if (inlineNumbers.length > 0) {
            return inlineNumbers;
        }

        return listedIssueNumbersAfter(lines, index);
    });

    return [...new Set(blockingNumbers)];
}

function issueNumbersIn(text: string): number[] {
    return [...text.matchAll(ISSUE_REFERENCE)].map((match) => Number(match[1]));
}

function listedIssueNumbersAfter(lines: string[], headerIndex: number): number[] {
    const listedNumbers: number[] = [];
    for (const line of lines.slice(headerIndex + 1)) {
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

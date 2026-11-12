import type { OutputConfig } from "@/shared/node_configs/output_config.js";

const PULL_REQUEST_NUMBER_PATTERN = /\/pull\/(\d+)/;

export interface RunCommentFacts {
    runId: string;
    moveItemTo: OutputConfig["moveItemTo"];
    prUrl: string | undefined;
    reason: string | undefined;
}

// The local run page is useless to someone reading the issue on GitHub, so the comment names the
// run and the outcome as plain text, without links.
export function buildRunComment(facts: RunCommentFacts): string {
    const finished = `Forja: run ${facts.runId} concluída`;
    if (facts.moveItemTo === "needs_human") {
        return `${finished} — ${describeNeedsHuman(facts.reason)}.`;
    }

    const pullRequestNumber = pullRequestNumberOf(facts.prUrl);
    if (pullRequestNumber === undefined) {
        return `${finished}.`;
    }

    return `${finished} — PR #${pullRequestNumber} aberto.`;
}

function describeNeedsHuman(reason: string | undefined): string {
    const needsHuman = "item precisa de revisão humana";
    return reason === undefined ? needsHuman : `${needsHuman} (${reason})`;
}

function pullRequestNumberOf(prUrl: string | undefined): string | undefined {
    if (prUrl === undefined) {
        return undefined;
    }

    return PULL_REQUEST_NUMBER_PATTERN.exec(prUrl)?.[1];
}

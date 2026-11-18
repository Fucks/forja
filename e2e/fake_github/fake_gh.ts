// Plays the `gh` CLI for the E2E: the pull requests "opened" here never leave this machine.
// Node runs this file by stripping its types, so it uses no import and no TypeScript-only syntax.

const FAKE_PULL_REQUEST_NUMBER = 1;
const EMPTY_LIST = "[]";
const BODY_FROM_STDIN_FLAG = "--body-file";

type GhAnswer = (args: string[]) => string;

const ANSWERS: Record<string, GhAnswer> = {
    "pr create": (args) => pullRequestUrl(optionValue(args, "--repo")),
    "pr view": (args) => JSON.stringify(describePullRequest(subcommandTarget(args))),
    "pr list": () => EMPTY_LIST,
    "issue list": () => EMPTY_LIST,
};

await answer(process.argv.slice(2));

async function answer(args: string[]): Promise<void> {
    if (args.includes(BODY_FROM_STDIN_FLAG)) {
        await readAllOfStdin();
    }

    const [command, subcommand] = args;
    const answerFor = ANSWERS[`${command} ${subcommand}`];
    if (answerFor) {
        process.stdout.write(`${answerFor(args)}\n`);
    }
}

function optionValue(args: string[], option: string): string {
    return args[args.indexOf(option) + 1] ?? "";
}

function subcommandTarget([, , target]: string[]): string {
    return target ?? "";
}

function pullRequestUrl(repo: string): string {
    return `https://github.com/${repo}/pull/${FAKE_PULL_REQUEST_NUMBER}`;
}

function describePullRequest(url: string): Record<string, unknown> {
    return {
        number: FAKE_PULL_REQUEST_NUMBER,
        url,
        state: "OPEN",
        headRefName: "",
        baseRefName: "",
        mergedAt: null,
    };
}

// Forja writes the body of the pull request to stdin; leaving it unread would break the pipe.
function readAllOfStdin(): Promise<void> {
    return new Promise((resolve) => {
        process.stdin.on("end", resolve);
        process.stdin.resume();
    });
}

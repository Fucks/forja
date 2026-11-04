// Sequential Planner with Review — PR-based orchestration loop
//
// This template drives a multi-phase workflow, one issue at a time:
//   Phase 0 (Sync):             The host fast-forwards the base branch, closes
//                               issues whose PRs were merged, and lists the
//                               issues whose PRs are still awaiting review.
//   Phase 1 (Plan):             An opus agent analyzes open issues, builds a
//                               dependency graph, and outputs a <plan> JSON
//                               listing unblocked issues with branch names.
//                               The first one is worked next.
//   Phase 2 (Execute + Review): A sandbox is created via createSandbox(). The
//                               implementer runs first (100 iterations). If it
//                               produces commits, a reviewer runs in the same
//                               sandbox on the same branch (1 iteration).
//   Phase 3 (Pull request):     The branch is rebased onto the latest
//                               PR_BASE_BRANCH (a rebaser agent resolves any
//                               conflicts). In the same sandbox, an evidence agent runs the
//                               checks, maps each acceptance criterion to its
//                               proof and takes screenshots. The host then
//                               pushes the branch and opens a PR into
//                               PR_BASE_BRANCH with that evidence.
//
// Nothing is merged automatically: an issue is closed by Phase 0 once its PR
// is merged, which is what unblocks the issues that depend on it.
//
// The loop never ends: after each issue it syncs and plans again, so issues
// left unfinished (no commits, or failing checks) are picked up again, and
// when there is nothing to work on it waits IDLE_WAIT_MS and checks again.
// Stop it with Ctrl+C.
//
// Usage:
//   npx tsx .sandcastle/main.mts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.mts" }

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { styleText } from "node:util";
import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { z } from "zod";
import { createUsageGuard } from "./usage_guard.mts";

// The planner emits its plan as JSON inside <plan> tags; Output.object extracts
// and validates it against this schema. We use Zod here, but any Standard
// Schema validator works just as well — Valibot, ArkType, etc. See
// https://standardschema.dev.
const planSchema = z.object({
  issues: z.array(
    z.object({ id: z.string(), title: z.string(), branch: z.string() }),
  ),
});

// The evidence agent writes EVIDENCE_DIR/result.json with this shape, next to
// the PR body. (sandbox.run() has no structured output, so it goes in a file.)
const evidenceResultSchema = z.object({
  checksPassed: z.boolean(),
  failureSummary: z.string().optional(),
});

type PlannedIssue = z.infer<typeof planSchema>["issues"][number];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// How long to wait before syncing and planning again when there is no issue
// to work on (all done, all blocked, or all awaiting review), or after a
// round failed outside an issue pipeline (sync or planner).
const IDLE_WAIT_MS = 5 * 60 * 1000;

// GitHub takes a moment to list an issue as closed after `gh issue close`
// returns. Without this wait, the planner read an issue closed in the same
// round as still open, planned it again and kept its dependents blocked.
const ISSUE_CLOSE_SETTLE_MS = 15_000;

// An issue whose pipeline fails this many times in a row is skipped until the
// loop restarts, so one broken issue doesn't hold back the rest of the queue.
const MAX_CONSECUTIVE_FAILURES = 3;

// Model used by every agent in the pipeline.
const MODEL = "claude-opus-5-5";

// Branch the issue branches start from and the PRs target. The run must start
// with this branch checked out.
const PR_BASE_BRANCH = "development";

// Orphan branch on origin that hosts the PR screenshots, one folder per issue
// (issue-N/), so the images don't end up in the project history.
const EVIDENCE_BRANCH = "sandcastle-evidence";

// Folder (relative to the worktree, gitignored) where the evidence agent
// writes the PR body (body.md), the check result (result.json) and the
// screenshots (screenshots/*.png).
const EVIDENCE_DIR = ".pr-evidence";

const ISSUE_BRANCH_PATTERN = /^sandcastle\/issue-(\d+)$/;

// Waits for the usage limit to reset and retries any step that hits it.
// tokenBudgetPerWindow: set it to stop *before* the hard limit. Start with
// null, look at the "~N tokens estimated" printed when a limit is hit, and use
// about 90% of that value.
const usageGuard = createUsageGuard({
  statePath: "./.sandcastle/state/usage_guard.json",
  windowHours: 5,
  tokenBudgetPerWindow: null,
  resetMarginMinutes: 2,
  maxLimitRetries: 20,
});

// Hooks run inside the sandbox before the agent starts each iteration.
// npm install ensures the sandbox always has fresh dependencies. node_modules
// is not copied from the host: on Windows the copy is slow enough to time out,
// and its native binaries (Next.js SWC, sharp) don't run in the Linux sandbox.
// CodeGraph's MCP server keeps the index in sync as the agents edit files.
const hooks = {
  sandbox: {
    onSandboxReady: [
      { command: "npm i", timeoutMs: 600000 },
      { command: "codegraph init --yes", timeoutMs: 300000 },
    ],
  },
};

// vitest starts one worker per core by default, and the sandbox runs it while
// Docker, Postgres and the build share the same machine: the workers then time
// out on startup and `npm run test` exits 1 with no failing assertion.
// vitest.config.ts reads this variable; CI and local runs keep the default.
const VITEST_MAX_WORKERS = 4;

// Sandcastle fails an agent that prints nothing for idleTimeoutSeconds
// (default 600). The test suite alone takes longer than that in the sandbox,
// and Claude Code moves commands over 2 minutes to the background, so the agent
// ended up waiting silently for a result that never came back. Commands now run
// in the foreground for up to BASH_TIMEOUT_MS, and the idle timeout leaves room
// for one of them.
const BASH_TIMEOUT_MS = 25 * 60 * 1000;
const AGENT_IDLE_TIMEOUT_SECONDS = 30 * 60;

const sandboxEnv = {
  VITEST_MAX_WORKERS: String(VITEST_MAX_WORKERS),
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1",
  BASH_DEFAULT_TIMEOUT_MS: String(BASH_TIMEOUT_MS),
  BASH_MAX_TIMEOUT_MS: String(BASH_TIMEOUT_MS),
  // With tool search on, the CodeGraph MCP tools start deferred behind
  // ToolSearch and the agents read code with `cat` and `grep` in Bash instead.
  ENABLE_TOOL_SEARCH: "false",
};

// npm and Next.js create Linux symlinks (node_modules/.bin, .next/node_modules)
// inside the sandbox. On Windows they become WSL reparse points that neither
// git nor Node can delete, so `git worktree remove` leaves a half-removed
// directory and the next `git worktree add` fails with "already exists". These
// are removed from inside Linux: in the sandbox before closing it, and with
// this image for directories left behind by earlier runs.
const SYMLINKED_DIRS = ["node_modules", ".next"];
const CLEANUP_IMAGE = "alpine:3.20";
const WORKTREES_DIR = join(process.cwd(), ".sandcastle", "worktrees");
const LOGS_DIR = join(process.cwd(), ".sandcastle", "logs");

// Inside createSandbox().run(), the built-in {{TARGET_BRANCH}} resolves to the
// sandbox's own branch (so `git diff TARGET...BRANCH` is empty), and built-in
// args can't be overridden — so the prompts receive the base as BASE_BRANCH.
const BASE_BRANCH = PR_BASE_BRANCH;

const currentBranch = git(["branch", "--show-current"]);
if (currentBranch !== BASE_BRANCH) {
  throw new Error(
    `Check out "${BASE_BRANCH}" before running (current: "${currentBranch || "detached HEAD"}"). Issue branches start from it and PRs target it.`,
  );
}

const repoSlug = gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);


// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

// Issue id → pipeline failures in a row (see MAX_CONSECUTIVE_FAILURES).
const consecutiveFailures = new Map<string, number>();

while (true) {
  let workedOnIssue = false;
  try {
    workedOnIssue = await workOnNextIssue();
  } catch (error) {
    // Sync or planner failure (network, GitHub, malformed plan): try again later
    // instead of stopping the loop.
    console.error(`Round failed: ${error}`);
  }

  if (!workedOnIssue) {
    console.log(`Checking the issues again in ${IDLE_WAIT_MS / 60_000} minutes.`);
    await sleep(IDLE_WAIT_MS);
  }
}

// One round: sync, plan and run the pipeline of the next issue. Resolves to
// false when there was no issue to work on.
async function workOnNextIssue() {
  console.log(`\n=== ${new Date().toLocaleString()} ===\n`);

  // -------------------------------------------------------------------------
  // Phase 0: Sync
  //
  // PRs are merged on GitHub, so the local base branch is fast-forwarded to
  // include them before new branches are created from it. PRs into a branch
  // other than the default don't close their issues, so that's done here.
  // -------------------------------------------------------------------------
  git(["pull", "--ff-only", "origin", BASE_BRANCH]);
  const closedIssueIds = closeIssuesWithMergedPullRequests();
  const issuesAwaitingReview = listIssuesAwaitingReview();
  removeOrphanedWorktreeDirs();
  if (closedIssueIds.size > 0) {
    await sleep(ISSUE_CLOSE_SETTLE_MS);
  }

  // -------------------------------------------------------------------------
  // Phase 1: Plan
  //
  // The planning agent reads the open issue list, builds a dependency graph,
  // and lists the issues that can be worked right now (i.e., no blocking
  // dependencies on other open issues), most important first.
  //
  // It outputs a <plan> JSON block — Output.object parses and validates it.
  // -------------------------------------------------------------------------
  const plan = await usageGuard.retryOnUsageLimit("planner", () =>
    sandcastle.run({
      // No npm install hook: without a branch the planner runs in head mode, which
      // bind-mounts the host checkout, so the install would overwrite the host's
      // Windows node_modules with Linux binaries. The planner only reads issues.
      sandbox: docker(),
      name: "planner",
      logging: agentLogging("planner", BASE_BRANCH),
      // One iteration is enough: the planner just needs to read and reason,
      // not write code. (Structured output requires maxIterations: 1.)
      maxIterations: 1,
      agent: sandcastle.claudeCode(MODEL),
      idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_SECONDS,
      promptFile: "./.sandcastle/plan-prompt.md",
      promptArgs: {
        AWAITING_REVIEW: formatAwaitingReview(issuesAwaitingReview),
      },
      // Extract and validate the <plan> JSON into a typed object. Throws
      // StructuredOutputError if the tag is missing, the JSON is malformed, or
      // validation fails — which ends the round.
      output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
    }),
  );
  usageGuard.recordUsage(plan);

  // The prompt already excludes issues awaiting review; filtering again keeps
  // a planner mistake from opening a second PR for the same issue. Issues
  // closed this round are filtered too, in case GitHub still listed them open.
  const issue = plan.output.issues.find(
    (candidate) =>
      !issuesAwaitingReview.has(candidate.id) &&
      !closedIssueIds.has(candidate.id) &&
      (consecutiveFailures.get(candidate.id) ?? 0) < MAX_CONSECUTIVE_FAILURES,
  );

  if (!issue) {
    console.log(
      issuesAwaitingReview.size > 0
        ? `No unblocked issues. ${issuesAwaitingReview.size} PR(s) awaiting review.`
        : "No unblocked issues to work on.",
    );
    return false;
  }

  console.log(`Next issue: ${issue.id}: ${issue.title} → ${issue.branch}`);

  // -------------------------------------------------------------------------
  // Phase 2 + 3: Execute, review and open the PR
  //
  // One sandbox per issue, so the implementer, reviewer and evidence agents
  // share the same sandbox instance on the branch.
  //
  // A pipeline that hits the usage limit waits for the reset and starts again
  // on the same branch; commits made before the limit are kept on the branch
  // and the implementer prompt continues from them.
  // -------------------------------------------------------------------------
  try {
    const pullRequestUrl = await usageGuard.retryOnUsageLimit(`issue ${issue.id}`, () =>
      implementReviewAndOpenPullRequest(issue),
    );
    if (pullRequestUrl === undefined) {
      // Counted as a failure: otherwise the planner picks the issue again forever.
      recordFailure(issue, "the implementer made no commits");
    } else {
      consecutiveFailures.delete(issue.id);
      console.log(`\nPR opened: ${pullRequestUrl}`);
    }
  } catch (error) {
    // Network error, sandbox crash, failing checks, etc.
    recordFailure(issue, String(error));
  }

  return true;
}

function recordFailure(issue: PlannedIssue, reason: string) {
  const failures = (consecutiveFailures.get(issue.id) ?? 0) + 1;
  consecutiveFailures.set(issue.id, failures);
  console.error(
    `  ✗ ${issue.id} (${issue.branch}) failed (${failures}/${MAX_CONSECUTIVE_FAILURES}): ${reason}`,
  );
  if (failures >= MAX_CONSECUTIVE_FAILURES) {
    console.error(`  Skipping issue ${issue.id} until the loop is restarted.`);
  }
}

// ---------------------------------------------------------------------------
// Issue pipeline: implementer, then reviewer and evidence if there are
// commits, sharing one sandbox on the issue branch. Resolves to the PR URL, or
// undefined when the implementer produced no commits.
// ---------------------------------------------------------------------------

async function implementReviewAndOpenPullRequest(issue: PlannedIssue) {
  const sandbox = await sandcastle.createSandbox({
    branch: issue.branch,
    sandbox: docker({
      env: {
        ...sandboxEnv,
      },
    }),
    hooks,
  });

  const promptArgs = {
    TASK_ID: issue.id,
    ISSUE_TITLE: issue.title,
    BRANCH: issue.branch,
    BASE_BRANCH,
  };

  try {
    const implement = await sandbox.run({
      name: "implementer",
      logging: agentLogging("implementer", issue.branch),
      maxIterations: 100,
      agent: sandcastle.claudeCode(MODEL),
      idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_SECONDS,
      promptFile: "./.sandcastle/implement-prompt.md",
      promptArgs,
    });
    usageGuard.recordUsage(implement);

    if (implement.commits.length === 0) {
      return undefined;
    }

    const review = await sandbox.run({
      name: "reviewer",
      logging: agentLogging("reviewer", issue.branch),
      maxIterations: 1,
      agent: sandcastle.claudeCode(MODEL),
      idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_SECONDS,
      promptFile: "./.sandcastle/review-prompt.md",
      promptArgs,
    });
    usageGuard.recordUsage(review);

    // Before the evidence, so the checks and screenshots run on the code the PR will merge.
    await rebaseOntoBase(sandbox, promptArgs);

    const evidence = await sandbox.run({
      name: "evidence",
      logging: agentLogging("evidence", issue.branch),
      maxIterations: 1,
      agent: sandcastle.claudeCode(MODEL),
      idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_SECONDS,
      promptFile: "./.sandcastle/evidence-prompt.md",
      promptArgs: { ...promptArgs, EVIDENCE_DIR },
    });
    usageGuard.recordUsage(evidence);

    // The evidence lives in the worktree, which close() removes.
    const evidenceDir = join(sandbox.worktreePath, EVIDENCE_DIR);
    const evidenceResult = readEvidenceResult(evidenceDir);
    if (!evidenceResult.checksPassed) {
      // The issue stays open and the next round resumes from these commits.
      throw new Error(
        `checks failed, PR not opened: ${evidenceResult.failureSummary ?? "see the evidence log"}`,
      );
    }

    return openPullRequest(issue, evidenceDir);
  } finally {
    // A sandbox that crashed can't run this; removeOrphanedWorktreeDirs()
    // catches what's left at the start of the next round.
    await sandbox.exec(`rm -rf ${SYMLINKED_DIRS.join(" ")}`).catch(() => undefined);
    await sandbox.close();
  }
}

// ---------------------------------------------------------------------------
// Orphaned worktrees: directories under .sandcastle/worktrees that git no
// longer tracks, left behind when a worktree removal failed halfway (see
// SYMLINKED_DIRS).
// ---------------------------------------------------------------------------

function removeOrphanedWorktreeDirs() {
  if (!existsSync(WORKTREES_DIR)) {
    return;
  }
  git(["worktree", "prune"]);
  const normalize = (path: string) => path.replace(/\\/g, "/").toLowerCase();
  const trackedPaths = new Set(
    git(["worktree", "list", "--porcelain"])
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => normalize(line.slice("worktree ".length).trim())),
  );
  const orphans = readdirSync(WORKTREES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !trackedPaths.has(normalize(join(WORKTREES_DIR, name))));
  if (orphans.length === 0) {
    return;
  }

  console.log(`Removing ${orphans.length} orphaned worktree dir(s): ${orphans.join(", ")}`);
  execFileSync("docker", [
    "run", "--rm",
    "-v", `${WORKTREES_DIR.replace(/\\/g, "/")}:/worktrees`,
    CLEANUP_IMAGE,
    "rm", "-rf", ...orphans.map((name) => `/worktrees/${name}`),
  ], { stdio: "inherit" });
}

// ---------------------------------------------------------------------------
// Rebase: other PRs are merged into the base while an issue is worked on, so
// every PR is opened on top of the latest base.
// ---------------------------------------------------------------------------

async function rebaseOntoBase(sandbox: sandcastle.Sandbox, promptArgs: sandcastle.PromptArgs) {
  // Pulled on the host, since the sandbox token can't read the repository. The
  // worktree shares its refs with the host repository, so the sandbox sees it.
  git(["pull", "--ff-only", "origin", BASE_BRANCH]);

  // Rebased inside the sandbox: on Windows the host's core.autocrlf makes the
  // files the sandbox wrote look modified, and git refuses to rebase.
  const rebase = await sandbox.exec(`git rebase ${BASE_BRANCH}`);
  if (rebase.exitCode !== 0) {
    const resolveConflicts = await sandbox.run({
      name: "rebaser",
      logging: agentLogging("rebaser", String(promptArgs.BRANCH)),
      maxIterations: 10,
      agent: sandcastle.claudeCode(MODEL),
      idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_SECONDS,
      promptFile: "./.sandcastle/rebase-prompt.md",
      promptArgs,
    });
    usageGuard.recordUsage(resolveConflicts);
  }

  const rebased = await sandbox.exec(
    `test ! -d "$(git rev-parse --git-path rebase-merge)" && git merge-base --is-ancestor ${BASE_BRANCH} HEAD`,
  );
  if (rebased.exitCode !== 0) {
    await sandbox.exec("git rebase --abort");
    // The issue stays open and the next round resumes from the unrebased commits.
    throw new Error(`could not rebase onto ${BASE_BRANCH}, PR not opened`);
  }

  // The base may have added dependencies.
  await sandbox.exec("npm install");
}

// ---------------------------------------------------------------------------
// Pull requests (run on the host, with the host's git and gh credentials —
// the sandbox token only has access to issues)
// ---------------------------------------------------------------------------

function readEvidenceResult(evidenceDir: string) {
  const resultPath = join(evidenceDir, "result.json");
  if (!existsSync(resultPath)) {
    throw new Error(`evidence agent did not write ${EVIDENCE_DIR}/result.json`);
  }
  return evidenceResultSchema.parse(JSON.parse(readFileSync(resultPath, "utf8")));
}

function openPullRequest(issue: PlannedIssue, evidenceDir: string) {
  const bodyPath = join(evidenceDir, "body.md");
  if (!existsSync(bodyPath)) {
    throw new Error(`evidence agent did not write ${EVIDENCE_DIR}/body.md`);
  }

  const screenshotsUrl = publishScreenshots(issue.id, join(evidenceDir, "screenshots"));
  const body = [
    linkScreenshots(readFileSync(bodyPath, "utf8"), screenshotsUrl),
    `Closes #${issue.id}`,
  ].join("\n\n");

  // The rebase rewrites commits that an earlier, failed attempt may have pushed.
  git(["push", "--force-with-lease", "--set-upstream", "origin", issue.branch]);
  return gh(
    [
      "pr", "create",
      "--base", BASE_BRANCH,
      "--head", issue.branch,
      "--title", `${issue.title} (#${issue.id})`,
      "--body-file", "-",
    ],
    body,
  );
}

// Commits the screenshots to EVIDENCE_BRANCH through a temporary index, so the
// host's working tree and index are never touched. Returns the base URL of the
// issue's folder, or undefined when there are no screenshots.
function publishScreenshots(issueId: string, screenshotsDir: string) {
  const screenshots = existsSync(screenshotsDir)
    ? readdirSync(screenshotsDir).filter((file) => file.endsWith(".png"))
    : [];
  if (screenshots.length === 0) {
    return undefined;
  }

  const issueFolder = `issue-${issueId}`;
  const indexFile = join(tmpdir(), `sandcastle-evidence-${issueId}.index`);
  const withTemporaryIndex = { ...process.env, GIT_INDEX_FILE: indexFile };
  const parentCommit = fetchRemoteBranchTip(EVIDENCE_BRANCH);

  try {
    git(parentCommit ? ["read-tree", parentCommit] : ["read-tree", "--empty"], withTemporaryIndex);
    for (const screenshot of screenshots) {
      const blob = git(["hash-object", "-w", "--no-filters", join(screenshotsDir, screenshot)]);
      git(
        ["update-index", "--add", "--cacheinfo", `100644,${blob},${issueFolder}/${screenshot}`],
        withTemporaryIndex,
      );
    }
    const tree = git(["write-tree"], withTemporaryIndex);
    const parentArgs = parentCommit ? ["-p", parentCommit] : [];
    const commit = git(["commit-tree", tree, ...parentArgs, "-m", `Evidências da issue #${issueId}`]);
    git(["push", "origin", `${commit}:refs/heads/${EVIDENCE_BRANCH}`]);
  } finally {
    rmSync(indexFile, { force: true });
  }

  return `https://github.com/${repoSlug}/blob/${EVIDENCE_BRANCH}/${issueFolder}`;
}

function fetchRemoteBranchTip(branch: string) {
  const remoteRef = git(["ls-remote", "--heads", "origin", branch]);
  if (!remoteRef) {
    return undefined;
  }
  git(["fetch", "origin", branch]);
  return git(["rev-parse", "FETCH_HEAD"]);
}

// The agent links screenshots as `screenshots/<file>.png`; `?raw=true` makes
// GitHub render them inline, including in a private repo.
function linkScreenshots(body: string, screenshotsUrl: string | undefined) {
  if (!screenshotsUrl) {
    return body;
  }
  return body.replace(
    /\]\(screenshots\/([^)\s]+)\)/g,
    (_, file: string) => `](${screenshotsUrl}/${file}?raw=true)`,
  );
}

// Returns the ids of the issues it closed.
function closeIssuesWithMergedPullRequests() {
  const closedIssueIds = new Set<string>();
  const openIssueIds = new Set(
    ghJson<{ number: number }[]>([
      "issue", "list", "--state", "open", "--label", "Sandcastle", "--limit", "500", "--json", "number",
    ]).map((issue) => String(issue.number)),
  );

  for (const pullRequest of listIssuePullRequests("merged")) {
    if (!openIssueIds.has(pullRequest.issueId)) {
      continue;
    }
    gh([
      "issue", "close", pullRequest.issueId,
      "--comment", `Concluída pelo PR #${pullRequest.number}.`,
    ]);
    console.log(`Closed issue #${pullRequest.issueId} (PR #${pullRequest.number} merged).`);
    closedIssueIds.add(pullRequest.issueId);
  }
  return closedIssueIds;
}

// Issue id → PR number for every open PR from an issue branch.
function listIssuesAwaitingReview() {
  return new Map(
    listIssuePullRequests("open").map((pullRequest) => [pullRequest.issueId, pullRequest.number]),
  );
}

function listIssuePullRequests(state: "open" | "merged") {
  return ghJson<{ number: number; headRefName: string }[]>([
    "pr", "list", "--base", BASE_BRANCH, "--state", state, "--limit", "500", "--json", "number,headRefName",
  ]).flatMap((pullRequest) => {
    const issueId = ISSUE_BRANCH_PATTERN.exec(pullRequest.headRefName)?.[1];
    return issueId ? [{ issueId, number: pullRequest.number }] : [];
  });
}

function formatAwaitingReview(issuesAwaitingReview: Map<string, number>) {
  if (issuesAwaitingReview.size === 0) {
    return "(none)";
  }
  return [...issuesAwaitingReview]
    .map(([issueId, pullRequestNumber]) => `- #${issueId} (PR #${pullRequestNumber})`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Agent output: Sandcastle writes it only to the log file under
// .sandcastle/logs/; the callback also prints it to the terminal, so the run
// can be followed from there. The path keeps Sandcastle's default name.
// ---------------------------------------------------------------------------

// Sandcastle only reports calls to these tools; the others (Read, Grep, Edit,
// the CodeGraph MCP tools) are read from the raw JSON stream.
const TOOLS_REPORTED_BY_SANDCASTLE = new Set(["Bash", "WebSearch", "WebFetch", "Agent"]);
const MAX_TOOL_INPUT_LENGTH = 160;

type ClaudeStreamLine = {
  type?: string;
  subtype?: string;
  mcp_servers?: { name: string; status: string }[];
  message?: { content?: { type: string; name?: string; input?: Record<string, unknown> }[] };
};

function agentLogging(name: string, branch: string): sandcastle.LoggingOption {
  const issueId = ISSUE_BRANCH_PATTERN.exec(branch)?.[1];
  const label = issueId ? `#${issueId} ${name}` : name;
  return {
    type: "file",
    path: join(LOGS_DIR, `${branch.replace(/[/\\:*?"<>|]/g, "-")}-${name}.log`),
    onAgentStreamEvent: (event) => {
      const prefix = styleText("dim", `[${label} · ${event.iteration}]`);
      const text = describeStreamEvent(event);
      for (const line of text.split("\n")) {
        if (line.trim()) {
          console.log(`${prefix} ${line}`);
        }
      }
    },
  };
}

function describeStreamEvent(event: sandcastle.AgentStreamEvent) {
  switch (event.type) {
    case "text":
      return event.message;
    case "toolCall":
      return styleText("cyan", `→ ${event.name} ${event.formattedArgs}`);
    case "raw":
      return describeRawLine(event.line);
  }
}

// MCP server status at startup, and the tool calls Sandcastle doesn't report.
function describeRawLine(line: string) {
  let parsed: ClaudeStreamLine;
  try {
    parsed = JSON.parse(line) as ClaudeStreamLine;
  } catch {
    return "";
  }

  if (parsed.type === "system" && parsed.subtype === "init") {
    const servers = (parsed.mcp_servers ?? []).map((server) => `${server.name} ${server.status}`);
    return styleText("dim", `MCP: ${servers.join(", ") || "none"}`);
  }

  if (parsed.type !== "assistant") {
    return "";
  }
  return (parsed.message?.content ?? [])
    .filter((block) => block.type === "tool_use" && block.name && !TOOLS_REPORTED_BY_SANDCASTLE.has(block.name))
    .map((block) => {
      const input = JSON.stringify(block.input ?? {});
      const shortInput =
        input.length > MAX_TOOL_INPUT_LENGTH ? `${input.slice(0, MAX_TOOL_INPUT_LENGTH)}…` : input;
      return styleText("cyan", `→ ${block.name} ${shortInput}`);
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Host commands
// ---------------------------------------------------------------------------

function git(args: string[], env?: NodeJS.ProcessEnv) {
  return execFileSync("git", args, { encoding: "utf8", env }).trim();
}

function gh(args: string[], input?: string) {
  return execFileSync("gh", args, { encoding: "utf8", input }).trim();
}

function ghJson<T>(args: string[]): T {
  return JSON.parse(gh(args)) as T;
}

function dockerCli(args: string[]) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// undefined when the command fails (e.g. the network or container doesn't exist).
function tryDocker(args: string[]) {
  try {
    return dockerCli(args);
  } catch {
    return undefined;
  }
}

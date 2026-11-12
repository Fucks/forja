import { parseUnifiedDiff } from "@/web/app/approvals/parse_unified_diff.js";

function diffOf(lines: string[]): string {
    return `${lines.join("\n")}\n`;
}

const MODIFIED_FILE = [
    "diff --git a/src/cart.ts b/src/cart.ts",
    "index 1111111..2222222 100644",
    "--- a/src/cart.ts",
    "+++ b/src/cart.ts",
    "@@ -1,3 +1,3 @@ export function total()",
    " const items = [];",
    "-const fee = 1;",
    "+const fee = 2;",
    " export {};",
];

describe("parseUnifiedDiff", () => {
    it("returns no files for an empty diff", () => {
        expect(parseUnifiedDiff("")).toEqual({ files: [] });
    });

    it("reads a modified file with its hunk lines and counts", () => {
        const parsed = parseUnifiedDiff(diffOf(MODIFIED_FILE));

        expect(parsed.files).toEqual([
            {
                path: "src/cart.ts",
                additions: 1,
                deletions: 1,
                hunks: [
                    {
                        header: "@@ -1,3 +1,3 @@ export function total()",
                        lines: [
                            { kind: "ctx", text: "const items = [];" },
                            { kind: "del", text: "const fee = 1;" },
                            { kind: "add", text: "const fee = 2;" },
                            { kind: "ctx", text: "export {};" },
                        ],
                    },
                ],
            },
        ]);
    });

    it("keeps each hunk of a file apart", () => {
        const parsed = parseUnifiedDiff(
            diffOf([
                "diff --git a/a.ts b/a.ts",
                "--- a/a.ts",
                "+++ b/a.ts",
                "@@ -1 +1,2 @@",
                "+first",
                " a",
                "@@ -10 +11,2 @@",
                " b",
                "+second",
            ]),
        );

        const [file] = parsed.files;
        expect(file?.additions).toBe(2);
        expect(file?.hunks.map((hunk) => hunk.header)).toEqual([
            "@@ -1 +1,2 @@",
            "@@ -10 +11,2 @@",
        ]);
    });

    it("splits the diff into one entry per file", () => {
        const parsed = parseUnifiedDiff(
            diffOf([
                ...MODIFIED_FILE,
                "diff --git a/README.md b/README.md",
                "--- a/README.md",
                "+++ b/README.md",
                "@@ -1 +1 @@",
                "+# Forja",
            ]),
        );

        expect(parsed.files.map((file) => file.path)).toEqual(["src/cart.ts", "README.md"]);
    });

    it("treats a removed line that looks like a file header as a deletion", () => {
        const parsed = parseUnifiedDiff(
            diffOf([
                "diff --git a/notes.md b/notes.md",
                "--- a/notes.md",
                "+++ b/notes.md",
                "@@ -1,2 +1 @@",
                "--- old separator",
                " text",
            ]),
        );

        expect(parsed.files[0]?.hunks[0]?.lines[0]).toEqual({
            kind: "del",
            text: "-- old separator",
        });
    });

    it("ignores the no-newline marker inside a hunk", () => {
        const parsed = parseUnifiedDiff(
            diffOf([
                "diff --git a/a.txt b/a.txt",
                "--- a/a.txt",
                "+++ b/a.txt",
                "@@ -1 +1 @@",
                "-a",
                "\\ No newline at end of file",
                "+b",
            ]),
        );

        expect(parsed.files[0]?.hunks[0]?.lines).toEqual([
            { kind: "del", text: "a" },
            { kind: "add", text: "b" },
        ]);
    });

    it("marks a binary file, which has no hunks", () => {
        const parsed = parseUnifiedDiff(
            diffOf([
                "diff --git a/logo.png b/logo.png",
                "index 1111111..2222222 100644",
                "Binary files a/logo.png and b/logo.png differ",
            ]),
        );

        expect(parsed.files).toEqual([
            { path: "logo.png", isBinary: true, additions: 0, deletions: 0, hunks: [] },
        ]);
    });

    it("reads a renamed file under its new path and keeps the previous one", () => {
        const parsed = parseUnifiedDiff(
            diffOf([
                "diff --git a/src/old_name.ts b/src/new_name.ts",
                "similarity index 100%",
                "rename from src/old_name.ts",
                "rename to src/new_name.ts",
            ]),
        );

        expect(parsed.files).toEqual([
            {
                path: "src/new_name.ts",
                previousPath: "src/old_name.ts",
                additions: 0,
                deletions: 0,
                hunks: [],
            },
        ]);
    });

    it("reads new and deleted files under their own path", () => {
        const parsed = parseUnifiedDiff(
            diffOf([
                "diff --git a/src/added.ts b/src/added.ts",
                "new file mode 100644",
                "--- /dev/null",
                "+++ b/src/added.ts",
                "@@ -0,0 +1 @@",
                "+export const added = true;",
                "diff --git a/src/gone.ts b/src/gone.ts",
                "deleted file mode 100644",
                "--- a/src/gone.ts",
                "+++ /dev/null",
                "@@ -1 +0,0 @@",
                "-export const gone = true;",
            ]),
        );

        expect(
            parsed.files.map(({ path, additions, deletions }) => ({ path, additions, deletions })),
        ).toEqual([
            { path: "src/added.ts", additions: 1, deletions: 0 },
            { path: "src/gone.ts", additions: 0, deletions: 1 },
        ]);
    });

    it("returns the stat summary that comes before the first file", () => {
        const stat = [" src/cart.ts | 2 +-", " 1 file changed, 1 insertion(+), 1 deletion(-)"].join(
            "\n",
        );

        const parsed = parseUnifiedDiff(`${stat}\n\n\n${diffOf(MODIFIED_FILE)}`);

        expect(parsed.stat).toBe(stat);
        expect(parsed.files).toHaveLength(1);
    });
});

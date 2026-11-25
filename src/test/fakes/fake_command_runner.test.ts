import { FakeCommandRunner } from "@/test/fakes/fake_command_runner.js";

const OPTIONS = { cwd: "/repos/forja", timeoutMs: 1000 };

describe("FakeCommandRunner", () => {
    it("returns the scripted result for the matching command and arguments", async () => {
        const commands = new FakeCommandRunner();
        commands.when("git", ["branch", "--show-current"]).returns({ stdout: "main" });

        const result = await commands.run("git", ["branch", "--show-current"], OPTIONS);

        expect(result).toEqual({
            exitCode: 0,
            stdout: "main",
            stderr: "",
            timedOut: false,
            notFound: false,
        });
    });

    it("fails a command that was not scripted", async () => {
        const commands = new FakeCommandRunner();
        commands.when("git", ["status"]).returns({ stdout: "clean" });

        const result = await commands.run("git", ["status", "--short"], OPTIONS);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("git status --short");
    });

    it("prefers the most recent script for the same command", async () => {
        const commands = new FakeCommandRunner();
        commands.when("git", ["status"]).returns({ stdout: "first" });
        commands.when("git", ["status"]).returns({ stdout: "second" });

        const result = await commands.run("git", ["status"], OPTIONS);

        expect(result.stdout).toBe("second");
    });

    it("records every call with its options", async () => {
        const commands = new FakeCommandRunner();

        await commands.run("git", ["status"], OPTIONS);

        expect(commands.calls).toEqual([{ command: "git", args: ["status"], options: OPTIONS }]);
    });

    it("replays the scripted output line by line to the listeners", async () => {
        const commands = new FakeCommandRunner();
        commands.when("npm", ["test"]).returns({ stdout: "first\nsecond", stderr: "warning" });
        const stdoutLines: string[] = [];
        const stderrLines: string[] = [];

        await commands.run("npm", ["test"], {
            ...OPTIONS,
            onStdoutLine: (line) => stdoutLines.push(line),
            onStderrLine: (line) => stderrLines.push(line),
        });

        expect(stdoutLines).toEqual(["first", "second"]);
        expect(stderrLines).toEqual(["warning"]);
    });

    it("matches arguments with a predicate when given one", async () => {
        const commands = new FakeCommandRunner();
        commands.when("docker", (args) => args[0] === "exec").returns({ stdout: "done" });

        const result = await commands.run("docker", ["exec", "c1", "ls"], OPTIONS);

        expect(result.stdout).toBe("done");
    });
});

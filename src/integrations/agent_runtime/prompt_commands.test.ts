import {
    expandPromptCommands,
    type PromptCommandRunner,
} from "@/integrations/agent_runtime/prompt_commands.js";

function runnerAnswering(outputs: Record<string, string>): PromptCommandRunner {
    return (command) => Promise.resolve({ exitCode: 0, stdoutTail: outputs[command] ?? "" });
}

describe("expandPromptCommands", () => {
    it("replaces a context command with its output", async () => {
        const run = runnerAnswering({ "git log -1": "abc123 primeiro commit\n" });

        const prompt = await expandPromptCommands("Último commit:\n!`git log -1`\nContinue.", run);

        expect(prompt).toBe("Último commit:\nabc123 primeiro commit\nContinue.");
    });

    it("replaces every occurrence, running the commands in order", async () => {
        const executed: string[] = [];
        const run: PromptCommandRunner = (command) => {
            executed.push(command);
            return Promise.resolve({ exitCode: 0, stdoutTail: command.toUpperCase() });
        };

        const prompt = await expandPromptCommands("!`pwd` e !`whoami` e !`pwd`", run);

        expect(prompt).toBe("PWD e WHOAMI e PWD");
        expect(executed).toEqual(["pwd", "whoami", "pwd"]);
    });

    it("describes a failed command in place of its output", async () => {
        const run: PromptCommandRunner = () =>
            Promise.resolve({ exitCode: 128, stdoutTail: "fatal: not a git repository\n" });

        const prompt = await expandPromptCommands("Log: !`git log -1`", run);

        expect(prompt).toBe("Log: [comando falhou (exit 128): fatal: not a git repository]");
    });

    it("keeps commands inside fenced code blocks as they are", async () => {
        const run = runnerAnswering({ "git log -1": "abc123" });
        const prompt =
            "Antes: !`git log -1`\n```md\nExemplo: !`git log -1`\n```\nDepois: !`git log -1`";

        const expanded = await expandPromptCommands(prompt, run);

        expect(expanded).toBe("Antes: abc123\n```md\nExemplo: !`git log -1`\n```\nDepois: abc123");
    });

    it("keeps a prompt without commands untouched and runs nothing", async () => {
        const run = vi.fn<PromptCommandRunner>();

        const prompt = await expandPromptCommands("Use `npm test` antes de commitar.", run);

        expect(prompt).toBe("Use `npm test` antes de commitar.");
        expect(run).not.toHaveBeenCalled();
    });
});

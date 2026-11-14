import { buildClaudeArgs } from "@/integrations/agent_runtime/claude_command.js";
import { buildAgentRunRequest } from "@/test/factories/agent_run_request_factory.js";

const FIRST_ITERATION = { iteration: 1 };

describe("buildClaudeArgs", () => {
    it("runs claude headless with stream-json and the model, effort and permission mode of the node", () => {
        const request = buildAgentRunRequest({
            model: "claude-opus-5-5",
            effort: "xhigh",
            permissionMode: "dontAsk",
        });

        const args = buildClaudeArgs(request, FIRST_ITERATION);

        expect(args).toEqual([
            "claude",
            "-p",
            "--output-format",
            "stream-json",
            "--verbose",
            "--model",
            "claude-opus-5-5",
            "--effort",
            "xhigh",
            "--permission-mode",
            "dontAsk",
        ]);
    });

    it("never puts the prompt or the environment in argv", () => {
        const request = buildAgentRunRequest({
            prompt: "Implemente a issue secreta",
            env: { ANTHROPIC_API_KEY: "sk-ant-segredo" },
        });

        const args = buildClaudeArgs(request, FIRST_ITERATION).join(" ");

        expect(args).not.toContain("Implemente a issue secreta");
        expect(args).not.toContain("sk-ant-segredo");
    });

    it("limits turns and budget when the node sets them", () => {
        const request = buildAgentRunRequest({ maxTurns: 40, maxBudgetUsd: 2.5 });

        const args = buildClaudeArgs(request, FIRST_ITERATION);

        expect(args).toEqual(expect.arrayContaining(["--max-turns", "40"]));
        expect(args).toEqual(expect.arrayContaining(["--max-budget-usd", "2.5"]));
    });

    it("leaves turns and budget unlimited when the node does not set them", () => {
        const args = buildClaudeArgs(buildAgentRunRequest(), FIRST_ITERATION);

        expect(args).not.toContain("--max-turns");
        expect(args).not.toContain("--max-budget-usd");
    });

    it("asks for the output schema on the only iteration", () => {
        const outputSchema = { type: "object", properties: { verdict: { type: "string" } } };
        const request = buildAgentRunRequest({ outputSchema });

        const args = buildClaudeArgs(request, FIRST_ITERATION);

        expect(args).toEqual(
            expect.arrayContaining(["--json-schema", JSON.stringify(outputSchema)]),
        );
    });

    it("asks for the output schema only on the last iteration when a completion signal ends the loop early", () => {
        const request = buildAgentRunRequest({
            outputSchema: { type: "object" },
            maxIterations: 3,
            completionSignal: "<promise>COMPLETE</promise>",
        });

        const secondIteration = buildClaudeArgs(request, { iteration: 2 });
        const lastIteration = buildClaudeArgs(request, { iteration: 3 });

        expect(secondIteration).not.toContain("--json-schema");
        expect(lastIteration).toContain("--json-schema");
    });

    it("sends the output schema on any iteration when asked to", () => {
        const request = buildAgentRunRequest({
            outputSchema: { type: "object" },
            maxIterations: 3,
            completionSignal: "<promise>COMPLETE</promise>",
        });

        const args = buildClaudeArgs(request, { iteration: 1, withOutputSchema: true });

        expect(args).toContain("--json-schema");
    });

    it("appends the tool arguments of the node", () => {
        const toolArgs = ["--allowedTools", "Read,Bash", "--strict-mcp-config"];
        const request = buildAgentRunRequest({ toolArgs });

        const args = buildClaudeArgs(request, FIRST_ITERATION);

        expect(args.slice(-toolArgs.length)).toEqual(toolArgs);
    });

    it("resumes the given session", () => {
        const args = buildClaudeArgs(buildAgentRunRequest(), {
            iteration: 1,
            resumeSessionId: "sess-1",
        });

        expect(args).toEqual(expect.arrayContaining(["--resume", "sess-1"]));
    });
});

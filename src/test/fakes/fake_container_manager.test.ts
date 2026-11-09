import { AgentCanceledError } from "@/integrations/agent_runtime/agent_errors.js";
import type { ContainerExecOptions } from "@/integrations/agent_runtime/container_manager.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeContainerManager } from "@/test/fakes/fake_container_manager.js";

const ANY_COMMAND = (): boolean => true;

function execOptions(overrides: Partial<ContainerExecOptions> = {}): ContainerExecOptions {
    return { env: {}, timeoutMs: 60_000, signal: new AbortController().signal, ...overrides };
}

describe("FakeContainerManager", () => {
    it("emits each scripted line after its delay and then finishes", async () => {
        const clock = new FakeClock();
        const containers = new FakeContainerManager(clock);
        containers.whenExec(ANY_COMMAND, { stdoutLines: ["a", "b"], lineDelayMs: 100 });
        const lines: string[] = [];

        const exec = containers.exec(
            "c1",
            ["claude"],
            execOptions({ onStdoutLine: (line) => lines.push(line) }),
        );
        clock.advance(100);
        const linesAfterFirstDelay = [...lines];
        clock.advance(200);

        await expect(exec).resolves.toMatchObject({ exitCode: 0, stdoutTail: "a\nb" });
        expect(linesAfterFirstDelay).toEqual(["a"]);
        expect(lines).toEqual(["a", "b"]);
    });

    it("answers the matching calls in order, repeating the last execution", async () => {
        const clock = new FakeClock();
        const containers = new FakeContainerManager(clock);
        containers.whenExec(ANY_COMMAND, { stdoutLines: ["1"] }, { stdoutLines: ["2"] });

        const outputs = [];
        for (let call = 0; call < 3; call += 1) {
            const exec = containers.exec("c1", ["claude"], execOptions());
            clock.advance(0);
            outputs.push((await exec).stdoutTail);
        }

        expect(outputs).toEqual(["1", "2", "2"]);
    });

    it("rejects a hanging execution with AgentCanceledError when aborted", async () => {
        const clock = new FakeClock();
        const containers = new FakeContainerManager(clock);
        containers.whenExec(ANY_COMMAND, { stdoutLines: [], hangsAfterLines: true });
        const controller = new AbortController();

        const exec = containers.exec("c1", ["claude"], execOptions({ signal: controller.signal }));
        controller.abort();

        await expect(exec).rejects.toBeInstanceOf(AgentCanceledError);
    });

    it("records every exec", async () => {
        const containers = new FakeContainerManager(new FakeClock());

        await containers.exec("c1", ["sh", "-c", "pwd"], execOptions());

        expect(containers.execs.map((exec) => exec.command)).toEqual([["sh", "-c", "pwd"]]);
    });
});

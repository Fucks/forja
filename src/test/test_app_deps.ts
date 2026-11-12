import { createSecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import { loadEnv } from "@/lib/env.js";
import { resolvePaths } from "@/lib/paths.js";
import type { AppDeps } from "@/server/app.js";
import type { ForjaDb } from "@/server/db/client.js";
import { createAppExecutor } from "@/server/runtime/app_executor.js";
import { createEventBus } from "@/server/runtime/event_bus.js";
import { FakeAgentRuntime } from "@/test/fakes/fake_agent_runtime.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeCommandRunner } from "@/test/fakes/fake_command_runner.js";
import { FakeGitProvider } from "@/test/fakes/fake_git_provider.js";
import { createTestLogStore } from "@/test/test_log_store.js";
import { createTestSecretBox } from "@/test/test_secrets.js";

export const TEST_PATHS = resolvePaths("/srv/forja dados", "/home/ana");

export function createTestAppDeps(db: ForjaDb, overrides: Partial<AppDeps> = {}): AppDeps {
    const clock = new FakeClock();
    const events = createEventBus(clock);
    const git = new FakeGitProvider();
    const agentRuntime = new FakeAgentRuntime({ clock });
    const commands = new FakeCommandRunner();
    const secrets = createTestSecretBox();
    const redactor = createSecretRedactor();
    const logs = createTestLogStore(db, clock, redactor);

    return {
        env: loadEnv({ FORJA_LOG_LEVEL: "error" }),
        paths: TEST_PATHS,
        options: { seedDemo: false },
        db,
        events,
        commands,
        git,
        secrets,
        redactor,
        logs,
        agentRuntime,
        executor: createAppExecutor({
            db,
            events,
            logs,
            git,
            commands,
            secrets,
            redactor,
            runtime: agentRuntime,
            clock,
        }),
        apiProtection: { kind: "none" },
        ...overrides,
    };
}

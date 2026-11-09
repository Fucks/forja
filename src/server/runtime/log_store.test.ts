import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { AgentEvent } from "@/integrations/agent_runtime/agent_runtime.js";
import {
    createSecretRedactor,
    type SecretRedactor,
} from "@/integrations/secrets/secret_redactor.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { createLogStore, type LogStore } from "@/server/runtime/log_store.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { createTestDb } from "@/test/test_db.js";

const RUN_ID = "run_entrega";
const NODE_RUN_ID = "nrn_dev";
const REF = { runId: RUN_ID, nodeRunId: NODE_RUN_ID };
const EVENT_AT = new Date("2026-11-09T12:00:00Z");

function textEvent(text: string): AgentEvent {
    return { kind: "text", text, at: EVENT_AT, iteration: 1 };
}

describe("LogStore", () => {
    let logsDir: string;
    let database: DatabaseHandle;
    let redactor: SecretRedactor;
    let logs: LogStore;

    beforeEach(() => {
        logsDir = mkdtempSync(path.join(tmpdir(), "forja-logs-"));
        database = createTestDb();
        redactor = createSecretRedactor();
        logs = createLogStore({ logsDir, db: database.db, redactor, clock: new FakeClock() });
    });

    afterEach(() => {
        database.close();
        rmSync(logsDir, { recursive: true, force: true });
    });

    async function appendTexts(count: number): Promise<void> {
        for (let index = 1; index <= count; index++) {
            await logs.append(REF, textEvent(`linha ${index}`));
        }
    }

    describe("append and read", () => {
        it("numbers the events of a NodeRun from 1", async () => {
            const first = await logs.append(REF, textEvent("primeira"));
            const second = await logs.append(REF, textEvent("segunda"));

            expect(first).toEqual({
                seq: 1,
                at: EVENT_AT.toISOString(),
                kind: "text",
                text: "primeira",
                iteration: 1,
            });
            expect(second.seq).toBe(2);
        });

        it("numbers each NodeRun on its own", async () => {
            await logs.append(REF, textEvent("do dev"));

            const other = await logs.append(
                { runId: RUN_ID, nodeRunId: "nrn_review" },
                textEvent("do review"),
            );

            expect(other.seq).toBe(1);
        });

        it("reads the events in seq order from the requested seq, up to the limit", async () => {
            await appendTexts(5);

            const page = await logs.read(NODE_RUN_ID, { fromSeq: 2, limit: 3 });

            expect(page.events.map((event) => event.text)).toEqual([
                "linha 2",
                "linha 3",
                "linha 4",
            ]);
            expect(page.nextSeq).toBe(5);
            expect(page.total).toBe(5);
        });

        it("reads from the first event when no seq is given", async () => {
            await appendTexts(2);

            const page = await logs.read(NODE_RUN_ID, { limit: 10 });

            expect(page.events.map((event) => event.seq)).toEqual([1, 2]);
            expect(page.nextSeq).toBe(3);
        });

        it("keeps nextSeq at the requested seq when there is nothing new", async () => {
            await appendTexts(2);

            const page = await logs.read(NODE_RUN_ID, { fromSeq: 3, limit: 10 });

            expect(page).toEqual({ events: [], nextSeq: 3, total: 2 });
        });

        it("reads an empty page for a NodeRun without logs", async () => {
            const page = await logs.read("nrn_sem_logs", { limit: 10 });

            expect(page).toEqual({ events: [], nextSeq: 1, total: 0 });
        });

        it("stores the fields of every kind of agent event", async () => {
            await logs.append(REF, {
                kind: "tool_call",
                name: "Bash",
                args: '{"command":"ls"}',
                at: EVENT_AT,
                iteration: 2,
            });
            await logs.append(REF, { kind: "raw", line: "{}", at: EVENT_AT, iteration: 2 });
            await logs.append(REF, { kind: "system", message: "workspace pronto", at: EVENT_AT });

            const page = await logs.read(NODE_RUN_ID, { limit: 10 });

            expect(page.events).toEqual([
                {
                    seq: 1,
                    at: EVENT_AT.toISOString(),
                    kind: "tool_call",
                    name: "Bash",
                    args: '{"command":"ls"}',
                    iteration: 2,
                },
                { seq: 2, at: EVENT_AT.toISOString(), kind: "raw", line: "{}", iteration: 2 },
                { seq: 3, at: EVENT_AT.toISOString(), kind: "system", message: "workspace pronto" },
            ]);
        });
    });
});

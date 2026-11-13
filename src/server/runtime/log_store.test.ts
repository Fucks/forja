import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { text } from "node:stream/consumers";
import { tmpdir } from "node:os";
import path from "node:path";

import { z } from "zod";

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
const SECRET = "sk-ant-api03-segredo-de-teste";
const CONCURRENT_APPENDS = 50;

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

    function logFileContent(): string {
        return readFileSync(path.join(logsDir, RUN_ID, `${NODE_RUN_ID}.ndjson`), "utf8");
    }

    describe("redaction", () => {
        it("never writes a registered secret to the file", async () => {
            redactor.register(SECRET);

            await logs.append(REF, textEvent(`a chave é ${SECRET}`));
            await logs.append(REF, {
                kind: "tool_call",
                name: `tool ${SECRET}`,
                args: `{"token":"${SECRET}"}`,
                at: EVENT_AT,
                iteration: 1,
            });
            await logs.append(REF, { kind: "raw", line: SECRET, at: EVENT_AT, iteration: 1 });
            await logs.append(REF, { kind: "system", message: SECRET, at: EVENT_AT });

            expect(logFileContent()).not.toContain(SECRET);
        });

        it("returns the masked event", async () => {
            redactor.register(SECRET);

            const stored = await logs.append(REF, textEvent(`a chave é ${SECRET}`));

            expect(stored.text).toBe("a chave é ••••");
        });
    });

    describe("concurrency", () => {
        it("keeps seq continuous and every line whole when appends race", async () => {
            const appends = Array.from({ length: CONCURRENT_APPENDS }, (_, index) =>
                logs.append(REF, textEvent(`linha ${index} `.repeat(100))),
            );

            const stored = await Promise.all(appends);

            const expectedSeqs = Array.from(
                { length: CONCURRENT_APPENDS },
                (_, index) => index + 1,
            );
            const lines = logFileContent().trimEnd().split("\n");
            const seqsInFile = lines.map(
                (line) => z.object({ seq: z.number() }).parse(JSON.parse(line)).seq,
            );
            expect(stored.map((event) => event.seq)).toEqual(expectedSeqs);
            expect(seqsInFile).toEqual(expectedSeqs);
        });
    });

    describe("stats", () => {
        it("counts the events and the bytes of the file", async () => {
            await appendTexts(3);

            const stats = await logs.stats(NODE_RUN_ID);

            expect(stats).toEqual({ count: 3, bytes: Buffer.byteLength(logFileContent()) });
        });

        it("reports zero for a NodeRun without logs", async () => {
            const stats = await logs.stats("nrn_sem_logs");

            expect(stats).toEqual({ count: 0, bytes: 0 });
        });
    });

    describe("deleteRun", () => {
        it("removes the files and the index of every NodeRun of the run", async () => {
            await appendTexts(2);
            await logs.append({ runId: RUN_ID, nodeRunId: "nrn_review" }, textEvent("review"));
            await logs.append({ runId: "run_outra", nodeRunId: "nrn_outra" }, textEvent("fica"));

            await logs.deleteRun(RUN_ID);

            expect(existsSync(path.join(logsDir, RUN_ID))).toBe(false);
            expect(await logs.stats(NODE_RUN_ID)).toEqual({ count: 0, bytes: 0 });
            expect(await logs.stats("nrn_review")).toEqual({ count: 0, bytes: 0 });
            expect((await logs.stats("nrn_outra")).count).toBe(1);
        });

        it("starts the seq again from 1 after the run is deleted", async () => {
            await appendTexts(2);
            await logs.deleteRun(RUN_ID);

            const stored = await logs.append(REF, textEvent("de novo"));

            expect(stored.seq).toBe(1);
        });
    });

    describe("listRunLogSizes", () => {
        it("sums the bytes of the NodeRuns of each run", async () => {
            await logs.append(REF, textEvent("um"));
            await logs.append({ runId: RUN_ID, nodeRunId: "nrn_review" }, textEvent("dois"));
            await logs.append({ runId: "run_outra", nodeRunId: "nrn_outra" }, textEvent("três"));
            const bytesOf = async (nodeRunId: string) => (await logs.stats(nodeRunId)).bytes;

            const sizes = await logs.listRunLogSizes();

            expect(sizes).toEqual(
                expect.arrayContaining([
                    {
                        runId: RUN_ID,
                        bytes: (await bytesOf(NODE_RUN_ID)) + (await bytesOf("nrn_review")),
                    },
                    { runId: "run_outra", bytes: await bytesOf("nrn_outra") },
                ]),
            );
            expect(sizes).toHaveLength(2);
        });
    });

    describe("expireRun", () => {
        it("removes the logs of the run and remembers that they expired", async () => {
            await appendTexts(2);

            await logs.expireRun(RUN_ID);

            expect(existsSync(path.join(logsDir, RUN_ID))).toBe(false);
            expect(await logs.stats(NODE_RUN_ID)).toEqual({ count: 0, bytes: 0 });
            expect(await logs.listRunLogSizes()).toEqual([]);
            expect(await logs.hasExpired(RUN_ID)).toBe(true);
        });

        it("does not report as expired a run whose logs are kept", async () => {
            await appendTexts(1);

            expect(await logs.hasExpired(RUN_ID)).toBe(false);
        });

        it("can expire the same run twice", async () => {
            await appendTexts(1);
            await logs.expireRun(RUN_ID);

            await logs.expireRun(RUN_ID);

            expect(await logs.hasExpired(RUN_ID)).toBe(true);
        });
    });

    describe("rawStream", () => {
        it("streams the whole NDJSON file", async () => {
            await appendTexts(3);

            const raw = await text(logs.rawStream(NODE_RUN_ID));

            expect(raw).toBe(logFileContent());
            expect(raw.trimEnd().split("\n")).toHaveLength(3);
        });

        it("streams nothing for a NodeRun without logs", async () => {
            const raw = await text(logs.rawStream("nrn_sem_logs"));

            expect(raw).toBe("");
        });
    });
});

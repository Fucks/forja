import type { DatabaseHandle } from "@/server/db/client.js";
import { type AuditLog, createAuditLog } from "@/server/security/audit_log.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { createTestDb } from "@/test/test_db.js";

const RECORDED_AT = new Date("2026-11-12T10:00:00.000Z");
const ONE_MINUTE_MS = 60_000;

describe("AuditLog", () => {
    let database: DatabaseHandle;
    let clock: FakeClock;
    let audit: AuditLog;

    beforeEach(() => {
        database = createTestDb();
        clock = new FakeClock(RECORDED_AT);
        audit = createAuditLog({ db: database.db, clock });
    });

    afterEach(() => {
        database.close();
    });

    it("records the action with its target, its details and when it happened", async () => {
        await audit.record("flow.published", { kind: "flow", id: "flw_1" }, { version: 2 });

        await expect(audit.list(10)).resolves.toEqual([
            {
                id: expect.stringMatching(/^aud_/) as unknown,
                action: "flow.published",
                target: { kind: "flow", id: "flw_1" },
                details: { version: 2 },
                createdAt: RECORDED_AT.toISOString(),
            },
        ]);
    });

    it("records empty details when the action has none", async () => {
        await audit.record("run.canceled", { kind: "run", id: "run_1" });

        await expect(audit.list(10)).resolves.toEqual([
            expect.objectContaining({ action: "run.canceled", details: {} }),
        ]);
    });

    it("lists the newest actions first, up to the limit", async () => {
        await audit.record("credential.created", { kind: "credential", id: "cred_1" });
        clock.advance(ONE_MINUTE_MS);
        await audit.record("credential.updated", { kind: "credential", id: "cred_1" });
        clock.advance(ONE_MINUTE_MS);
        await audit.record("credential.deleted", { kind: "credential", id: "cred_1" });

        const listed = await audit.list(2);

        expect(listed).toEqual([
            expect.objectContaining({ action: "credential.deleted" }),
            expect.objectContaining({ action: "credential.updated" }),
        ]);
    });

    it("keeps the order of actions recorded in the same instant", async () => {
        await audit.record("approval.resolved", { kind: "approval", id: "apv_1" });
        await audit.record("approval.resolved", { kind: "approval", id: "apv_2" });

        const listed = await audit.list(10);

        expect(listed).toEqual([
            expect.objectContaining({ target: { kind: "approval", id: "apv_2" } }),
            expect.objectContaining({ target: { kind: "approval", id: "apv_1" } }),
        ]);
    });
});

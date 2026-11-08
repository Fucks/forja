import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { ForjaDb } from "@/server/db/client.js";
import { credentials } from "@/server/db/schema/credentials.js";
import type { CredentialRow } from "@/server/db/schema/credentials.js";
import { CREDENTIAL_KINDS } from "@/shared/credential_types.js";
import type { CredentialSummary } from "@/shared/credential_types.js";

const credentialKindSchema = z.enum(CREDENTIAL_KINDS);

export interface StoredCredential extends CredentialSummary {
    sealedValue: string;
}

export class CredentialRepository {
    constructor(private readonly db: ForjaDb) {}

    insert(credential: StoredCredential): void {
        this.db.insert(credentials).values(toCredentialRow(credential)).run();
    }

    list(): StoredCredential[] {
        return this.db
            .select()
            .from(credentials)
            .orderBy(asc(credentials.createdAt), asc(credentials.id))
            .all()
            .map(toStoredCredential);
    }

    findById(id: string): StoredCredential | undefined {
        const row = this.db.select().from(credentials).where(eq(credentials.id, id)).get();
        return row && toStoredCredential(row);
    }

    update(credential: StoredCredential): void {
        this.db
            .update(credentials)
            .set(toCredentialRow(credential))
            .where(eq(credentials.id, credential.id))
            .run();
    }

    delete(id: string): void {
        this.db.delete(credentials).where(eq(credentials.id, id)).run();
    }
}

function toCredentialRow(credential: StoredCredential): CredentialRow {
    return {
        id: credential.id,
        name: credential.name,
        kind: credential.kind,
        envVar: credential.envVar,
        sealedValue: credential.sealedValue,
        masked: credential.masked,
        lastCheckedAt: credential.lastCheckedAt ?? null,
        lastCheckOk: credential.lastCheckOk ?? null,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
    };
}

function toStoredCredential(row: CredentialRow): StoredCredential {
    return {
        id: row.id,
        name: row.name,
        kind: credentialKindSchema.parse(row.kind),
        envVar: row.envVar,
        sealedValue: row.sealedValue,
        masked: row.masked,
        ...readLastCheck(row),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function readLastCheck(
    row: CredentialRow,
): Pick<CredentialSummary, "lastCheckedAt" | "lastCheckOk"> {
    if (row.lastCheckedAt === null || row.lastCheckOk === null) {
        return {};
    }

    return { lastCheckedAt: row.lastCheckedAt, lastCheckOk: row.lastCheckOk };
}

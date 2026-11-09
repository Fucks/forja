import { createReadStream } from "node:fs";
import * as fsPromises from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { eq } from "drizzle-orm";

import type { AgentEvent } from "@/integrations/agent_runtime/agent_runtime.js";
import type { SecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import { assertNever } from "@/lib/assert_never.js";
import type { Clock } from "@/lib/clock.js";
import type { ForjaDb } from "@/server/db/client.js";
import { logIndex, type LogIndexRow } from "@/server/db/schema/log_index.js";
import { SerialQueueByKey } from "@/server/runtime/serial_queue_by_key.js";
import { storedLogEventSchema, type LogPage, type StoredLogEvent } from "@/shared/log_types.js";

export type { StoredLogEvent } from "@/shared/log_types.js";

export interface NodeRunLogRef {
    runId: string;
    nodeRunId: string;
}

export interface LogStore {
    // Masks the registered secrets before writing.
    append(ref: NodeRunLogRef, event: AgentEvent): Promise<StoredLogEvent>;
    read(nodeRunId: string, opts: { fromSeq?: number; limit: number }): Promise<LogPage>;
    rawStream(nodeRunId: string): NodeJS.ReadableStream;
    stats(nodeRunId: string): Promise<LogStats>;
    deleteRun(runId: string): Promise<void>;
}

export interface LogStats {
    count: number;
    bytes: number;
}

export interface FsLike {
    mkdir(dirPath: string, options: { recursive: true }): Promise<unknown>;
    appendFile(filePath: string, text: string, encoding: typeof ENCODING): Promise<void>;
    readFile(filePath: string, encoding: typeof ENCODING): Promise<string>;
    rm(targetPath: string, options: { recursive: true; force: true }): Promise<void>;
    createReadStream(filePath: string): NodeJS.ReadableStream;
}

export interface LogStoreDeps {
    logsDir: string;
    db: ForjaDb;
    redactor: SecretRedactor;
    clock: Clock;
    fs?: FsLike;
}

const ENCODING = "utf8";
const LINE_BREAK = "\n";
const LOG_FILE_EXTENSION = ".ndjson";
const FIRST_SEQ = 1;

const nodeFs: FsLike = {
    mkdir: (dirPath, options) => fsPromises.mkdir(dirPath, options),
    appendFile: (filePath, text, encoding) => fsPromises.appendFile(filePath, text, encoding),
    readFile: (filePath, encoding) => fsPromises.readFile(filePath, encoding),
    rm: (targetPath, options) => fsPromises.rm(targetPath, options),
    createReadStream: (filePath) => createReadStream(filePath),
};

export function createLogStore(deps: LogStoreDeps): LogStore {
    return new NdjsonLogStore(deps);
}

// One NDJSON file per NodeRun; the log_index row knows its run and how many events it holds.
class NdjsonLogStore implements LogStore {
    private readonly fs: FsLike;
    // Appends of a NodeRun wait for each other, so two lines never interleave nor share a seq.
    private readonly appendQueues = new SerialQueueByKey();

    constructor(private readonly deps: LogStoreDeps) {
        this.fs = deps.fs ?? nodeFs;
    }

    append(ref: NodeRunLogRef, event: AgentEvent): Promise<StoredLogEvent> {
        return this.appendQueues.enqueue(ref.nodeRunId, () => this.appendNext(ref, event));
    }

    async read(
        nodeRunId: string,
        { fromSeq = FIRST_SEQ, limit }: { fromSeq?: number; limit: number },
    ): Promise<LogPage> {
        const entry = this.findIndexEntry(nodeRunId);
        if (!entry) {
            return { events: [], nextSeq: fromSeq, total: 0 };
        }

        const allEvents = await this.readAllEvents(entry);
        const events = allEvents.filter((event) => event.seq >= fromSeq).slice(0, limit);
        const lastEvent = events.at(-1);

        return { events, nextSeq: lastEvent ? lastEvent.seq + 1 : fromSeq, total: entry.count };
    }

    rawStream(nodeRunId: string): NodeJS.ReadableStream {
        const entry = this.findIndexEntry(nodeRunId);
        if (!entry) {
            return Readable.from([]);
        }

        return this.fs.createReadStream(this.filePathOf(entry));
    }

    stats(nodeRunId: string): Promise<LogStats> {
        const entry = this.findIndexEntry(nodeRunId);

        return Promise.resolve({ count: entry?.count ?? 0, bytes: entry?.bytes ?? 0 });
    }

    async deleteRun(runId: string): Promise<void> {
        await this.fs.rm(path.join(this.deps.logsDir, runId), { recursive: true, force: true });
        this.deps.db.delete(logIndex).where(eq(logIndex.runId, runId)).run();
    }

    private async appendNext(ref: NodeRunLogRef, event: AgentEvent): Promise<StoredLogEvent> {
        const entry = this.findIndexEntry(ref.nodeRunId);
        const seq = (entry?.count ?? 0) + 1;
        const stored = toStoredLogEvent(event, seq, (text) => this.deps.redactor.redact(text));
        const line = JSON.stringify(stored) + LINE_BREAK;

        const filePath = this.filePathOf(ref);
        await this.fs.mkdir(path.dirname(filePath), { recursive: true });
        await this.fs.appendFile(filePath, line, ENCODING);
        this.saveIndexEntry(ref, { count: seq, bytes: (entry?.bytes ?? 0) + byteLengthOf(line) });

        return stored;
    }

    private async readAllEvents(ref: NodeRunLogRef): Promise<StoredLogEvent[]> {
        const content = await this.fs.readFile(this.filePathOf(ref), ENCODING);

        return content
            .split(LINE_BREAK)
            .filter((line) => line.length > 0)
            .map((line) => storedLogEventSchema.parse(JSON.parse(line)));
    }

    private filePathOf({ runId, nodeRunId }: NodeRunLogRef): string {
        return path.join(this.deps.logsDir, runId, nodeRunId + LOG_FILE_EXTENSION);
    }

    private findIndexEntry(nodeRunId: string): LogIndexRow | undefined {
        return this.deps.db.select().from(logIndex).where(eq(logIndex.nodeRunId, nodeRunId)).get();
    }

    private saveIndexEntry(ref: NodeRunLogRef, totals: LogStats): void {
        const updatedAt = this.deps.clock.now().toISOString();
        this.deps.db
            .insert(logIndex)
            .values({ ...ref, ...totals, updatedAt })
            .onConflictDoUpdate({ target: logIndex.nodeRunId, set: { ...totals, updatedAt } })
            .run();
    }
}

function toStoredLogEvent(
    event: AgentEvent,
    seq: number,
    redact: (text: string) => string,
): StoredLogEvent {
    const at = event.at.toISOString();

    switch (event.kind) {
        case "text":
            return {
                seq,
                at,
                kind: event.kind,
                text: redact(event.text),
                iteration: event.iteration,
            };
        case "tool_call":
            return {
                seq,
                at,
                kind: event.kind,
                name: redact(event.name),
                args: redact(event.args),
                iteration: event.iteration,
            };
        case "raw":
            return {
                seq,
                at,
                kind: event.kind,
                line: redact(event.line),
                iteration: event.iteration,
            };
        case "system":
            return { seq, at, kind: event.kind, message: redact(event.message) };
        default:
            return assertNever(event);
    }
}

function byteLengthOf(text: string): number {
    return Buffer.byteLength(text, ENCODING);
}

import { once } from "node:events";
import { get } from "node:http";
import type { ClientRequest, IncomingMessage } from "node:http";

import type { EventEnvelope } from "@/shared/events.js";

const FRAME_SEPARATOR = "\n\n";
const COMMENT_PREFIX = ":";
const FIELD_SEPARATOR = ": ";

export interface ServerSentEvent {
    id: number;
    event: string;
    data: EventEnvelope;
}

// Uses node:http instead of fetch because fetch keeps a spare socket alive after an abort, which
// holds the server open for seconds when the test closes it.
export class EventStreamClient {
    private receivedText = "";

    private constructor(
        private readonly request: ClientRequest,
        private readonly response: IncomingMessage,
    ) {
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
            this.receivedText += chunk;
        });
    }

    static open(url: string, headers: Record<string, string>): Promise<EventStreamClient> {
        return new Promise((resolve, reject) => {
            const request = get(url, { headers, agent: false }, (response) => {
                resolve(new EventStreamClient(request, response));
            });
            request.once("error", reject);
        });
    }

    get contentType(): string {
        return this.response.headers["content-type"] ?? "";
    }

    get text(): string {
        return this.receivedText;
    }

    async nextEvents(count: number): Promise<ServerSentEvent[]> {
        await this.waitUntil(() => this.parseEvents().length >= count);
        return this.parseEvents().slice(0, count);
    }

    async waitForText(expected: string): Promise<void> {
        await this.waitUntil(() => this.receivedText.includes(expected));
    }

    async waitForEnd(): Promise<void> {
        if (!this.response.readableEnded) {
            await once(this.response, "end");
        }
    }

    close(): void {
        this.request.destroy();
    }

    private async waitUntil(isSatisfied: () => boolean): Promise<void> {
        while (!isSatisfied()) {
            await once(this.response, "data");
        }
    }

    private parseEvents(): ServerSentEvent[] {
        const completeFrames = this.receivedText.split(FRAME_SEPARATOR).slice(0, -1);
        return completeFrames.filter((frame) => !frame.startsWith(COMMENT_PREFIX)).map(parseFrame);
    }
}

function parseFrame(frame: string): ServerSentEvent {
    const fields = new Map(frame.split("\n").map(splitField));
    return {
        id: Number(fields.get("id")),
        event: fields.get("event") ?? "",
        data: parseEnvelope(fields.get("data") ?? ""),
    };
}

function splitField(line: string): [name: string, content: string] {
    const separatorIndex = line.indexOf(FIELD_SEPARATOR);
    return [line.slice(0, separatorIndex), line.slice(separatorIndex + FIELD_SEPARATOR.length)];
}

function parseEnvelope(json: string): EventEnvelope {
    // The stream carries EventEnvelope values serialized by the server; tests assert on them.
    return JSON.parse(json) as EventEnvelope;
}

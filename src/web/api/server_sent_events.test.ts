import { readServerSentEvents } from "@/web/api/server_sent_events.js";
import type { ServerSentEvent } from "@/web/api/server_sent_events.js";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();

    return new ReadableStream({
        start(controller) {
            chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
            controller.close();
        },
    });
}

async function collectEvents(chunks: string[]): Promise<ServerSentEvent[]> {
    const events: ServerSentEvent[] = [];
    await readServerSentEvents(streamOf(chunks), (event) => events.push(event));
    return events;
}

describe("readServerSentEvents", () => {
    it("delivers each frame with its event name and data", async () => {
        const events = await collectEvents([
            'event: line\ndata: {"line":"#1"}\n\nevent: done\ndata: {"ok":true}\n\n',
        ]);

        expect(events).toEqual([
            { event: "line", data: '{"line":"#1"}' },
            { event: "done", data: '{"ok":true}' },
        ]);
    });

    it("joins a frame split across chunks", async () => {
        const events = await collectEvents(["event: li", 'ne\ndata: {"line"', ':"#1"}\n', "\n"]);

        expect(events).toEqual([{ event: "line", data: '{"line":"#1"}' }]);
    });

    it("names a frame without an event field 'message' and joins its data lines", async () => {
        const events = await collectEvents(["data: first\ndata: second\n\n"]);

        expect(events).toEqual([{ event: "message", data: "first\nsecond" }]);
    });

    it("ignores comment frames", async () => {
        const events = await collectEvents([": ping\n\nevent: done\ndata: {}\n\n"]);

        expect(events).toEqual([{ event: "done", data: "{}" }]);
    });
});

export interface ServerSentEvent {
    event: string;
    data: string;
}

const FRAME_SEPARATOR = "\n\n";
const FIELD_SEPARATOR = ": ";
const DEFAULT_EVENT_NAME = "message";

/** Reads an SSE response body, for streams EventSource can't open (a POST, for example). */
export async function readServerSentEvents(
    body: ReadableStream<Uint8Array>,
    onEvent: (event: ServerSentEvent) => void,
): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let pendingText = "";

    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        const receivedText = pendingText + decoder.decode(chunk.value, { stream: true });
        const frames = receivedText.split(FRAME_SEPARATOR);
        // The last piece is a frame still on its way, completed by the next chunks.
        pendingText = frames.pop() ?? "";
        for (const frame of frames) {
            deliverFrame(frame, onEvent);
        }
    }
}

function deliverFrame(frame: string, onEvent: (event: ServerSentEvent) => void): void {
    const event = parseFrame(frame);
    if (event) {
        onEvent(event);
    }
}

function parseFrame(frame: string): ServerSentEvent | undefined {
    let event = DEFAULT_EVENT_NAME;
    const dataLines: string[] = [];

    for (const line of frame.split("\n")) {
        const [field, fieldValue] = splitField(line);
        if (field === "event") {
            event = fieldValue;
        }
        if (field === "data") {
            dataLines.push(fieldValue);
        }
    }

    if (dataLines.length === 0) {
        return undefined;
    }

    return { event, data: dataLines.join("\n") };
}

function splitField(line: string): [field: string, fieldValue: string] {
    const separatorIndex = line.indexOf(FIELD_SEPARATOR);
    if (separatorIndex === -1) {
        return [line, ""];
    }

    return [line.slice(0, separatorIndex), line.slice(separatorIndex + FIELD_SEPARATOR.length)];
}

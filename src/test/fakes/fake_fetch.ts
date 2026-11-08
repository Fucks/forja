import type { MockInstance } from "vitest";

import type { ApiErrorBody } from "@/shared/api_types.js";

type FakeRouteResponder = () => Response | Promise<Response>;

/** Keys are `"<METHOD> <path>"`, e.g. `"GET /api/projects"`. */
export type FakeRoutes = Record<string, FakeRouteResponder>;

export interface SentWrite {
    method: string;
    url: string;
    body: unknown;
}

const HTTP_NOT_FOUND = 404;
const READ_METHOD = "GET";

export function stubFetchRoutes(routes: FakeRoutes): MockInstance<typeof fetch> {
    return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
        const respond = routes[describeRoute(input, init)];
        if (!respond) {
            return Promise.resolve(answerRouteNotFound());
        }

        return Promise.resolve(respond());
    });
}

export function respondWithApiError(status: number, message: string): Response {
    const body: ApiErrorBody = { error: { code: "error", message } };
    return Response.json(body, { status });
}

/** Every non-GET request sent through the stub, with its JSON body parsed. */
export function listSentWrites(fetchSpy: MockInstance<typeof fetch>): SentWrite[] {
    return fetchSpy.mock.calls
        .map(([input, init]) => ({
            method: init?.method ?? READ_METHOD,
            url: readUrl(input),
            body: parseSentBody(init?.body),
        }))
        .filter((request) => request.method !== READ_METHOD);
}

function parseSentBody(body: BodyInit | null | undefined): unknown {
    return typeof body === "string" ? (JSON.parse(body) as unknown) : undefined;
}

function describeRoute(input: Parameters<typeof fetch>[0], init: RequestInit | undefined): string {
    const method = init?.method ?? READ_METHOD;
    return `${method} ${readUrl(input)}`;
}

function readUrl(input: Parameters<typeof fetch>[0]): string {
    if (typeof input === "string") {
        return input;
    }
    if (input instanceof URL) {
        return input.pathname;
    }

    return new URL(input.url).pathname;
}

function answerRouteNotFound(): Response {
    return respondWithApiError(HTTP_NOT_FOUND, "Rota não encontrada.");
}

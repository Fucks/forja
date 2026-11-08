import type { MockInstance } from "vitest";

import type { ApiErrorBody } from "@/shared/api_types.js";

type FakeRouteResponder = () => Response | Promise<Response>;

/** Keys are `"<METHOD> <path>"`, e.g. `"GET /api/projects"`. */
export type FakeRoutes = Record<string, FakeRouteResponder>;

const HTTP_NOT_FOUND = 404;

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

function describeRoute(input: Parameters<typeof fetch>[0], init: RequestInit | undefined): string {
    const method = init?.method ?? "GET";
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

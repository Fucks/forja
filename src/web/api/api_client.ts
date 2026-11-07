import type { z } from "zod";

import { apiErrorBodySchema } from "@/shared/api_types.js";

const API_PREFIX = "/api";
const JSON_HEADERS = { "content-type": "application/json" };

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface ApiErrorFields {
    status: number;
    message: string;
    code?: string;
    details?: unknown;
}

export class ApiError extends Error {
    override readonly name = "ApiError";
    readonly status: number;
    readonly code?: string;
    readonly details?: unknown;

    constructor({ status, message, code, details }: ApiErrorFields) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

interface ApiClient {
    get<T>(path: string, schema?: z.ZodType<T>): Promise<T>;
    post<T>(path: string, body?: unknown, schema?: z.ZodType<T>): Promise<T>;
    put<T>(path: string, body?: unknown, schema?: z.ZodType<T>): Promise<T>;
    delete<T>(path: string, schema?: z.ZodType<T>): Promise<T>;
}

export const apiClient: ApiClient = {
    get: (path, schema) => sendRequest({ method: "GET", path, schema }),
    post: (path, body, schema) => sendRequest({ method: "POST", path, body, schema }),
    put: (path, body, schema) => sendRequest({ method: "PUT", path, body, schema }),
    delete: (path, schema) => sendRequest({ method: "DELETE", path, schema }),
};

interface ApiRequest<T> {
    method: HttpMethod;
    path: string;
    body?: unknown;
    schema?: z.ZodType<T>;
}

async function sendRequest<T>(request: ApiRequest<T>): Promise<T> {
    const response = await fetch(`${API_PREFIX}${request.path}`, buildRequestInit(request));
    if (!response.ok) {
        throw await readApiError(response);
    }

    const body = parseJson(await response.text());
    if (!request.schema) {
        return trustResponseBody<T>(body);
    }

    return request.schema.parse(body);
}

function buildRequestInit(request: ApiRequest<unknown>): RequestInit {
    if (request.body === undefined) {
        return { method: request.method };
    }

    return { method: request.method, headers: JSON_HEADERS, body: JSON.stringify(request.body) };
}

async function readApiError(response: Response): Promise<ApiError> {
    const errorBody = apiErrorBodySchema.safeParse(parseJsonIfPossible(await response.text()));
    if (!errorBody.success) {
        return new ApiError({
            status: response.status,
            message: `Falha na requisição (HTTP ${response.status}).`,
        });
    }

    return new ApiError({ status: response.status, ...errorBody.data.error });
}

function parseJson(text: string): unknown {
    if (text === "") {
        return undefined;
    }

    return JSON.parse(text);
}

// An error may come from a proxy or crash page instead of our handler; its status still matters.
function parseJsonIfPossible(text: string): unknown {
    try {
        return parseJson(text);
    } catch {
        return undefined;
    }
}

// Without a schema the caller chose to trust the server's response shape.
function trustResponseBody<T>(body: unknown): T {
    return body as T;
}

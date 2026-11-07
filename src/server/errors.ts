import type { FastifyError, FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import type { ZodFastifySchemaValidationError } from "fastify-type-provider-zod";
import { ZodError } from "zod";

import type { ApiErrorBody } from "@/shared/api_types.js";

export class NotFoundError extends Error {
    override readonly name = "NotFoundError";
}

export class ConflictError extends Error {
    override readonly name = "ConflictError";
}

export class DomainValidationError extends Error {
    override readonly name = "DomainValidationError";

    constructor(
        message: string,
        readonly details?: unknown,
    ) {
        super(message);
    }
}

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const HTTP_INTERNAL_SERVER_ERROR = 500;

const VALIDATION_ERROR_MESSAGE = "Entrada inválida.";
const BAD_REQUEST_MESSAGE = "Requisição inválida.";
const INTERNAL_ERROR_MESSAGE = "Erro interno do servidor.";

interface ErrorResponse {
    status: number;
    body: ApiErrorBody;
}

interface InputIssue {
    path: string;
    message: string;
}

export function registerErrorHandler(app: FastifyInstance): void {
    app.setErrorHandler((error: FastifyError, request, reply) => {
        const response = toErrorResponse(error);
        if (response.status === HTTP_INTERNAL_SERVER_ERROR) {
            request.log.error(error);
        }

        return reply.code(response.status).send(response.body);
    });
}

function toErrorResponse(error: FastifyError): ErrorResponse {
    if (error instanceof NotFoundError) {
        return errorResponse(HTTP_NOT_FOUND, "not_found", error.message);
    }
    if (error instanceof ConflictError) {
        return errorResponse(HTTP_CONFLICT, "conflict", error.message);
    }
    if (error instanceof DomainValidationError) {
        return errorResponse(HTTP_UNPROCESSABLE_ENTITY, "invalid", error.message, error.details);
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
        return validationErrorResponse(error.validation.map(toSchemaInputIssue));
    }
    if (error instanceof ZodError) {
        return validationErrorResponse(error.issues.map(toZodInputIssue));
    }
    if (isClientError(error)) {
        return errorResponse(error.statusCode, "bad_request", BAD_REQUEST_MESSAGE);
    }

    return errorResponse(HTTP_INTERNAL_SERVER_ERROR, "internal", INTERNAL_ERROR_MESSAGE);
}

function errorResponse(
    status: number,
    code: string,
    message: string,
    details?: unknown,
): ErrorResponse {
    const error = details === undefined ? { code, message } : { code, message, details };
    return { status, body: { error } };
}

function validationErrorResponse(issues: InputIssue[]): ErrorResponse {
    return errorResponse(HTTP_BAD_REQUEST, "validation_error", VALIDATION_ERROR_MESSAGE, issues);
}

function toSchemaInputIssue(issue: ZodFastifySchemaValidationError): InputIssue {
    return { path: issue.instancePath, message: issue.message ?? VALIDATION_ERROR_MESSAGE };
}

function toZodInputIssue(issue: ZodError["issues"][number]): InputIssue {
    return { path: `/${issue.path.join("/")}`, message: issue.message };
}

// Fastify reports malformed requests (invalid JSON, unsupported content type, oversized body) as
// errors carrying a 4xx statusCode; they are the client's fault, not an internal failure.
function isClientError(error: FastifyError): error is FastifyError & { statusCode: number } {
    const { statusCode } = error;
    return (
        statusCode !== undefined &&
        statusCode >= HTTP_BAD_REQUEST &&
        statusCode < HTTP_INTERNAL_SERVER_ERROR
    );
}

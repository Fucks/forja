import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import {
    ConflictError,
    DomainValidationError,
    ForbiddenError,
    NotFoundError,
    registerErrorHandler,
    UnauthorizedError,
} from "@/server/errors.js";

const INTERNAL_MESSAGE = "falha no disco em /home/ana/.forja";

function buildAppThrowing(error: unknown): FastifyInstance {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    registerErrorHandler(app);

    const typedApp = app.withTypeProvider<ZodTypeProvider>();
    typedApp.get("/failing", () => {
        throw error;
    });
    typedApp.post(
        "/projects",
        { schema: { body: z.object({ name: z.string().min(1) }) } },
        (request) => request.body,
    );

    return app;
}

describe("registerErrorHandler", () => {
    it("answers NotFoundError with 404 not_found and the error message", async () => {
        const app = buildAppThrowing(new NotFoundError("Projeto p1 não encontrado."));

        const response = await app.inject({ method: "GET", url: "/failing" });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
            error: { code: "not_found", message: "Projeto p1 não encontrado." },
        });
    });

    it("answers UnauthorizedError with 401 unauthorized and the error message", async () => {
        const app = buildAppThrowing(new UnauthorizedError("Token do webhook inválido."));

        const response = await app.inject({ method: "GET", url: "/failing" });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
            error: { code: "unauthorized", message: "Token do webhook inválido." },
        });
    });

    it("answers ForbiddenError with 403 forbidden and the error message", async () => {
        const app = buildAppThrowing(new ForbiddenError("Só da própria máquina."));

        const response = await app.inject({ method: "GET", url: "/failing" });

        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({
            error: { code: "forbidden", message: "Só da própria máquina." },
        });
    });

    it("answers ConflictError with 409 conflict and the error message", async () => {
        const app = buildAppThrowing(new ConflictError("O fluxo já foi publicado."));

        const response = await app.inject({ method: "GET", url: "/failing" });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({
            error: { code: "conflict", message: "O fluxo já foi publicado." },
        });
    });

    it("answers DomainValidationError with 422 invalid, the message and the details", async () => {
        const details = [{ nodeId: "dev", message: "Porta obrigatória sem ligação." }];
        const app = buildAppThrowing(new DomainValidationError("Fluxo inválido.", details));

        const response = await app.inject({ method: "GET", url: "/failing" });

        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual({
            error: { code: "invalid", message: "Fluxo inválido.", details },
        });
    });

    it("answers a body rejected by the route schema with 400 validation_error", async () => {
        const app = buildAppThrowing(new Error("not used"));

        const response = await app.inject({ method: "POST", url: "/projects", body: { name: "" } });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
            error: {
                code: "validation_error",
                message: "Entrada inválida.",
                details: [{ path: "/name", message: expect.any(String) as unknown }],
            },
        });
    });

    it("answers a ZodError thrown by a handler with 400 validation_error", async () => {
        const parsed = z.object({ port: z.number() }).safeParse({ port: "80" });
        const app = buildAppThrowing(parsed.error);

        const response = await app.inject({ method: "GET", url: "/failing" });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
            error: {
                code: "validation_error",
                message: "Entrada inválida.",
                details: [{ path: "/port", message: expect.any(String) as unknown }],
            },
        });
    });

    it("answers a malformed JSON body with 400 bad_request", async () => {
        const app = buildAppThrowing(new Error("not used"));

        const response = await app.inject({
            method: "POST",
            url: "/projects",
            headers: { "content-type": "application/json" },
            payload: "{ name",
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
            error: { code: "bad_request", message: "Requisição inválida." },
        });
    });

    it("answers an unknown error with 500 internal without exposing its message or stack", async () => {
        const app = buildAppThrowing(new Error(INTERNAL_MESSAGE));

        const response = await app.inject({ method: "GET", url: "/failing" });

        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual({
            error: { code: "internal", message: "Erro interno do servidor." },
        });
        expect(response.body).not.toContain(INTERNAL_MESSAGE);
    });
});

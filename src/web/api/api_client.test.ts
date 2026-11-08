import type { MockInstance } from "vitest";
import { z } from "zod";

import type { ApiErrorBody } from "@/shared/api_types.js";
import { ApiError, apiClient } from "@/web/api/api_client.js";

const projectSchema = z.object({ id: z.string(), name: z.string() });
const project = { id: "p1", name: "Forja" };

function respondWith(response: Response): MockInstance<typeof fetch> {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

async function catchError(request: Promise<unknown>): Promise<unknown> {
    try {
        await request;
    } catch (error) {
        return error;
    }
    throw new Error("A requisição deveria ter falhado.");
}

describe("apiClient", () => {
    it("requests the path under /api and returns the JSON body parsed by the schema", async () => {
        const fetchSpy = respondWith(Response.json(project));

        const received = await apiClient.get("/projects/p1", projectSchema);

        expect(received).toEqual(project);
        expect(fetchSpy).toHaveBeenCalledWith(
            "/api/projects/p1",
            expect.objectContaining({ method: "GET" }),
        );
    });

    it("sends the body as JSON", async () => {
        const fetchSpy = respondWith(Response.json(project, { status: 201 }));

        await apiClient.post("/projects", { name: "Forja" }, projectSchema);

        expect(fetchSpy).toHaveBeenCalledWith("/api/projects", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Forja" }),
        });
    });

    it("sends a PATCH with the partial changes as JSON", async () => {
        const fetchSpy = respondWith(Response.json(project));

        await apiClient.patch("/projects/p1", { name: "Forja" }, projectSchema);

        expect(fetchSpy).toHaveBeenCalledWith("/api/projects/p1", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Forja" }),
        });
    });

    it("sends no body nor content type when there is no body", async () => {
        const fetchSpy = respondWith(new Response(null, { status: 204 }));

        const received = await apiClient.delete("/projects/p1");

        expect(received).toBeUndefined();
        expect(fetchSpy).toHaveBeenCalledWith("/api/projects/p1", { method: "DELETE" });
    });

    it("returns the body unchecked when no schema is given", async () => {
        respondWith(Response.json(project));

        const received = await apiClient.put("/projects/p1", project);

        expect(received).toEqual(project);
    });

    it("throws ApiError with the status, code, message and details of the error body", async () => {
        const body: ApiErrorBody = {
            error: { code: "invalid", message: "Fluxo inválido.", details: [{ nodeId: "dev" }] },
        };
        respondWith(Response.json(body, { status: 422 }));

        const error = await catchError(apiClient.post("/flows/f1/publish"));

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({
            status: 422,
            code: "invalid",
            message: "Fluxo inválido.",
            details: [{ nodeId: "dev" }],
        });
    });

    it("throws ApiError with the status and a generic message when the error has no body", async () => {
        respondWith(new Response(null, { status: 502 }));

        const error = await catchError(apiClient.get("/projects"));

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({
            status: 502,
            code: undefined,
            message: "Falha na requisição (HTTP 502).",
        });
    });

    it("throws ApiError with a generic message when the error body is not an ApiErrorBody", async () => {
        respondWith(new Response("<html>Bad Gateway</html>", { status: 502 }));

        const error = await catchError(apiClient.get("/projects"));

        expect(error).toMatchObject({ status: 502, message: "Falha na requisição (HTTP 502)." });
    });

    it("throws a validation error when the response does not match the schema", async () => {
        respondWith(Response.json({ id: 1 }));

        const error = await catchError(apiClient.get("/projects/p1", projectSchema));

        expect(error).toBeInstanceOf(z.ZodError);
    });
});

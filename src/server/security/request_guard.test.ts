import { checkRequest, type GuardedRequest } from "@/server/security/request_guard.js";

const PORT = 4317;
const TOKEN = "token-da-sessao";
const CONTEXT = { token: TOKEN, port: PORT };
const LOCAL_ORIGIN = `http://127.0.0.1:${PORT}`;

function apiRequest(overrides: Partial<GuardedRequest> = {}): GuardedRequest {
    return {
        method: "GET",
        url: "/api/projects",
        headers: { host: `127.0.0.1:${PORT}` },
        cookies: { forja_session: TOKEN },
        remoteAddress: "127.0.0.1",
        ...overrides,
    };
}

function withHeaders(headers: Record<string, string | undefined>): Partial<GuardedRequest> {
    return { headers: { host: `127.0.0.1:${PORT}`, ...headers } };
}

describe("checkRequest", () => {
    describe("API requests", () => {
        it("accepts the session cookie from the local host", () => {
            expect(checkRequest(apiRequest(), CONTEXT)).toEqual({ ok: true });
        });

        it("accepts localhost as the host and the origin", () => {
            const request = apiRequest(
                withHeaders({ host: `localhost:${PORT}`, origin: `http://localhost:${PORT}` }),
            );

            expect(checkRequest(request, CONTEXT)).toEqual({ ok: true });
        });

        it("accepts a POST whose origin is the app itself", () => {
            const request = apiRequest({
                method: "POST",
                ...withHeaders({ origin: LOCAL_ORIGIN }),
            });

            expect(checkRequest(request, CONTEXT)).toEqual({ ok: true });
        });

        it("answers 401 without the session cookie", () => {
            const result = checkRequest(apiRequest({ cookies: {} }), CONTEXT);

            expect(result).toMatchObject({ ok: false, status: 401 });
        });

        it("answers 401 with a session cookie of another boot", () => {
            const result = checkRequest(
                apiRequest({ cookies: { forja_session: "velho" } }),
                CONTEXT,
            );

            expect(result).toMatchObject({ ok: false, status: 401 });
        });

        it("answers 403 when the host is another name, as in DNS rebinding", () => {
            const request = apiRequest(withHeaders({ host: `evil.example:${PORT}` }));

            expect(checkRequest(request, CONTEXT)).toMatchObject({ ok: false, status: 403 });
        });

        it("answers 403 when the host has another port", () => {
            const request = apiRequest(withHeaders({ host: "127.0.0.1:8080" }));

            expect(checkRequest(request, CONTEXT)).toMatchObject({ ok: false, status: 403 });
        });

        it("answers 403 without a host", () => {
            const request = apiRequest({ headers: {} });

            expect(checkRequest(request, CONTEXT)).toMatchObject({ ok: false, status: 403 });
        });

        it("answers 403 when another site sends the request", () => {
            const request = apiRequest(withHeaders({ origin: "https://evil.example" }));

            expect(checkRequest(request, CONTEXT)).toMatchObject({ ok: false, status: 403 });
        });

        it("answers 403 when the origin is the local host on another port", () => {
            const request = apiRequest(withHeaders({ origin: "http://127.0.0.1:8080" }));

            expect(checkRequest(request, CONTEXT)).toMatchObject({ ok: false, status: 403 });
        });

        it("answers 403 for an opaque origin", () => {
            const request = apiRequest(withHeaders({ origin: "null" }));

            expect(checkRequest(request, CONTEXT)).toMatchObject({ ok: false, status: 403 });
        });

        it("checks the host before the cookie", () => {
            const request = apiRequest({ cookies: {}, ...withHeaders({ host: "evil.example" }) });

            expect(checkRequest(request, CONTEXT)).toMatchObject({ ok: false, status: 403 });
        });

        it.each(["/api/hooks/../projects", "/api/hooks/%2e%2e/projects", "//api/projects"])(
            "asks for the cookie on %s, which only disguises an API path",
            (url) => {
                const request = apiRequest({ url, cookies: {} });

                expect(checkRequest(request, CONTEXT)).toMatchObject({ ok: false, status: 401 });
            },
        );

        it("asks for the cookie whatever the query string says", () => {
            const request = apiRequest({ url: "/api/projects?x=/api/hooks/", cookies: {} });

            expect(checkRequest(request, CONTEXT)).toMatchObject({ ok: false, status: 401 });
        });
    });

    describe("webhook requests", () => {
        const hookRequest = (overrides: Partial<GuardedRequest>): GuardedRequest =>
            apiRequest({ method: "POST", url: "/api/hooks/trg_1", cookies: {}, ...overrides });

        it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1"])(
            "accepts a webhook without the session cookie from %s",
            (remoteAddress) => {
                const result = checkRequest(hookRequest({ remoteAddress }), CONTEXT);

                expect(result).toEqual({ ok: true });
            },
        );

        it("accepts a webhook whose host is not the app, as a local script may send", () => {
            const request = hookRequest(withHeaders({ host: "forja.local" }));

            expect(checkRequest(request, CONTEXT)).toEqual({ ok: true });
        });

        it("answers 403 to a webhook from another machine", () => {
            const result = checkRequest(hookRequest({ remoteAddress: "192.168.0.7" }), CONTEXT);

            expect(result).toMatchObject({ ok: false, status: 403 });
        });
    });

    describe("web app requests", () => {
        it("serves the web app without the session cookie, since it hands the cookie out", () => {
            const request = apiRequest({ url: "/projetos/prj_1", cookies: {} });

            expect(checkRequest(request, CONTEXT)).toEqual({ ok: true });
        });

        it("answers 403 to the web app under another host", () => {
            const request = apiRequest({ url: "/", ...withHeaders({ host: "evil.example" }) });

            expect(checkRequest(request, CONTEXT)).toMatchObject({ ok: false, status: 403 });
        });
    });
});

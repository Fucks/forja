import { formatSessionCookie, parseCookies } from "@/server/security/session_cookie.js";

describe("formatSessionCookie", () => {
    it("keeps the token away from scripts and from requests other sites start", () => {
        expect(formatSessionCookie("abc")).toBe(
            "forja_session=abc; Path=/; HttpOnly; SameSite=Strict",
        );
    });
});

describe("parseCookies", () => {
    it("reads every cookie of the header", () => {
        expect(parseCookies("tema=escuro; forja_session=abc")).toEqual({
            tema: "escuro",
            forja_session: "abc",
        });
    });

    it("keeps the equals signs inside a value", () => {
        expect(parseCookies("forja_session=a=b")).toEqual({ forja_session: "a=b" });
    });

    it("skips a cookie without a value", () => {
        expect(parseCookies("solto; forja_session=abc")).toEqual({ forja_session: "abc" });
    });

    it("reads no cookie without the header", () => {
        expect(parseCookies(undefined)).toEqual({});
    });
});

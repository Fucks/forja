import { SESSION_COOKIE_NAME } from "@/server/security/request_guard.js";

const COOKIE_SEPARATOR = ";";
const NAME_VALUE_SEPARATOR = "=";
// No Secure flag: the app is served over plain http on the loopback.
const SESSION_COOKIE_ATTRIBUTES = "Path=/; HttpOnly; SameSite=Strict";

export function formatSessionCookie(token: string): string {
    return `${SESSION_COOKIE_NAME}=${token}; ${SESSION_COOKIE_ATTRIBUTES}`;
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
    if (cookieHeader === undefined) {
        return {};
    }

    const cookies = cookieHeader.split(COOKIE_SEPARATOR).map(parseCookie);
    return Object.fromEntries(cookies.filter((cookie) => cookie !== undefined));
}

function parseCookie(cookie: string): [string, string] | undefined {
    const separatorIndex = cookie.indexOf(NAME_VALUE_SEPARATOR);
    if (separatorIndex === -1) {
        return undefined;
    }

    return [cookie.slice(0, separatorIndex).trim(), cookie.slice(separatorIndex + 1).trim()];
}

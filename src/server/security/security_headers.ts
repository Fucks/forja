import type { FastifyInstance } from "fastify";

// React Flow and Radix position elements through inline style attributes, hence 'unsafe-inline'
// for styles only; scripts stay limited to the bundle the app serves.
const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": CONTENT_SECURITY_POLICY,
};

// On request, so the answers the guard rejects carry the headers too.
export function addSecurityHeaders(app: FastifyInstance): void {
    app.addHook("onRequest", (_request, reply, done) => {
        reply.headers(SECURITY_HEADERS);
        done();
    });
}

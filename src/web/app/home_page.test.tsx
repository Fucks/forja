import { render, screen } from "@testing-library/react";

import { HomePage } from "@/web/app/home_page.js";

describe("HomePage", () => {
    it("shows the product name", () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ status: "ok" }));

        render(<HomePage />);

        expect(screen.getByRole("heading", { name: "Forja" })).toBeInTheDocument();
    });

    it("shows that the server is ok when /api/health answers", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(Response.json({ status: "ok" }));

        render(<HomePage />);

        expect(await screen.findByText("servidor: ok")).toBeInTheDocument();
        expect(fetchSpy).toHaveBeenCalledWith("/api/health", expect.anything());
    });

    it("shows that the server is unavailable when the request fails", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

        render(<HomePage />);

        expect(await screen.findByText("servidor indisponível")).toBeInTheDocument();
    });

    it("shows that the server is unavailable when /api/health answers with an error", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 502 }));

        render(<HomePage />);

        expect(await screen.findByText("servidor indisponível")).toBeInTheDocument();
    });
});

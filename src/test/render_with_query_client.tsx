import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";

export function renderWithQueryClient(ui: ReactNode): RenderResult {
    return render(<QueryClientProvider client={createTestQueryClient()}>{ui}</QueryClientProvider>);
}

export function createTestQueryClient(): QueryClient {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

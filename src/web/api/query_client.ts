import { QueryClient } from "@tanstack/react-query";

const QUERY_RETRY_COUNT = 1;
const QUERY_STALE_TIME_MS = 5_000;

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: QUERY_RETRY_COUNT, staleTime: QUERY_STALE_TIME_MS },
    },
});

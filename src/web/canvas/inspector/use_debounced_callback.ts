import { useEffect, useRef } from "react";

interface PendingCall<T> {
    timer: ReturnType<typeof setTimeout>;
    argument: T;
}

// The pending call still runs when the component unmounts, so switching nodes keeps the last edit.
export function useDebouncedCallback<T>(
    callback: (argument: T) => void,
    delayMs: number,
): (argument: T) => void {
    const latestCallback = useRef(callback);
    const pendingCall = useRef<PendingCall<T> | null>(null);

    useEffect(() => {
        latestCallback.current = callback;
    });

    useEffect(() => () => runPendingCall(pendingCall, latestCallback.current), []);

    return (argument: T) => {
        if (pendingCall.current) {
            clearTimeout(pendingCall.current.timer);
        }
        const timer = setTimeout(
            () => runPendingCall(pendingCall, latestCallback.current),
            delayMs,
        );
        pendingCall.current = { timer, argument };
    };
}

function runPendingCall<T>(
    pendingCall: { current: PendingCall<T> | null },
    callback: (argument: T) => void,
): void {
    const call = pendingCall.current;
    if (!call) {
        return;
    }

    clearTimeout(call.timer);
    pendingCall.current = null;
    callback(call.argument);
}

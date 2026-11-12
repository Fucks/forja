import * as RadixToast from "@radix-ui/react-toast";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createContext, useContext, useMemo, useRef, useState } from "react";
import type { JSX, ReactNode } from "react";

export type ToastTone = "info" | "success" | "error";

interface ToastMessage {
    title: string;
    description?: string;
    tone?: ToastTone;
}

interface ToastApi {
    show(toast: ToastMessage): void;
}

interface VisibleToast extends ToastMessage {
    id: number;
}

const AUTO_DISMISS_MS = 5_000;
const ICON_SIZE_PX = 16;

interface ToneStyle {
    icon: LucideIcon;
    colorVar: string;
    durationMs: number;
}

const TONE_STYLES: Record<ToastTone, ToneStyle> = {
    info: { icon: Info, colorVar: "--color-steel", durationMs: AUTO_DISMISS_MS },
    success: { icon: CircleCheck, colorVar: "--status-succeeded", durationMs: AUTO_DISMISS_MS },
    error: { icon: CircleAlert, colorVar: "--status-failed", durationMs: Infinity },
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
    const [visibleToasts, setVisibleToasts] = useState<VisibleToast[]>([]);
    const nextToastIdRef = useRef(0);

    const toastApi = useMemo<ToastApi>(
        () => ({
            show(toast) {
                const id = nextToastIdRef.current++;
                setVisibleToasts((current) => [...current, { ...toast, id }]);
            },
        }),
        [],
    );

    function dismissToast(id: number): void {
        setVisibleToasts((current) => current.filter((toast) => toast.id !== id));
    }

    return (
        <ToastContext value={toastApi}>
            <RadixToast.Provider swipeDirection="right" label="Notificações">
                {children}
                {visibleToasts.map((toast) => (
                    <ToastCard
                        key={toast.id}
                        toast={toast}
                        onDismiss={() => dismissToast(toast.id)}
                    />
                ))}
                <RadixToast.Viewport className="fixed right-4 bottom-4 z-[60] flex w-80 max-w-[90vw] flex-col gap-2 outline-none" />
            </RadixToast.Provider>
        </ToastContext>
    );
}

export function useToast(): ToastApi {
    const toastApi = useContext(ToastContext);
    if (!toastApi) {
        throw new Error("useToast precisa ser usado dentro de ToastProvider.");
    }

    return toastApi;
}

export function useFailureToast(): (title: string, error: Error) => void {
    const toast = useToast();

    return (title, error) => toast.show({ tone: "error", title, description: error.message });
}

function ToastCard({
    toast,
    onDismiss,
}: {
    toast: ToastMessage;
    onDismiss: () => void;
}): JSX.Element {
    const { icon: Icon, colorVar, durationMs } = TONE_STYLES[toast.tone ?? "info"];

    return (
        <RadixToast.Root
            duration={durationMs}
            onOpenChange={(isOpen) => {
                if (!isOpen) {
                    onDismiss();
                }
            }}
            className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-3 text-text shadow-float"
        >
            <Icon size={ICON_SIZE_PX} aria-hidden="true" style={{ color: `var(${colorVar})` }} />
            <div className="flex flex-1 flex-col gap-1">
                <RadixToast.Title className="font-medium">{toast.title}</RadixToast.Title>
                {toast.description && (
                    <RadixToast.Description className="text-muted">
                        {toast.description}
                    </RadixToast.Description>
                )}
            </div>
            <RadixToast.Close
                aria-label="Fechar"
                className="rounded-sm p-0.5 text-muted hover:text-text"
            >
                <X size={ICON_SIZE_PX} aria-hidden="true" />
            </RadixToast.Close>
        </RadixToast.Root>
    );
}

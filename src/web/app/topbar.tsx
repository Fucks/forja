import { clsx } from "clsx";
import { Hand, Moon, PauseCircle, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";
import { Link } from "react-router";

import { formatCount } from "@/lib/format.js";
import { usePendingApprovals } from "@/web/app/approvals/use_approvals.js";
import { useSetTriggersPaused, useTriggersPaused } from "@/web/app/triggers/use_triggers.js";
import { Button } from "@/web/components/ui/button.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { approvalsPath, projectPath } from "@/web/config/navigation.js";
import type { ThemeName } from "@/web/styles/theme.js";
import { useTheme } from "@/web/styles/use_theme.js";

interface ThemeSwitch {
    nextTheme: ThemeName;
    label: string;
    icon: LucideIcon;
}

const PENDING_APPROVAL_NOUNS = { one: "aprovação pendente", other: "aprovações pendentes" };

const THEME_SWITCHES: Record<ThemeName, ThemeSwitch> = {
    dark: { nextTheme: "light", label: "Usar tema claro", icon: Sun },
    light: { nextTheme: "dark", label: "Usar tema escuro", icon: Moon },
};

export function Topbar({
    projectId,
    connected,
}: {
    projectId: string | undefined;
    connected: boolean;
}): JSX.Element {
    return (
        <header className="flex h-11 shrink-0 items-center gap-4 border-b border-border px-4">
            <div className="min-w-0 flex-1 truncate">
                {projectId && (
                    <Link to={projectPath(projectId)} className="font-medium hover:text-accent">
                        {projectId}
                    </Link>
                )}
            </div>
            {projectId && <PendingApprovalsCounter projectId={projectId} />}
            <TriggersPausedIndicator />
            <LiveIndicator connected={connected} />
            <ThemeToggle />
        </header>
    );
}

function PendingApprovalsCounter({ projectId }: { projectId: string }): JSX.Element | null {
    const pendingCount = usePendingApprovals(projectId).data?.length ?? 0;
    if (pendingCount === 0) {
        return null;
    }

    return (
        <Link
            to={approvalsPath(projectId)}
            aria-label={formatCount(pendingCount, PENDING_APPROVAL_NOUNS)}
            className="inline-flex items-center gap-1.5 text-xs text-status-waiting-approval hover:underline"
        >
            <Hand aria-hidden className="size-3.5" />
            {pendingCount}
        </Link>
    );
}

function TriggersPausedIndicator(): JSX.Element | null {
    const pausedQuery = useTriggersPaused();
    const setTriggersPaused = useSetTriggersPaused();
    if (!pausedQuery.data?.paused) {
        return null;
    }

    return (
        <div
            role="status"
            aria-label="Gatilhos pausados"
            className="inline-flex items-center gap-2 text-xs text-status-waiting-limit"
        >
            <PauseCircle aria-hidden className="size-3.5" />
            Gatilhos pausados
            <Button
                size="sm"
                loading={setTriggersPaused.isPending}
                onClick={() => setTriggersPaused.mutate(false)}
            >
                Retomar
            </Button>
        </div>
    );
}

function LiveIndicator({ connected }: { connected: boolean }): JSX.Element {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span
                aria-hidden="true"
                className={clsx(
                    "size-2 rounded-full",
                    connected ? "bg-status-succeeded" : "bg-status-pending",
                )}
            />
            {connected ? "Ao vivo" : "Desconectado"}
        </span>
    );
}

function ThemeToggle(): JSX.Element {
    const { theme, changeTheme } = useTheme();
    const { nextTheme, label, icon } = THEME_SWITCHES[theme];

    return <IconButton label={label} icon={icon} onClick={() => changeTheme(nextTheme)} />;
}

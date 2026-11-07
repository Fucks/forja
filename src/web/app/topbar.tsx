import { clsx } from "clsx";
import { Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";
import { Link } from "react-router";

import { IconButton } from "@/web/components/ui/icon_button.js";
import { projectPath } from "@/web/config/navigation.js";
import type { ThemeName } from "@/web/styles/theme.js";
import { useTheme } from "@/web/styles/use_theme.js";

interface ThemeSwitch {
    nextTheme: ThemeName;
    label: string;
    icon: LucideIcon;
}

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
            <LiveIndicator connected={connected} />
            <ThemeToggle />
        </header>
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

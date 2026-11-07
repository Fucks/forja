import type { LucideIcon } from "lucide-react";
import type { ComponentProps, JSX } from "react";

import { Button } from "@/web/components/ui/button.js";
import { cn } from "@/web/components/ui/cn.js";

export function IconButton({
    label,
    icon: Icon,
    className,
    ...buttonProps
}: { label: string; icon: LucideIcon } & ComponentProps<"button">): JSX.Element {
    return (
        <Button
            variant="ghost"
            aria-label={label}
            title={label}
            className={cn("aspect-square px-0", className)}
            {...buttonProps}
        >
            <Icon aria-hidden className="size-4" />
        </Button>
    );
}

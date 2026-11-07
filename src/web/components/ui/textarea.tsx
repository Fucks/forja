import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/web/components/ui/cn.js";
import { buildControlClassName } from "@/web/components/ui/control_styles.js";
import { useFieldControlAttributes } from "@/web/components/ui/field.js";

type TextareaProps = ComponentPropsWithoutRef<"textarea">;

export const Textarea = forwardRef<
    HTMLTextAreaElement,
    TextareaProps & { invalid?: boolean; mono?: boolean }
>(function Textarea(
    {
        invalid = false,
        mono = false,
        id,
        "aria-describedby": describedBy,
        className,
        ...textareaProps
    },
    ref,
) {
    const field = useFieldControlAttributes({ id, describedBy, invalid });

    return (
        <textarea
            ref={ref}
            {...textareaProps}
            {...field.attributes}
            className={cn(
                buildControlClassName({ isInvalid: field.isInvalid, isMono: mono }),
                "min-h-16 py-1.5",
                className,
            )}
        />
    );
});

import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/web/components/ui/cn.js";
import {
    CONTROL_HEIGHT_CLASSES,
    buildControlClassName,
} from "@/web/components/ui/control_styles.js";
import { useFieldControlAttributes } from "@/web/components/ui/field.js";

type InputProps = ComponentPropsWithoutRef<"input">;

export const Input = forwardRef<
    HTMLInputElement,
    InputProps & { invalid?: boolean; mono?: boolean }
>(function Input(
    {
        invalid = false,
        mono = false,
        id,
        "aria-describedby": describedBy,
        className,
        ...inputProps
    },
    ref,
) {
    const field = useFieldControlAttributes({ id, describedBy, invalid });

    return (
        <input
            ref={ref}
            {...inputProps}
            {...field.attributes}
            className={cn(
                buildControlClassName({ isInvalid: field.isInvalid, isMono: mono }),
                CONTROL_HEIGHT_CLASSES.md,
                className,
            )}
        />
    );
});

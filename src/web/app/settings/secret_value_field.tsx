import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";

import { Field } from "@/web/components/ui/field.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { Input } from "@/web/components/ui/input.js";

export function SecretValueField({
    id,
    label,
    hint,
    value,
    onChange,
    required = false,
}: {
    id: string;
    label: string;
    hint: string;
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
}): JSX.Element {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <Field label={label} htmlFor={id} hint={hint}>
            <div className="flex gap-1">
                <Input
                    mono
                    required={required}
                    type={isVisible ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                />
                <IconButton
                    label="Mostrar enquanto digito"
                    icon={isVisible ? EyeOff : Eye}
                    aria-pressed={isVisible}
                    onClick={() => setIsVisible(!isVisible)}
                />
            </div>
        </Field>
    );
}

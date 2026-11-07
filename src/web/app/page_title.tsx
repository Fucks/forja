import type { JSX } from "react";

export function PageTitle({ children }: { children: string }): JSX.Element {
    return <h1 className="font-condensed text-xl font-semibold">{children}</h1>;
}

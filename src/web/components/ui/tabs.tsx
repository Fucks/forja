import * as RadixTabs from "@radix-ui/react-tabs";
import type { JSX, ReactNode } from "react";

interface Tab<Value extends string> {
    value: Value;
    label: string;
    content: ReactNode;
}

export function Tabs<Value extends string>({
    label,
    value,
    onValueChange,
    tabs,
}: {
    label: string;
    value: Value;
    onValueChange: (value: Value) => void;
    tabs: Tab<Value>[];
}): JSX.Element {
    function selectTab(selectedValue: string): void {
        const selectedTab = tabs.find((tab) => tab.value === selectedValue);
        if (selectedTab) {
            onValueChange(selectedTab.value);
        }
    }

    return (
        <RadixTabs.Root value={value} onValueChange={selectTab} className="flex flex-col gap-3">
            <RadixTabs.List aria-label={label} className="flex gap-1 border-b border-border">
                {tabs.map((tab) => (
                    <RadixTabs.Trigger
                        key={tab.value}
                        value={tab.value}
                        className="-mb-px border-b-2 border-transparent px-3 py-2 text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-accent data-[state=active]:border-accent data-[state=active]:text-text"
                    >
                        {tab.label}
                    </RadixTabs.Trigger>
                ))}
            </RadixTabs.List>
            {tabs.map((tab) => (
                <RadixTabs.Content key={tab.value} value={tab.value} className="focus:outline-none">
                    {tab.content}
                </RadixTabs.Content>
            ))}
        </RadixTabs.Root>
    );
}

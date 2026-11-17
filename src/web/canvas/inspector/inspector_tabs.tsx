import { useState } from "react";
import type { JSX, ReactNode } from "react";

import { Tabs } from "@/web/components/ui/tabs.js";
import type { DocumentedType } from "@/web/docs/node_docs/node_doc.js";

const INSPECTOR_TABS = ["configure", "data", "help"] as const;
type InspectorTab = (typeof INSPECTOR_TABS)[number];

const INSPECTOR_TAB_LABELS: Record<InspectorTab, string> = {
    configure: "Configurar",
    data: "Dados",
    help: "Ajuda",
};

const DEFAULT_TAB: InspectorTab = "configure";
const TAB_STORAGE_KEY_PREFIX = "forja.inspector.tab.";

// The tab list stays at the top while the panel scrolls.
const STICKY_TAB_LIST_CLASSES = "sticky top-0 z-10 bg-surface px-3";

export function InspectorTabs({
    type,
    configure,
    data,
    help,
}: {
    type: DocumentedType;
    configure: ReactNode;
    data: ReactNode;
    help: ReactNode;
}): JSX.Element {
    const [activeTab, setActiveTab] = useState(() => readRememberedTab(type));
    const contentByTab: Record<InspectorTab, ReactNode> = { configure, data, help };

    function chooseTab(tab: InspectorTab): void {
        setActiveTab(tab);
        rememberTab(type, tab);
    }

    return (
        <Tabs
            label="Seções do inspector"
            value={activeTab}
            onValueChange={chooseTab}
            listClassName={STICKY_TAB_LIST_CLASSES}
            tabs={INSPECTOR_TABS.map((tab) => ({
                value: tab,
                label: INSPECTOR_TAB_LABELS[tab],
                content: contentByTab[tab],
            }))}
        />
    );
}

// The storage may be unavailable (private mode, blocked cookies); the tab then is just not remembered.
function readRememberedTab(type: DocumentedType): InspectorTab {
    try {
        const storedTab = localStorage.getItem(tabStorageKey(type));
        return INSPECTOR_TABS.find((tab) => tab === storedTab) ?? DEFAULT_TAB;
    } catch {
        return DEFAULT_TAB;
    }
}

function rememberTab(type: DocumentedType, tab: InspectorTab): void {
    try {
        localStorage.setItem(tabStorageKey(type), tab);
    } catch {
        // An unavailable storage only means the tab is not remembered.
    }
}

function tabStorageKey(type: DocumentedType): string {
    return `${TAB_STORAGE_KEY_PREFIX}${type}`;
}

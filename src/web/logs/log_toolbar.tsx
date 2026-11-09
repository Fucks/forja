import { ChevronDown, ChevronUp, Copy, Download, Search } from "lucide-react";
import type { JSX, KeyboardEvent, RefObject } from "react";

import { IconButton } from "@/web/components/ui/icon_button.js";
import { Input } from "@/web/components/ui/input.js";
import { Switch } from "@/web/components/ui/switch.js";
import type { MatchDirection } from "@/web/logs/log_search.js";
import type { LogSearch } from "@/web/logs/use_log_search.js";

export function LogToolbar({
    search,
    searchInputRef,
    onGoToMatch,
    isFollowing,
    onFollowChange,
    onCopyAll,
    onDownloadRaw,
}: {
    search: LogSearch;
    searchInputRef: RefObject<HTMLInputElement | null>;
    onGoToMatch: (direction: MatchDirection) => void;
    isFollowing: boolean;
    onFollowChange: (isFollowing: boolean) => void;
    onCopyAll: () => void;
    onDownloadRaw: (() => void) | undefined;
}): JSX.Element {
    const matchSummary = describeMatches(search);

    function goToMatchOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
        if (event.key !== "Enter") {
            return;
        }

        event.preventDefault();
        onGoToMatch(event.shiftKey ? "previous" : "next");
    }

    return (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 font-sans">
            <div className="relative w-64">
                <Search
                    aria-hidden
                    className="pointer-events-none absolute top-2 left-2 size-4 text-muted"
                />
                <Input
                    ref={searchInputRef}
                    type="search"
                    aria-label="Buscar nos logs"
                    placeholder="Buscar"
                    value={search.query}
                    onChange={(event) => search.changeQuery(event.target.value)}
                    onKeyDown={goToMatchOnEnter}
                    className="pl-8"
                />
            </div>
            {matchSummary && (
                <span aria-live="polite" className="text-xs text-muted">
                    {matchSummary}
                </span>
            )}
            <IconButton
                label="Ocorrência anterior"
                icon={ChevronUp}
                disabled={search.matchSeqs.length === 0}
                onClick={() => onGoToMatch("previous")}
            />
            <IconButton
                label="Próxima ocorrência"
                icon={ChevronDown}
                disabled={search.matchSeqs.length === 0}
                onClick={() => onGoToMatch("next")}
            />
            <div className="ml-auto flex items-center gap-2">
                <Switch label="Seguir o fim" checked={isFollowing} onChange={onFollowChange} />
                <IconButton label="Copiar tudo" icon={Copy} onClick={onCopyAll} />
                {onDownloadRaw && (
                    <IconButton label="Baixar log bruto" icon={Download} onClick={onDownloadRaw} />
                )}
            </div>
        </div>
    );
}

function describeMatches({ query, matchSeqs, selectedMatchSeq }: LogSearch): string | null {
    if (query.trim() === "") {
        return null;
    }

    const matchCount = matchSeqs.length;
    if (matchCount === 0) {
        return "Nenhuma ocorrência";
    }

    if (selectedMatchSeq !== null) {
        return `${matchSeqs.indexOf(selectedMatchSeq) + 1} de ${matchCount}`;
    }

    return matchCount === 1 ? "1 ocorrência" : `${matchCount} ocorrências`;
}

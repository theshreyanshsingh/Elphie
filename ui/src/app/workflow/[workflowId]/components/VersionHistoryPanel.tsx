"use client";

import { formatDistanceToNow } from "date-fns";
import { FileText, LoaderCircle, X } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface WorkflowVersion {
    id: number;
    version_number: number;
    status: string;
    created_at: string;
    published_at: string | null;
    workflow_json: { nodes?: unknown[]; edges?: unknown[]; viewport?: unknown };
    workflow_configurations: Record<string, unknown> | null;
    template_context_variables: Record<string, string> | null;
}

interface VersionHistoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    versions: WorkflowVersion[];
    loading: boolean;
    activeVersionId: number | null;
    onSelectVersion: (version: WorkflowVersion) => void;
    hasMore: boolean;
    loadingMore: boolean;
    onLoadMore: () => void;
}

const statusLabel: Record<string, string> = {
    draft: "Draft",
    published: "Published",
    archived: "Archived",
};

const statusColor: Record<string, string> = {
    draft: "border-yellow-500/40 bg-yellow-50 text-yellow-900",
    published: "border-green-500/40 bg-green-50 text-green-900",
    archived: "border-border bg-muted text-muted-foreground",
};

export const VersionHistoryPanel = ({
    isOpen,
    onClose,
    versions,
    loading,
    activeVersionId,
    onSelectVersion,
    hasMore,
    loadingMore,
    onLoadMore,
}: VersionHistoryPanelProps) => {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && isOpen) {
                onClose();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    return (
        <div
            className={cn(
                "fixed right-0 top-0 z-51 h-full w-80 transform border-l border-border bg-background shadow-lg transition-transform duration-300 ease-in-out",
                isOpen ? "translate-x-0" : "translate-x-full",
            )}
        >
            <div className="h-full overflow-y-auto p-4">
                <div className="mb-6 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">
                        Version History
                    </h2>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        type="button"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : versions.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                        No versions found.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {versions.map((version) => {
                            const isActive = version.id === activeVersionId;
                            const date = version.published_at || version.created_at;
                            return (
                                <button
                                    key={version.id}
                                    onClick={() => onSelectVersion(version)}
                                    type="button"
                                    className={cn(
                                        "w-full cursor-pointer rounded-md border p-2 text-left transition-colors",
                                        isActive
                                            ? "border-foreground/20 bg-muted"
                                            : "border-border bg-background hover:bg-accent",
                                    )}
                                >
                                    <div className="mb-1.5 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                            <span className="text-xs font-medium text-foreground">
                                                v{version.version_number}
                                            </span>
                                        </div>
                                        {version.status !== "archived" && (
                                            <span
                                                className={cn(
                                                    "rounded-md border px-2 py-0.5 text-xs",
                                                    statusColor[version.status] ?? "",
                                                )}
                                            >
                                                {statusLabel[version.status] ?? version.status}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {formatDistanceToNow(new Date(date), {
                                            addSuffix: true,
                                        })}
                                    </p>
                                </button>
                            );
                        })}
                        {hasMore && (
                            <Button
                                variant="ghost"
                                onClick={onLoadMore}
                                disabled={loadingMore}
                                className="w-full text-xs"
                                type="button"
                            >
                                {loadingMore ? (
                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                ) : (
                                    "Load more"
                                )}
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

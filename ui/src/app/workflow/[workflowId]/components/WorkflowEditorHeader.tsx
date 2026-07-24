"use client";

import { ReactFlowInstance } from "@xyflow/react";
import { AlertCircle, ArrowLeft, Bot, Clipboard, Copy, Download, Eye, History, LoaderCircle, Menu, MoreVertical, Pencil, Phone, Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
    duplicateWorkflowEndpointApiV1WorkflowWorkflowIdDuplicatePost,
    publishWorkflowApiV1WorkflowWorkflowIdPublishPost,
} from "@/client/sdk.gen";
import { WorkflowError } from "@/client/types.gen";
import { FlowEdge, FlowNode } from "@/components/flow/types";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface WorkflowEditorHeaderProps {
    workflowName: string;
    isDirty: boolean;
    workflowValidationErrors: WorkflowError[];
    rfInstance: React.RefObject<ReactFlowInstance<FlowNode, FlowEdge> | null>;
    workflowId: number;
    workflowUuid?: string;
    saveWorkflow: (updateWorkflowDefinition?: boolean) => Promise<void>;
    user: { id: string; email?: string };
    onPhoneCallClick: () => void;
    onTestAgentClick: () => void;
    onHistoryClick: () => void;
    activeVersionLabel?: string;
    isViewingHistoricalVersion: boolean;
    onBackToDraft: () => void;
    hasDraft: boolean;
    onPublished: () => void;
    renameWorkflow: (newName: string) => Promise<void>;
}

const iconButtonClass =
    "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

export const WorkflowEditorHeader = ({
    workflowName,
    isDirty,
    workflowValidationErrors,
    rfInstance,
    saveWorkflow,
    onPhoneCallClick,
    onTestAgentClick,
    onHistoryClick,
    activeVersionLabel,
    isViewingHistoricalVersion,
    onBackToDraft,
    hasDraft,
    onPublished,
    workflowId,
    workflowUuid,
    renameWorkflow,
}: WorkflowEditorHeaderProps) => {
    const router = useRouter();
    const { toggleSidebar } = useSidebar();
    const [savingWorkflow, setSavingWorkflow] = useState(false);
    const [duplicating, setDuplicating] = useState(false);
    const [publishing, setPublishing] = useState(false);
    type RenameState =
        | { kind: "display" }
        | { kind: "editing"; draft: string; error: string | null }
        | { kind: "saving"; draft: string };
    const [rename, setRename] = useState<RenameState>({ kind: "display" });
    const nameInputRef = useRef<HTMLInputElement>(null);
    const renameButtonRef = useRef<HTMLButtonElement>(null);

    const hasValidationErrors = workflowValidationErrors.length > 0;
    const isCallDisabled = isDirty || hasValidationErrors;

    const handleSave = async () => {
        setSavingWorkflow(true);
        await saveWorkflow();
        setSavingWorkflow(false);
    };

    const handlePublish = async () => {
        if (publishing) return;
        setPublishing(true);
        const promise = publishWorkflowApiV1WorkflowWorkflowIdPublishPost({
            path: { workflow_id: workflowId },
        });
        toast.promise(promise, {
            loading: "Publishing...",
            success: "Workflow published successfully",
            error: "Failed to publish workflow",
        });
        try {
            await promise;
            onPublished();
        } finally {
            setPublishing(false);
        }
    };

    const handleBack = () => {
        router.push("/workflow");
    };

    const handleDuplicate = async () => {
        if (duplicating) return;
        setDuplicating(true);
        const promise = duplicateWorkflowEndpointApiV1WorkflowWorkflowIdDuplicatePost({
            path: { workflow_id: workflowId },
        });
        toast.promise(promise, {
            loading: "Duplicating workflow...",
            success: "Workflow duplicated successfully",
            error: "Failed to duplicate workflow",
        });
        try {
            const { data } = await promise;
            if (data?.id) {
                router.push(`/workflow/${data.id}`);
            }
        } finally {
            setDuplicating(false);
        }
    };

    const handleDownloadWorkflow = () => {
        if (!rfInstance.current) return;

        const workflowDefinition = rfInstance.current.toObject();
        const exportData = {
            name: workflowName,
            workflow_definition: workflowDefinition,
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${workflowName}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleCopyAgentUuid = async () => {
        if (!workflowUuid) {
            toast.error("Agent UUID not available");
            return;
        }
        try {
            await navigator.clipboard.writeText(workflowUuid);
            toast.success("Agent UUID copied");
        } catch {
            toast.error("Failed to copy Agent UUID");
        }
    };

    const enterEditMode = () => {
        setRename({ kind: "editing", draft: workflowName, error: null });
        requestAnimationFrame(() => nameInputRef.current?.focus());
    };

    const exitEditMode = () => {
        setRename({ kind: "display" });
        requestAnimationFrame(() => renameButtonRef.current?.focus());
    };

    const attemptSave = async () => {
        if (rename.kind !== "editing") return;
        const trimmed = rename.draft.trim();
        if (trimmed.length === 0) {
            setRename({ ...rename, error: "Name cannot be empty" });
            return;
        }
        if (trimmed === workflowName) {
            exitEditMode();
            return;
        }
        setRename({ kind: "saving", draft: trimmed });
        try {
            await renameWorkflow(trimmed);
            exitEditMode();
        } catch {
            setRename({ kind: "editing", draft: trimmed, error: "Failed to rename workflow" });
        }
    };

    const handleRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            void attemptSave();
        } else if (event.key === "Escape") {
            event.preventDefault();
            exitEditMode();
        }
    };

    const handleRenameBlur = () => {
        if (rename.kind !== "editing") return;
        if (rename.draft.trim().length === 0) {
            exitEditMode();
            return;
        }
        void attemptSave();
    };

    return (
        <div className="flex h-auto w-full items-center justify-between border-b border-border bg-background px-4 py-2">
            <div className="mr-4 flex items-center gap-2">
                <button
                    onClick={toggleSidebar}
                    className={cn(iconButtonClass, "md:hidden")}
                    aria-label="Open menu"
                    type="button"
                >
                    <Menu className="h-4 w-4" />
                </button>
                <button
                    onClick={handleBack}
                    className={iconButtonClass}
                    type="button"
                    aria-label="Back to workflows"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-2">
                    {rename.kind !== "display" ? (
                        <div className="flex flex-col gap-1">
                            <Input
                                ref={nameInputRef}
                                value={rename.draft}
                                onChange={(e) => {
                                    if (rename.kind === "editing") {
                                        setRename({ ...rename, draft: e.target.value, error: null });
                                    }
                                }}
                                onKeyDown={handleRenameKeyDown}
                                onBlur={handleRenameBlur}
                                disabled={rename.kind === "saving"}
                                autoFocus
                                onFocus={(e) => e.currentTarget.select()}
                                aria-label="Workflow name"
                                aria-invalid={rename.kind === "editing" && rename.error !== null}
                                className="max-w-xs text-xs font-medium"
                            />
                            {rename.kind === "editing" && rename.error && (
                                <span className="text-xs text-destructive" role="alert">{rename.error}</span>
                            )}
                        </div>
                    ) : (
                        <>
                            <h1 className="max-w-[14rem] truncate text-xs font-semibold text-foreground md:max-w-md">
                                <span className="md:hidden">
                                    {workflowName.length > 8 ? `${workflowName.slice(0, 8)}…` : workflowName}
                                </span>
                                <span className="hidden md:inline">{workflowName}</span>
                            </h1>
                            {!isViewingHistoricalVersion && (
                                <button
                                    ref={renameButtonRef}
                                    type="button"
                                    onClick={enterEditMode}
                                    aria-label="Rename workflow"
                                    className={iconButtonClass}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
                {isViewingHistoricalVersion && (
                    <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground">
                        <Eye className="h-3.5 w-3.5" />
                        <span>Viewing {activeVersionLabel} — read only</span>
                    </div>
                )}

                {isViewingHistoricalVersion && (
                    <Button onClick={onBackToDraft} type="button">
                        Back to Draft
                    </Button>
                )}

                <button
                    onClick={onHistoryClick}
                    type="button"
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent"
                >
                    <History className="h-3.5 w-3.5 text-muted-foreground" />
                    {activeVersionLabel && !isViewingHistoricalVersion && (
                        <span className="text-muted-foreground">{activeVersionLabel}</span>
                    )}
                </button>

                {isDirty && !isViewingHistoricalVersion && (
                    <div className="flex items-center gap-1.5 rounded-md border border-yellow-500/40 bg-yellow-50 px-2 py-1 text-xs text-yellow-900">
                        <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                        <span>Unsaved changes</span>
                    </div>
                )}

                {hasValidationErrors && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
                            >
                                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
                                <AlertCircle className="h-3.5 w-3.5" />
                                <span>
                                    {workflowValidationErrors.length} {workflowValidationErrors.length === 1 ? "error" : "errors"}
                                </span>
                            </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-80 p-0">
                            <div className="border-b border-border px-3 py-2">
                                <h3 className="text-xs font-semibold text-foreground">Validation Errors</h3>
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                                {workflowValidationErrors.map((error, index) => (
                                    <div
                                        key={index}
                                        className="border-b border-border px-3 py-2 last:border-b-0"
                                    >
                                        <div className="flex items-start gap-2">
                                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                                            <div className="min-w-0 flex-1">
                                                {(error.kind === "node" || error.kind === "edge") && error.id && (
                                                    <p className="mb-1 text-xs text-muted-foreground">
                                                        {error.kind === "node" ? "Node" : "Edge"}: {error.id}
                                                        {error.field && <span> • {error.field}</span>}
                                                    </p>
                                                )}
                                                <p className="break-words text-xs text-foreground">
                                                    {error.message}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>
                )}

                {!isViewingHistoricalVersion && hasDraft && (
                    <Button
                        onClick={handlePublish}
                        disabled={isDirty || publishing || hasValidationErrors}
                        variant="outline"
                        type="button"
                    >
                        {publishing ? (
                            <>
                                <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
                                Publishing...
                            </>
                        ) : (
                            <>
                                <Rocket className="mr-1 h-3.5 w-3.5" />
                                Publish
                            </>
                        )}
                    </Button>
                )}

                {!isViewingHistoricalVersion && (
                    <Button
                        variant="outline"
                        disabled={isCallDisabled}
                        onClick={onPhoneCallClick}
                        type="button"
                    >
                        <Phone className="h-3.5 w-3.5" />
                        Phone Call
                    </Button>
                )}

                <Button variant="outline" onClick={onTestAgentClick} type="button">
                    <Bot className="h-3.5 w-3.5" />
                    Test Agent
                </Button>

                {!isViewingHistoricalVersion && (
                    <Button
                        onClick={handleSave}
                        disabled={!isDirty || savingWorkflow}
                        type="button"
                    >
                        {savingWorkflow ? (
                            <>
                                <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            "Save"
                        )}
                    </Button>
                )}

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" type="button">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            onClick={() => router.push(`/workflow/${workflowId}/runs`)}
                            className="cursor-pointer text-xs"
                        >
                            <History className="mr-2 h-3.5 w-3.5" />
                            View Runs
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={handleDuplicate}
                            disabled={duplicating}
                            className="cursor-pointer text-xs"
                        >
                            {duplicating ? (
                                <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Copy className="mr-2 h-3.5 w-3.5" />
                            )}
                            {duplicating ? "Duplicating..." : "Duplicate Workflow"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={handleDownloadWorkflow}
                            className="cursor-pointer text-xs"
                        >
                            <Download className="mr-2 h-3.5 w-3.5" />
                            Download Workflow
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={handleCopyAgentUuid}
                            disabled={!workflowUuid}
                            className="cursor-pointer text-xs"
                        >
                            <Clipboard className="mr-2 h-3.5 w-3.5" />
                            Copy Agent UUID
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
};

"use client";

import * as React from "react";
import { Loader2, MessageSquarePlus, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  generateArrangement,
  getArrangement,
  listArrangements,
  requestArrangementChanges,
  type ArrangementRecord,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const PENDING_STATUSES = new Set(["pending", "processing", "generating", "queued"]);
const MAX_POLL_ATTEMPTS = 40;
const POLL_INTERVAL_MS = 3000;

type ArrangementGenerationPanelProps = {
  eventId: number;
  eventTitle: string;
  layoutSummary?: string;
  autoGenerateOnMount?: boolean;
  onAutoGenerateHandled?: () => void;
  onBack: () => void;
};

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isArrangementReady(arrangement: ArrangementRecord) {
  const status = arrangement.status.toLowerCase();
  if (status === "failed" || status === "error") return true;
  if (arrangement.result_image_url) return true;
  return !PENDING_STATUSES.has(status);
}

export function ArrangementGenerationPanel({
  eventId,
  eventTitle,
  layoutSummary,
  autoGenerateOnMount = false,
  onAutoGenerateHandled,
  onBack,
}: ArrangementGenerationPanelProps) {
  const [history, setHistory] = React.useState<ArrangementRecord[]>([]);
  const [activeArrangement, setActiveArrangement] =
    React.useState<ArrangementRecord | null>(null);
  const [loadingHistory, setLoadingHistory] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [requestingChanges, setRequestingChanges] = React.useState(false);
  const [changesDialogOpen, setChangesDialogOpen] = React.useState(false);
  const [clientFeedback, setClientFeedback] = React.useState("");
  const [polling, setPolling] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fullscreenImageUrl, setFullscreenImageUrl] = React.useState<
    string | null
  >(null);
  const autoGenerateStartedRef = React.useRef(false);
  const autoGenerateOnMountRef = React.useRef(autoGenerateOnMount);
  autoGenerateOnMountRef.current = autoGenerateOnMount;
  const handleGenerateRef = React.useRef<() => Promise<void>>(async () => {});

  const loadHistory = React.useCallback(async () => {
    setLoadingHistory(true);
    setError(null);

    try {
      const data = await listArrangements(eventId);
      const sorted = [...data].sort((a, b) => b.version - a.version);
      setHistory(sorted);
      setActiveArrangement((current) => {
        if (autoGenerateOnMountRef.current) {
          return current;
        }
        return current ?? sorted[0] ?? null;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load arrangements.",
      );
    } finally {
      setLoadingHistory(false);
    }
  }, [eventId]);

  React.useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const pollArrangement = React.useCallback(
    async (arrangementId: number) => {
      setPolling(true);
      setError(null);

      try {
        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
          const latest = await getArrangement(eventId, arrangementId);
          setActiveArrangement(latest);
          setHistory((current) => {
            const exists = current.some((item) => item.id === latest.id);
            if (!exists) return [latest, ...current];
            return current.map((item) =>
              item.id === latest.id ? latest : item,
            );
          });

          if (isArrangementReady(latest)) {
            if (
              latest.status.toLowerCase() === "failed" ||
              latest.status.toLowerCase() === "error"
            ) {
              setError("Arrangement generation failed. Try again.");
            }
            return latest;
          }

          await sleep(POLL_INTERVAL_MS);
        }

        setError(
          "Generation is taking longer than expected. Refresh status to check again.",
        );
        return null;
      } catch (pollError) {
        setError(
          pollError instanceof Error
            ? pollError.message
            : "Failed to fetch arrangement status.",
        );
        return null;
      } finally {
        setPolling(false);
      }
    },
    [eventId],
  );

  const handleGenerate = React.useCallback(async () => {
    setGenerating(true);
    setError(null);

    try {
      const created = await generateArrangement(eventId);
      setActiveArrangement(created);
      await loadHistory();

      if (!isArrangementReady(created)) {
        await pollArrangement(created.id);
        await loadHistory();
      }
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Failed to start arrangement generation.",
      );
    } finally {
      setGenerating(false);
    }
  }, [eventId, loadHistory, pollArrangement]);

  handleGenerateRef.current = handleGenerate;

  React.useEffect(() => {
    if (loadingHistory || !autoGenerateOnMount) {
      return;
    }

    if (autoGenerateStartedRef.current) {
      return;
    }

    autoGenerateStartedRef.current = true;
    onAutoGenerateHandled?.();
    void handleGenerateRef.current();
  }, [autoGenerateOnMount, loadingHistory, onAutoGenerateHandled]);

  const handleRequestChanges = async () => {
    if (!activeArrangement) {
      setError("Generate an arrangement before requesting changes.");
      return;
    }

    const feedback = clientFeedback.trim();
    if (!feedback) {
      setError("Please describe the changes you want.");
      return;
    }

    setRequestingChanges(true);
    setError(null);

    try {
      const updated = await requestArrangementChanges(
        eventId,
        activeArrangement.id,
        { client_feedback: feedback },
      );

      setChangesDialogOpen(false);
      setClientFeedback("");
      setActiveArrangement(updated);
      await loadHistory();

      if (!isArrangementReady(updated)) {
        await pollArrangement(updated.id);
        await loadHistory();
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to request arrangement changes.",
      );
    } finally {
      setRequestingChanges(false);
    }
  };

  const isPending =
    activeArrangement != null &&
    PENDING_STATUSES.has(activeArrangement.status.toLowerCase()) &&
    !activeArrangement.result_image_url;

  const isWorking = generating || polling || isPending;
  const showResultImage = Boolean(activeArrangement?.result_image_url);
  const showLoadingState =
    isWorking || (autoGenerateOnMount && !showResultImage && !error);

  return (
    <main className="min-h-screen bg-[#f6f4ef] text-[#1f2520]">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b715f]">
              Step 4 · AI arrangement
            </p>
            <h1 className="mt-2 text-2xl font-semibold">Generate arrangement</h1>
            <p className="mt-2 text-sm text-[#596153]">
              {eventTitle}
              {layoutSummary ? ` · ${layoutSummary}` : ""}
            </p>
          </div>

          <Button type="button" variant="outline" onClick={onBack}>
            Back to layout
          </Button>
        </div>

        <div className="rounded-xl border border-[#d8d1c3] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Final arrangement</h2>
              <p className="text-xs text-[#6f756a]">
                AI-generated visual from your saved layout.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setChangesDialogOpen(true);
                }}
                disabled={
                  !activeArrangement ||
                  generating ||
                  polling ||
                  requestingChanges
                }
              >
                <MessageSquarePlus />
                Request changes
              </Button>
              <Button
                type="button"
                className="bg-[#315c4b] text-white hover:bg-[#25483b]"
                onClick={() => void handleGenerate()}
                disabled={isWorking || requestingChanges}
              >
                <Sparkles />
                Generate arrangement
              </Button>
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-lg border border-[#f1c0c0] bg-[#fff5f5] px-3 py-2 text-sm text-[#9b1c1c]">
              {error}
            </div>
          ) : null}

          {loadingHistory || showLoadingState ? (
            <div className="mt-4 flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[#cfc6b6] bg-[#fbfaf7] p-6 text-center">
              <Loader2 className="size-10 animate-spin text-[#315c4b]" />
              <p className="text-base font-semibold text-[#1f2520]">
                {loadingHistory
                  ? "Preparing your arrangement..."
                  : "Generating your arrangement..."}
              </p>
              {!loadingHistory ? (
                <p className="max-w-md text-sm leading-relaxed text-[#596153]">
                  Please keep this page open — your result will appear
                  here automatically.
                </p>
              ) : null}
              {activeArrangement && !loadingHistory ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <StatusBadge status={activeArrangement.status} />
                  <span className="rounded-md bg-[#eef3ea] px-2 py-1 text-xs font-medium text-[#45614c]">
                    Version {activeArrangement.version}
                  </span>
                </div>
              ) : null}
            </div>
          ) : showResultImage && activeArrangement?.result_image_url ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={activeArrangement.status} />
                <span className="rounded-md bg-[#eef3ea] px-2 py-1 text-xs font-medium text-[#45614c]">
                  Version {activeArrangement.version}
                </span>
                {activeArrangement.is_final ? (
                  <span className="rounded-md bg-[#edf4ff] px-2 py-1 text-xs font-medium text-[#2f4f7a]">
                    Final
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() =>
                  setFullscreenImageUrl(activeArrangement.result_image_url)
                }
                className="group block w-full overflow-hidden rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] p-2 text-left transition hover:border-[#315c4b] hover:shadow-sm"
                title="Click to view full screen"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeArrangement.result_image_url}
                  alt="Generated arrangement"
                  className="mx-auto max-h-[560px] w-full cursor-zoom-in rounded-md object-contain transition group-hover:opacity-95"
                />
                <p className="mt-2 text-center text-xs text-[#6f756a]">
                  Click image to open full screen
                </p>
              </button>
            </div>
          ) : activeArrangement ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={activeArrangement.status} />
                <span className="rounded-md bg-[#eef3ea] px-2 py-1 text-xs font-medium text-[#45614c]">
                  Version {activeArrangement.version}
                </span>
              </div>
              <div className="rounded-lg border border-dashed border-[#d1c8b9] bg-[#fbfaf7] px-3 py-8 text-center text-sm text-[#777d73]">
                No result image yet for this version. Try generating again.
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-[#d1c8b9] bg-[#fbfaf7] px-3 py-8 text-center text-sm text-[#777d73]">
              No arrangements yet. Click generate to create the first one.
            </div>
          )}
        </div>

        {history.length > 1 ? (
          <section className="rounded-xl border border-[#d8d1c3] bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Version history</h2>
            <div className="mt-3 space-y-2">
              {history.map((arrangement) => (
                <button
                  key={arrangement.id}
                  type="button"
                  onClick={() => {
                    setActiveArrangement(arrangement);
                    if (
                      PENDING_STATUSES.has(arrangement.status.toLowerCase()) &&
                      !arrangement.result_image_url
                    ) {
                      void pollArrangement(arrangement.id);
                    }
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition",
                    activeArrangement?.id === arrangement.id
                      ? "border-[#315c4b] bg-[#eef5ec]"
                      : "border-[#ddd6c7] bg-[#fbfaf7] hover:bg-[#f4f8ef]",
                  )}
                >
                  <span className="font-medium">Version {arrangement.version}</span>
                  <StatusBadge status={arrangement.status} />
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <RequestChangesDialog
        open={changesDialogOpen}
        feedback={clientFeedback}
        submitting={requestingChanges}
        onFeedbackChange={setClientFeedback}
        onClose={() => {
          if (requestingChanges) return;
          setChangesDialogOpen(false);
          setClientFeedback("");
        }}
        onSubmit={() => void handleRequestChanges()}
      />

      {fullscreenImageUrl ? (
        <FullscreenImageModal
          imageUrl={fullscreenImageUrl}
          onClose={() => setFullscreenImageUrl(null)}
        />
      ) : null}
    </main>
  );
}

function FullscreenImageModal({
  imageUrl,
  onClose,
}: {
  imageUrl: string;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f1410]/95 p-4">
      <button
        type="button"
        aria-label="Close full screen image"
        className="absolute inset-0"
        onClick={onClose}
      />
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="absolute right-4 top-4 z-10 border-white/20 bg-black/40 text-white hover:bg-black/60"
        onClick={onClose}
      >
        <X />
      </Button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="Generated arrangement full screen"
        className="relative z-[1] max-h-full max-w-full object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

function RequestChangesDialog({
  open,
  feedback,
  submitting,
  onFeedbackChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  feedback: string;
  submitting: boolean;
  onFeedbackChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose, submitting]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-[#1f2520]/45"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-[#d8d1c3] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b715f]">
              Request changes
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              Describe what to update
            </h2>
            <p className="mt-1 text-sm text-[#6f756a]">
              Your feedback is saved and a new arrangement version is generated.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            disabled={submitting}
          >
            <X />
          </Button>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#5c6659]">
            Client feedback
          </span>
          <textarea
            value={feedback}
            onChange={(event) => onFeedbackChange(event.target.value)}
            rows={5}
            placeholder="Move the mandap closer to center, add more chairs near the aisle..."
            className="w-full resize-y rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] px-3 py-2 text-sm outline-none focus:border-[#66835d] focus:ring-2 focus:ring-[#66835d]/20"
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#315c4b] text-white hover:bg-[#25483b]"
            onClick={onSubmit}
            disabled={submitting || !feedback.trim()}
          >
            {submitting ? (
              <>
                <Loader2 className="animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit feedback"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const styles =
    normalized === "completed" || normalized === "complete" || normalized === "success"
      ? "border-[#b7e0c2] bg-[#edf8f0] text-[#1f5a33]"
      : PENDING_STATUSES.has(normalized)
        ? "border-[#fde68a] bg-[#fffbeb] text-[#92400e]"
        : normalized === "failed" || normalized === "error"
          ? "border-[#f1c0c0] bg-[#fff5f5] text-[#9b1c1c]"
          : "border-[#ddd6c7] bg-[#fbfaf7] text-[#596153]";

  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
        styles,
      )}
    >
      {status}
    </span>
  );
}

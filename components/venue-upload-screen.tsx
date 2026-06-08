"use client";

import * as React from "react";
import { ArrowLeft, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  updateVenueMetadata,
  uploadVenue,
  type EventRecord,
  type VenueRecord,
} from "@/lib/api";
import { normalizeVenue } from "@/lib/event-restore";
import { getDraggedImageFile, isImageFile } from "@/lib/image-file";
import { useObjectUrl } from "@/lib/use-object-url";
import { cn } from "@/lib/utils";

type VenueUploadScreenProps = {
  event: EventRecord;
  existingVenue?: VenueRecord | null;
  onBack: () => void;
  onUploaded: (payload: {
    venue: VenueRecord;
    venueImageFile?: File;
  }) => void;
};

export function VenueUploadScreen({
  event,
  existingVenue,
  onBack,
  onUploaded,
}: VenueUploadScreenProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [venueImageFile, setVenueImageFile] = React.useState<File | null>(null);
  const [venueName, setVenueName] = React.useState("");
  const [lengthFt, setLengthFt] = React.useState("");
  const [widthFt, setWidthFt] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);

  const normalizedExistingVenue = existingVenue
    ? normalizeVenue(existingVenue)
    : null;
  const existingImageUrl =
    normalizedExistingVenue?.image_url ??
    normalizedExistingVenue?.venue_image_url ??
    null;

  const existingVenueId = existingVenue?.id ?? null;

  React.useEffect(() => {
    if (!existingVenue) return;

    setVenueName(existingVenue.name ?? "");
    setLengthFt(
      existingVenue.length_ft != null ? String(existingVenue.length_ft) : "",
    );
    setWidthFt(
      existingVenue.width_ft != null ? String(existingVenue.width_ft) : "",
    );
  }, [
    existingVenueId,
    existingVenue?.name,
    existingVenue?.length_ft,
    existingVenue?.width_ft,
  ]);

  const venueImageUrl = useObjectUrl(venueImageFile) ?? existingImageUrl;

  const parsedLength = lengthFt.trim() ? Number(lengthFt) : null;
  const parsedWidth = widthFt.trim() ? Number(widthFt) : null;
  const hasValidDimensions =
    (parsedLength == null ||
      (Number.isFinite(parsedLength) && parsedLength > 0)) &&
    (parsedWidth == null ||
      (Number.isFinite(parsedWidth) && parsedWidth > 0));

  const acceptFile = React.useCallback((file: File | null | undefined) => {
    if (!isImageFile(file)) {
      setError("Please choose an image file (PNG, JPG, WEBP, etc.).");
      return;
    }

    setVenueImageFile(file);
    setError(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleDragEnter = (dragEvent: React.DragEvent<HTMLDivElement>) => {
    dragEvent.preventDefault();
    dragEvent.stopPropagation();
    setDragActive(true);
  };

  const handleDragOver = (dragEvent: React.DragEvent<HTMLDivElement>) => {
    dragEvent.preventDefault();
    dragEvent.stopPropagation();
    dragEvent.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  };

  const handleDragLeave = (dragEvent: React.DragEvent<HTMLDivElement>) => {
    dragEvent.preventDefault();
    dragEvent.stopPropagation();

    const nextTarget = dragEvent.relatedTarget as Node | null;
    if (nextTarget && dragEvent.currentTarget.contains(nextTarget)) {
      return;
    }

    setDragActive(false);
  };

  const handleDrop = (dragEvent: React.DragEvent<HTMLDivElement>) => {
    dragEvent.preventDefault();
    dragEvent.stopPropagation();
    setDragActive(false);

    const file = getDraggedImageFile(dragEvent.dataTransfer);
    if (!file) {
      setError("Please drop a supported image file.");
      return;
    }

    acceptFile(file);
  };

  const handleContinueWithExisting = async () => {
    if (!normalizedExistingVenue) return;

    const parsedLength = lengthFt.trim() ? Number(lengthFt) : undefined;
    const parsedWidth = widthFt.trim() ? Number(widthFt) : undefined;

    if (
      parsedLength != null &&
      (!Number.isFinite(parsedLength) || parsedLength <= 0)
    ) {
      setError("Length must be a positive number.");
      return;
    }
    if (
      parsedWidth != null &&
      (!Number.isFinite(parsedWidth) || parsedWidth <= 0)
    ) {
      setError("Width must be a positive number.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const nextVenue: VenueRecord = {
      ...normalizedExistingVenue,
      name: venueName.trim() || normalizedExistingVenue.name,
      length_ft: parsedLength ?? normalizedExistingVenue.length_ft,
      width_ft: parsedWidth ?? normalizedExistingVenue.width_ft,
    };

    try {
      let savedVenue = nextVenue;

      try {
        savedVenue = normalizeVenue(
          await updateVenueMetadata(event.id, {
            name: nextVenue.name ?? undefined,
            length_ft: nextVenue.length_ft ?? undefined,
            width_ft: nextVenue.width_ft ?? undefined,
          }),
        );
      } catch {
        // Keep local edits when the API does not support metadata-only updates.
      }

      onUploaded({ venue: savedVenue });
    } catch (continueError) {
      setError(
        continueError instanceof Error
          ? continueError.message
          : "Failed to save venue details.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (eventForm: React.FormEvent) => {
    eventForm.preventDefault();
    if (!venueImageFile) {
      setError("Please upload a venue image.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const parsedLength = lengthFt.trim() ? Number(lengthFt) : undefined;
      const parsedWidth = widthFt.trim() ? Number(widthFt) : undefined;

      if (parsedLength != null && (!Number.isFinite(parsedLength) || parsedLength <= 0)) {
        throw new Error("Length must be a positive number.");
      }
      if (parsedWidth != null && (!Number.isFinite(parsedWidth) || parsedWidth <= 0)) {
        throw new Error("Width must be a positive number.");
      }

      const venue = await uploadVenue(event.id, {
        venue_image: venueImageFile,
        name: venueName.trim() || undefined,
        length_ft: parsedLength,
        width_ft: parsedWidth,
      });

      onUploaded({
        venue,
        venueImageFile,
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to upload venue.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f4ef] text-[#1f2520]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Button type="button" variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft />
              Back to events
            </Button>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#6b715f]">
              Step 1 · Venue upload
            </p>
            <h1 className="mt-2 text-2xl font-semibold">{event.title}</h1>
            <p className="mt-2 text-sm text-[#596153]">
              {normalizedExistingVenue
                ? "This event already has a venue on file. Continue with it or upload a new image."
                : (
                  <>
                    Upload a photo or floor plan for{" "}
                    <span className="font-medium">{event.client_name}</span>. Once saved,
                    the 2D layout planner will open.
                  </>
                )}
            </p>
          </div>
        </div>

        <form
          className="rounded-xl border border-[#d8d1c3] bg-white p-4 shadow-sm"
          onSubmit={handleSubmit}
          onDragOver={(dragEvent) => dragEvent.preventDefault()}
        >
          <div
            role="button"
            tabIndex={0}
            className={cn(
              "flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center outline-none transition",
              dragActive
                ? "border-[#315c4b] bg-[#eef5ec]"
                : venueImageUrl
                  ? "border-[#8ca17f] bg-[#f4f8ef]"
                  : "border-[#cfc6b6] bg-[#fbfaf7] hover:bg-[#f6f4ef]",
              "focus-visible:ring-2 focus-visible:ring-[#66835d]/20",
            )}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(keydownEvent) => {
              if (keydownEvent.key === "Enter" || keydownEvent.key === " ") {
                keydownEvent.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {venueImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={venueImageUrl}
                alt="Venue preview"
                className="pointer-events-none max-h-52 w-full rounded-lg object-contain"
                draggable={false}
              />
            ) : (
              <>
                <Upload className="size-8 text-[#8ca17f]" />
                <div className="text-sm font-semibold">Drag & drop venue image</div>
                <div className="text-sm text-[#6f756a]">or click to browse</div>
              </>
            )}
            <div className="pointer-events-none text-xs text-[#6f756a]">
              PNG, JPG, WEBP (recommended: clear top-down shot)
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(changeEvent) => acceptFile(changeEvent.target.files?.[0])}
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <FormField
              label="Venue name (optional)"
              value={venueName}
              onChange={setVenueName}
              placeholder="Grand ballroom"
            />
            <FormField
              label="Length (ft)"
              value={lengthFt}
              onChange={setLengthFt}
              placeholder="90"
              inputMode="numeric"
            />
            <FormField
              label="Width (ft)"
              value={widthFt}
              onChange={setWidthFt}
              placeholder="55"
              inputMode="numeric"
            />
          </div>

          {(() => {
            const isSmallVenue =
              (parsedLength != null && parsedLength < 16) ||
              (parsedWidth != null && parsedWidth < 16);

            if (!isSmallVenue) return null;

            return (
              <div className="mt-3 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-sm text-[#92400e]">
                A {parsedLength ?? "?"}×{parsedWidth ?? "?"} ft venue is too small
                for larger products like mandaps (16×16 ft) or sofas (14×6 ft).
                Use at least 20×20 ft, or 30×30 ft for full layouts.
              </div>
            );
          })()}

          {error ? (
            <div className="mt-3 rounded-lg border border-[#f1c0c0] bg-[#fff5f5] px-3 py-2 text-sm text-[#9b1c1c]">
              {error}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-[#6f756a]">
              {venueImageFile
                ? `Selected: ${venueImageFile.name}`
                : normalizedExistingVenue
                  ? "Using saved venue image."
                  : "Venue image is required."}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {normalizedExistingVenue && !venueImageFile ? (
                <Button
                  type="button"
                  className="bg-[#315c4b] text-white hover:bg-[#25483b]"
                  disabled={submitting || !hasValidDimensions}
                  onClick={() => void handleContinueWithExisting()}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save & continue"
                  )}
                </Button>
              ) : null}
              {normalizedExistingVenue && venueImageFile ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => {
                    setVenueImageFile(null);
                    setError(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                >
                  Keep existing image
                </Button>
              ) : null}
              <Button
                type="submit"
                className={
                  normalizedExistingVenue && !venueImageFile
                    ? undefined
                    : "bg-[#315c4b] text-white hover:bg-[#25483b]"
                }
                variant={
                  normalizedExistingVenue && !venueImageFile
                    ? "outline"
                    : "default"
                }
                disabled={
                  submitting ||
                  !venueImageFile ||
                  !hasValidDimensions
                }
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Uploading...
                  </>
                ) : normalizedExistingVenue ? (
                  "Upload new venue"
                ) : (
                  "Upload & continue"
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[#5c6659]">{label}</span>
      <input
        type="text"
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] px-3 text-sm font-medium outline-none focus:border-[#66835d] focus:ring-2 focus:ring-[#66835d]/20"
      />
    </label>
  );
}

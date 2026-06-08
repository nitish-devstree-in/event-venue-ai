"use client";

import * as React from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  createEventDetails,
  updateEvent,
  updateEventDetails,
  type EventDetailsPayload,
  type EventDetailsRecord,
  type EventRecord,
} from "@/lib/api";

type EventDetailsScreenProps = {
  event: EventRecord;
  initialDetails?: EventDetailsRecord | null;
  onBack: () => void;
  onSaved: (event: EventRecord, details: EventDetailsRecord | null) => void;
  onContinue: () => void;
};

type EventFormState = {
  title: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  status: string;
};

type PreferencesFormState = {
  theme: string;
  color_palette: string;
  lighting_type: string;
  lighting_notes: string;
  guest_count: string;
  extra_notes: string;
};

const LIGHTING_OPTIONS = [
  { value: "warm", label: "Warm" },
  { value: "neutral", label: "Neutral" },
  { value: "cool", label: "Cool" },
  { value: "mixed", label: "Mixed" },
  { value: "custom", label: "Custom" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];

export function EventDetailsScreen({
  event,
  initialDetails,
  onBack,
  onSaved,
  onContinue,
}: EventDetailsScreenProps) {
  const [eventForm, setEventForm] = React.useState<EventFormState>({
    title: event.title,
    client_name: event.client_name,
    client_email: event.client_email,
    client_phone: event.client_phone,
    status: event.status,
  });
  const [preferences, setPreferences] = React.useState<PreferencesFormState>({
    theme: "",
    color_palette: "",
    lighting_type: "warm",
    lighting_notes: "",
    guest_count: "150",
    extra_notes: "",
  });
  const [hasExistingDetails, setHasExistingDetails] = React.useState(
    initialDetails != null,
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setEventForm({
      title: event.title,
      client_name: event.client_name,
      client_email: event.client_email,
      client_phone: event.client_phone,
      status: event.status,
    });
  }, [event]);

  React.useEffect(() => {
    if (!initialDetails) return;

    setPreferences({
      theme: initialDetails.theme ?? "",
      color_palette: initialDetails.color_palette ?? "",
      lighting_type: initialDetails.lighting_type ?? "warm",
      lighting_notes: initialDetails.lighting_notes ?? "",
      guest_count:
        initialDetails.guest_count != null
          ? String(initialDetails.guest_count)
          : "150",
      extra_notes: initialDetails.extra_notes ?? "",
    });
    setHasExistingDetails(true);
  }, [initialDetails]);

  const updateEventField = <K extends keyof EventFormState>(
    key: K,
    value: EventFormState[K],
  ) => {
    setEventForm((current) => ({ ...current, [key]: value }));
  };

  const updatePreference = <K extends keyof PreferencesFormState>(
    key: K,
    value: PreferencesFormState[K],
  ) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const buildDetailsPayload = (): EventDetailsPayload => {
    const guestCount = Number(preferences.guest_count);
    return {
      theme: preferences.theme.trim(),
      color_palette: preferences.color_palette.trim(),
      lighting_type: preferences.lighting_type,
      lighting_notes: preferences.lighting_notes.trim(),
      guest_count: Number.isFinite(guestCount) ? guestCount : 0,
      extra_notes: preferences.extra_notes.trim(),
    };
  };

  const savePreferences = async (detailsPayload: EventDetailsPayload) => {
    if (hasExistingDetails) {
      await updateEventDetails(event.id, detailsPayload);
      return;
    }

    try {
      await createEventDetails(event.id, detailsPayload);
    } catch {
      await updateEventDetails(event.id, detailsPayload);
    }

    setHasExistingDetails(true);
  };

  const handleSave = async (continueAfterSave = false) => {
    setSubmitting(true);
    setError(null);

    try {
      const updatedEvent = await updateEvent(event.id, {
        title: eventForm.title.trim(),
        client_name: eventForm.client_name.trim(),
        client_email: eventForm.client_email.trim(),
        client_phone: eventForm.client_phone.trim(),
        status: eventForm.status,
      });

      await savePreferences(buildDetailsPayload());

      onSaved(
        updatedEvent,
        buildSavedDetails(event.id, initialDetails, buildDetailsPayload()),
      );

      if (continueAfterSave) {
        onContinue();
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save event details.",
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
              Back
            </Button>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#6b715f]">
              Step 3 · Event details
            </p>
            <h1 className="mt-2 text-2xl font-semibold">Event details</h1>
            <p className="mt-2 text-sm text-[#596153]">
              Update client info and save theme, lighting, and preferences before
              planning the layout.
            </p>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            void handleSave(true);
          }}
        >
            <section className="rounded-xl border border-[#d8d1c3] bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold">Event information</h2>
              <p className="mt-1 text-xs text-[#6f756a]">
                Edit the event and client contact details.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <FormField
                  label="Event title"
                  value={eventForm.title}
                  onChange={(value) => updateEventField("title", value)}
                  required
                />
                <SelectField
                  label="Status"
                  value={eventForm.status}
                  options={STATUS_OPTIONS}
                  onChange={(value) => updateEventField("status", value)}
                />
                <FormField
                  label="Client name"
                  value={eventForm.client_name}
                  onChange={(value) => updateEventField("client_name", value)}
                  required
                />
                <FormField
                  label="Client email"
                  type="email"
                  value={eventForm.client_email}
                  onChange={(value) => updateEventField("client_email", value)}
                  required
                />
                <FormField
                  label="Client phone"
                  type="tel"
                  value={eventForm.client_phone}
                  onChange={(value) => updateEventField("client_phone", value)}
                  required
                />
              </div>
            </section>

            <section className="rounded-xl border border-[#d8d1c3] bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold">Theme & preferences</h2>
              <p className="mt-1 text-xs text-[#6f756a]">
                Save lighting, colors, and guest preferences for this event.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <FormField
                  label="Theme"
                  value={preferences.theme}
                  onChange={(value) => updatePreference("theme", value)}
                  placeholder="Garden wedding, royal reception..."
                />
                <FormField
                  label="Color palette"
                  value={preferences.color_palette}
                  onChange={(value) => updatePreference("color_palette", value)}
                  placeholder="Blush pink, ivory, gold"
                />
                <SelectField
                  label="Lighting type"
                  value={preferences.lighting_type}
                  options={LIGHTING_OPTIONS}
                  onChange={(value) => updatePreference("lighting_type", value)}
                />
                <FormField
                  label="Guest count"
                  type="number"
                  value={preferences.guest_count}
                  onChange={(value) => updatePreference("guest_count", value)}
                  min={1}
                />
              </div>

              <div className="mt-3 grid gap-3">
                <TextAreaField
                  label="Lighting notes"
                  value={preferences.lighting_notes}
                  onChange={(value) => updatePreference("lighting_notes", value)}
                />
                <TextAreaField
                  label="Extra notes"
                  value={preferences.extra_notes}
                  onChange={(value) => updatePreference("extra_notes", value)}
                />
              </div>
            </section>

            {error ? (
              <div className="rounded-lg border border-[#f1c0c0] bg-[#fff5f5] px-3 py-2 text-sm text-[#9b1c1c]">
                {error}
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => void handleSave(false)}
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save details"
                )}
              </Button>
              <Button
                type="submit"
                className="bg-[#315c4b] text-white hover:bg-[#25483b]"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save & continue to layout"
                )}
              </Button>
            </div>
          </form>
      </div>
    </main>
  );
}

function buildSavedDetails(
  eventId: number,
  initialDetails: EventDetailsRecord | null | undefined,
  payload: EventDetailsPayload,
): EventDetailsRecord {
  return {
    id: initialDetails?.id,
    event_id: initialDetails?.event_id ?? eventId,
    theme: payload.theme ?? null,
    color_palette: payload.color_palette ?? null,
    lighting_type: payload.lighting_type ?? null,
    lighting_notes: payload.lighting_notes ?? null,
    guest_count: payload.guest_count ?? null,
    extra_notes: payload.extra_notes ?? null,
    created_at: initialDetails?.created_at,
    updated_at: initialDetails?.updated_at,
  };
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: number;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[#5c6659]">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        min={min}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] px-3 text-sm font-medium outline-none focus:border-[#66835d] focus:ring-2 focus:ring-[#66835d]/20"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[#5c6659]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] px-3 text-sm font-medium outline-none focus:border-[#66835d] focus:ring-2 focus:ring-[#66835d]/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[#5c6659]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full resize-y rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] px-3 py-2 text-sm font-medium outline-none focus:border-[#66835d] focus:ring-2 focus:ring-[#66835d]/20"
      />
    </label>
  );
}

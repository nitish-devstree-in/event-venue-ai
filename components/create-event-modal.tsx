"use client";

import * as React from "react";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  createEvent,
  updateEvent,
  type CreateEventPayload,
  type EventRecord,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type EventFormModalProps = {
  open: boolean;
  onClose: () => void;
  event?: EventRecord | null;
  onSaved: (event: EventRecord) => void;
};

const emptyForm: CreateEventPayload = {
  title: "",
  client_name: "",
  client_email: "",
  client_phone: "",
};

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];

export function CreateEventModal({
  open,
  onClose,
  event,
  onSaved,
}: EventFormModalProps) {
  const isEdit = event != null;
  const [form, setForm] = React.useState<CreateEventPayload>(emptyForm);
  const [status, setStatus] = React.useState("draft");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;

    if (event) {
      setForm({
        title: event.title,
        client_name: event.client_name,
        client_email: event.client_email,
        client_phone: event.client_phone,
      });
      setStatus(event.status);
    } else {
      setForm(emptyForm);
      setStatus("draft");
    }

    setError(null);
    setSubmitting(false);
  }, [open, event]);

  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (keydownEvent: KeyboardEvent) => {
      if (keydownEvent.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const updateField = <K extends keyof CreateEventPayload>(
    key: K,
    value: CreateEventPayload[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const payload = {
        title: form.title.trim(),
        client_name: form.client_name.trim(),
        client_email: form.client_email.trim(),
        client_phone: form.client_phone.trim(),
      };

      const saved = isEdit
        ? await updateEvent(event.id, { ...payload, status })
        : await createEvent(payload);

      onSaved(saved);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : `Failed to ${isEdit ? "update" : "create"} event.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-[#1f2520]/45 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-form-title"
        className="relative z-10 w-full max-w-lg rounded-xl border border-[#d8d1c3] bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b715f]">
              {isEdit ? "Edit event" : "New event"}
            </p>
            <h2 id="event-form-title" className="mt-1 text-xl font-semibold">
              {isEdit ? "Update event" : "Create event"}
            </h2>
            <p className="mt-1 text-sm text-[#596153]">
              {isEdit
                ? "Update client and event information."
                : "Add client details before uploading the venue."}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </Button>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <FormField
            label="Event title"
            value={form.title}
            onChange={(value) => updateField("title", value)}
            placeholder="Summer wedding reception"
            required
          />
          <FormField
            label="Client name"
            value={form.client_name}
            onChange={(value) => updateField("client_name", value)}
            placeholder="Jane Doe"
            required
          />
          <FormField
            label="Client email"
            type="email"
            value={form.client_email}
            onChange={(value) => updateField("client_email", value)}
            placeholder="jane@example.com"
            required
          />
          <FormField
            label="Client phone"
            type="tel"
            value={form.client_phone}
            onChange={(value) => updateField("client_phone", value)}
            placeholder="+1 555 0100"
            required
          />

          {isEdit ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#5c6659]">Status</span>
              <select
                value={status}
                onChange={(selectEvent) => setStatus(selectEvent.target.value)}
                className="h-9 w-full rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] px-3 text-sm font-medium outline-none focus:border-[#66835d] focus:ring-2 focus:ring-[#66835d]/20"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-[#f1c0c0] bg-[#fff5f5] px-3 py-2 text-sm text-[#9b1c1c]">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-[#315c4b] text-white hover:bg-[#25483b]"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  {isEdit ? "Saving..." : "Creating..."}
                </>
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Create event"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[#5c6659]">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-9 w-full rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] px-3 text-sm font-medium outline-none",
          "focus:border-[#66835d] focus:ring-2 focus:ring-[#66835d]/20",
        )}
      />
    </label>
  );
}

"use client";

import * as React from "react";
import {
  CalendarDays,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  User,
} from "lucide-react";

import { CreateEventModal } from "@/components/create-event-modal";
import { Button } from "@/components/ui/button";
import { listEvents, type EventRecord } from "@/lib/api";
import { cn } from "@/lib/utils";

type EventsListProps = {
  onSelectEvent: (event: EventRecord) => void;
};

export function EventsList({ onSelectEvent }: EventsListProps) {
  const [events, setEvents] = React.useState<EventRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingEvent, setEditingEvent] = React.useState<EventRecord | null>(
    null,
  );

  const loadEvents = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listEvents();
      setEvents(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load events.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const handleSaved = (event: EventRecord) => {
    setEvents((current) => {
      const exists = current.some((item) => item.id === event.id);
      if (exists) {
        return current.map((item) => (item.id === event.id ? event : item));
      }
      return [event, ...current];
    });

    if (!editingEvent) {
      onSelectEvent(event);
    }
  };

  return (
    <>
      <main className="min-h-screen bg-[#f6f4ef] text-[#1f2520]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b715f]">
                Event planner
              </p>
              <h1 className="mt-2 text-3xl font-semibold">Your events</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#596153]">
                Create an event, upload a venue, add details, then design the layout.
              </p>
            </div>

            <Button
              type="button"
              className="bg-[#315c4b] text-white hover:bg-[#25483b]"
              onClick={() => setModalOpen(true)}
            >
              <Plus />
              New event
            </Button>
          </div>

          {error ? (
            <div className="rounded-lg border border-[#f1c0c0] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b1c1c]">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="flex min-h-48 items-center justify-center rounded-xl border border-[#d8d1c3] bg-white">
              <div className="flex items-center gap-2 text-sm text-[#596153]">
                <Loader2 className="size-4 animate-spin" />
                Loading events...
              </div>
            </div>
          ) : events.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#cfc6b6] bg-white p-8 text-center">
              <p className="text-sm font-semibold">No events yet</p>
              <p className="max-w-sm text-sm text-[#6f756a]">
                Create your first event to start uploading a venue and planning the
                layout.
              </p>
              <Button
                type="button"
                className="bg-[#315c4b] text-white hover:bg-[#25483b]"
                onClick={() => setModalOpen(true)}
              >
                <Plus />
                Create event
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onSelect={() => onSelectEvent(event)}
                  onEdit={() => setEditingEvent(event)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <CreateEventModal
        open={modalOpen || editingEvent != null}
        event={editingEvent}
        onClose={() => {
          setModalOpen(false);
          setEditingEvent(null);
        }}
        onSaved={handleSaved}
      />
    </>
  );
}

function EventCard({
  event,
  onSelect,
  onEdit,
}: {
  event: EventRecord;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const createdDate = formatDate(event.created_at);

  return (
    <div className="group flex h-full flex-col rounded-xl border border-[#d8d1c3] bg-white p-4 shadow-sm transition hover:border-[#8ca17f] hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 text-left"
        >
          <h2 className="truncate text-lg font-semibold group-hover:text-[#315c4b]">
            {event.title}
          </h2>
          <p className="mt-1 text-xs text-[#6f756a]">Event #{event.id}</p>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          <StatusBadge status={event.status} />
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              onEdit();
            }}
            title={`Edit ${event.title}`}
          >
            <Pencil />
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={onSelect}
        className="mt-4 flex flex-1 flex-col text-left"
      >
        <div className="space-y-2 text-sm text-[#4e594c]">
          <InfoRow icon={User} label={event.client_name} />
          <InfoRow icon={Mail} label={event.client_email} />
          <InfoRow icon={Phone} label={event.client_phone} />
        </div>

        <div className="mt-auto flex items-center gap-2 pt-4 text-xs text-[#6f756a]">
          <CalendarDays className="size-3.5 shrink-0" />
          <span suppressHydrationWarning>Created {createdDate}</span>
        </div>
      </button>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="size-3.5 shrink-0 text-[#8ca17f]" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const styles =
    normalized === "draft"
      ? "border-[#ddd6c7] bg-[#fbfaf7] text-[#596153]"
      : normalized === "completed"
        ? "border-[#b7e0c2] bg-[#edf8f0] text-[#1f5a33]"
        : "border-[#cfe0f5] bg-[#edf4ff] text-[#2f4f7a]";

  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
        styles,
      )}
    >
      {status}
    </span>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

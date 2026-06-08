"use client";

import * as React from "react";

import { ArrangementGenerationPanel } from "@/components/arrangement-generation-panel";
import type { EventLayoutPlannerPlan } from "@/components/event-layout-planner";
import { EventLayoutPlanner } from "@/components/event-layout-planner";
import { EventsList } from "@/components/events-list";
import { EventDetailsScreen } from "@/components/event-details-screen";
import { VenueUploadScreen } from "@/components/venue-upload-screen";
import { Button } from "@/components/ui/button";
import {
  getEvent,
  type EventDetailsRecord,
  type EventRecord,
  type VenueRecord,
} from "@/lib/api";
import {
  applyFullEventState,
  normalizeVenue,
  resolveEventPlan,
} from "@/lib/event-restore";
import {
  clearAppSession,
  loadAppSession,
  saveAppSession,
  type AppStep,
} from "@/lib/app-session";
import { isImageFile } from "@/lib/image-file";
import { useObjectUrl } from "@/lib/use-object-url";

type VenueSession = {
  venue: VenueRecord;
  venueImageFile?: File;
};

function AppBootShell({ message = "Loading..." }: { message?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f4ef] text-[#596153]">
      <p className="text-sm font-medium">{message}</p>
    </main>
  );
}

export default function Home() {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isBooted, setIsBooted] = React.useState(false);
  const [step, setStep] = React.useState<AppStep>("events");
  const [selectedEvent, setSelectedEvent] = React.useState<EventRecord | null>(
    null,
  );
  const [eventDetails, setEventDetails] =
    React.useState<EventDetailsRecord | null>(null);
  const [loadingEventId, setLoadingEventId] = React.useState<number | null>(
    null,
  );
  const [venueSession, setVenueSession] = React.useState<VenueSession | null>(
    null,
  );
  const [plan, setPlan] = React.useState<EventLayoutPlannerPlan | null>(null);
  const [restoredPlanObjects, setRestoredPlanObjects] = React.useState<
    EventLayoutPlannerPlan["objects"] | undefined
  >(undefined);
  const [autoGenerateArrangement, setAutoGenerateArrangement] =
    React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function boot() {
      const saved = loadAppSession();

      if (saved) {
        try {
          const fullEvent = await getEvent(saved.eventId);
          const restored = applyFullEventState(fullEvent);
          const resolvedPlan = resolveEventPlan(fullEvent, saved.plan);

          if (!cancelled) {
            setSelectedEvent(restored.event);
            setEventDetails(restored.eventDetails);
            setVenueSession(restored.venueSession);
            setPlan(resolvedPlan);
            setRestoredPlanObjects(resolvedPlan?.objects);
            setStep(saved.step === "events" ? "venue" : saved.step);
          }
        } catch {
          if (!cancelled) clearAppSession();
        }
      }

      if (!cancelled) setIsBooted(true);
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!isBooted) return;

    if (!selectedEvent || step === "events") {
      clearAppSession();
      return;
    }

    saveAppSession({
      step,
      eventId: selectedEvent.id,
      venue: venueSession?.venue ?? null,
      plan,
    });
  }, [isBooted, plan, selectedEvent, step, venueSession?.venue]);

  const localVenueImageUrl = useObjectUrl(venueSession?.venueImageFile);

  const resetToEvents = () => {
    setStep("events");
    setSelectedEvent(null);
    setEventDetails(null);
    setVenueSession(null);
    setPlan(null);
    setRestoredPlanObjects(undefined);
    clearAppSession();
  };

  const refreshEventLayout = async (eventId: number, preferSessionPlan = false) => {
    const fullEvent = await getEvent(eventId);
    const restored = applyFullEventState(fullEvent);
    const resolvedPlan = preferSessionPlan
      ? resolveEventPlan(fullEvent, plan)
      : restored.plan;

    setSelectedEvent(restored.event);
    setEventDetails(restored.eventDetails);
    setVenueSession(restored.venueSession);
    setPlan(resolvedPlan);
    setRestoredPlanObjects(resolvedPlan?.objects);

    return { fullEvent, restored, resolvedPlan };
  };

  const selectEvent = async (event: EventRecord) => {
    setLoadingEventId(event.id);

    try {
      const fullEvent = await getEvent(event.id);
      const restored = applyFullEventState(fullEvent);

      setSelectedEvent(restored.event);
      setEventDetails(restored.eventDetails);
      setVenueSession(restored.venueSession);
      setPlan(restored.plan);
      setRestoredPlanObjects(restored.plan?.objects);
      setStep(restored.step);
    } catch {
      setSelectedEvent(event);
      setEventDetails(null);
      setVenueSession(null);
      setPlan(null);
      setRestoredPlanObjects(undefined);
      setStep("venue");
    } finally {
      setLoadingEventId(null);
    }
  };

  const handleVenueUploaded = (payload: VenueSession) => {
    setVenueSession(payload);

    if (payload.venueImageFile) {
      setPlan(null);
      setRestoredPlanObjects(undefined);
    } else {
      const lengthFt = payload.venue.length_ft;
      const widthFt = payload.venue.width_ft;

      setPlan((current) =>
        current && lengthFt != null && widthFt != null
          ? {
              ...current,
              venue: {
                lengthFt,
                widthFt,
                areaSqFt: lengthFt * widthFt,
              },
            }
          : current,
      );
    }

    setStep("details");
  };

  const handleLayoutSaved = async (updatedVenue: VenueRecord) => {
    setVenueSession((current) =>
      current
        ? {
            ...current,
            venue: normalizeVenue({
              ...current.venue,
              ...updatedVenue,
              layout_2d_url:
                updatedVenue.layout_2d_url ?? current.venue.layout_2d_url,
            }),
          }
        : current,
    );

    if (!selectedEvent) return;

    const { resolvedPlan } = await refreshEventLayout(selectedEvent.id);
    setPlan(resolvedPlan);
    setRestoredPlanObjects(resolvedPlan?.objects);
    setAutoGenerateArrangement(true);
    setStep("generate");
  };

  const handleBackToLayout = async () => {
    if (!selectedEvent) {
      setStep("layout");
      return;
    }

    try {
      await refreshEventLayout(selectedEvent.id, true);
    } catch {
      // Keep the in-memory plan if the refresh fails.
    }

    setStep("layout");
  };

  const acceptReplacementFile = (file: File | null | undefined) => {
    if (!isImageFile(file) || !venueSession) return;

    setVenueSession((current) =>
      current ? { ...current, venueImageFile: file } : current,
    );

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (!isBooted) {
    return <AppBootShell />;
  }

  if (loadingEventId != null) {
    return <AppBootShell message="Loading event details..." />;
  }

  if (step === "events") {
    return <EventsList onSelectEvent={(event) => void selectEvent(event)} />;
  }

  if (step === "venue" && selectedEvent) {
    return (
      <VenueUploadScreen
        event={selectedEvent}
        existingVenue={
          venueSession ? normalizeVenue(venueSession.venue) : null
        }
        onBack={resetToEvents}
        onUploaded={handleVenueUploaded}
      />
    );
  }

  if (step === "details" && selectedEvent) {
    return (
      <EventDetailsScreen
        event={selectedEvent}
        initialDetails={eventDetails}
        onBack={() => setStep("venue")}
        onSaved={(updatedEvent, savedDetails) => {
          setSelectedEvent(updatedEvent);
          setEventDetails(savedDetails);
        }}
        onContinue={() => setStep("layout")}
      />
    );
  }

  if (step === "generate" && selectedEvent) {
    return (
      <ArrangementGenerationPanel
        eventId={selectedEvent.id}
        eventTitle={selectedEvent.title}
        layoutSummary={
          plan
            ? `${plan.objects.length} objects, ${plan.venue.areaSqFt} sq ft`
            : undefined
        }
        autoGenerateOnMount={autoGenerateArrangement}
        onAutoGenerateHandled={() => setAutoGenerateArrangement(false)}
        onBack={() => void handleBackToLayout()}
      />
    );
  }

  if (!selectedEvent || !venueSession) {
    return <EventsList onSelectEvent={(event) => void selectEvent(event)} />;
  }

  const venue = normalizeVenue(venueSession.venue);
  const initialVenueLength = venue.length_ft ?? plan?.venue.lengthFt ?? 90;
  const initialVenueWidth = venue.width_ft ?? plan?.venue.widthFt ?? 55;
  const displayVenueLength = venue.length_ft ?? plan?.venue.lengthFt ?? initialVenueLength;
  const displayVenueWidth = venue.width_ft ?? plan?.venue.widthFt ?? initialVenueWidth;
  const venueImageUrl =
    localVenueImageUrl ?? venue.image_url ?? venue.venue_image_url ?? null;

  return (
    <main className="flex min-h-screen flex-col bg-[#f6f4ef] text-[#1f2520]">
      <div className="mx-auto w-full max-w-[1540px] shrink-0 px-4 pt-4">
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-[#d8d1c3] bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={resetToEvents}>
                All events
              </Button>
              <span className="rounded-md bg-[#eef3ea] px-2 py-1 text-xs font-medium text-[#45614c]">
                {selectedEvent.title}
              </span>
            </div>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#6b715f]">
              Venue image selected
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
              {venueImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={venueImageUrl}
                  alt="Selected venue"
                  className="h-16 w-28 shrink-0 rounded-md border border-[#d8d1c3] object-cover"
                />
              ) : null}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {venueSession.venue.name ??
                    venueSession.venueImageFile?.name ??
                    "Venue"}
                </div>
                <div className="text-xs text-[#6f756a]">
                  {displayVenueLength && displayVenueWidth
                    ? `${displayVenueLength} × ${displayVenueWidth} ft`
                    : "You can change the image anytime."}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Change image
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("details")}
            >
              Event details
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("venue")}
            >
              Re-upload venue
            </Button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => acceptReplacementFile(event.target.files?.[0])}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <EventLayoutPlanner
          key={`${selectedEvent.id}-${venueSession.venue.id}`}
          eventId={selectedEvent.id}
          initialVenueLength={initialVenueLength}
          initialVenueWidth={initialVenueWidth}
          initialPlanObjects={
            plan?.objects?.length ? plan.objects : restoredPlanObjects
          }
          onPlanChange={setPlan}
          onContinue={(updatedVenue) => void handleLayoutSaved(updatedVenue)}
        />
      </div>
    </main>
  );
}

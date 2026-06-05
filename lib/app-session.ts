import type { EventLayoutPlannerPlan } from "@/components/event-layout-planner";
import type { VenueRecord } from "@/lib/api";

export type AppStep = "events" | "venue" | "details" | "layout" | "generate";

export type PersistedAppSession = {
  step: AppStep;
  eventId: number;
  venue?: VenueRecord | null;
  plan?: EventLayoutPlannerPlan | null;
};

const STORAGE_KEY = "event-planner-session";

export function loadAppSession(): PersistedAppSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PersistedAppSession;
    if (!parsed?.eventId || !parsed?.step) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function saveAppSession(session: PersistedAppSession) {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearAppSession() {
  if (typeof window === "undefined") return;

  window.sessionStorage.removeItem(STORAGE_KEY);
}

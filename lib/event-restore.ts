import type { EventLayoutPlannerPlan } from "@/components/event-layout-planner";
import type {
  EventDetailsRecord,
  EventProductRecord,
  FullEventRecord,
  VenueRecord,
} from "@/lib/api";
import {
  getCatalogDimensions,
  type PlannerObjectKind,
} from "@/lib/product-master-planner";

export function normalizeVenue(venue: VenueRecord): VenueRecord {
  return {
    ...venue,
    image_url: venue.venue_image_url ?? venue.image_url ?? null,
  };
}

function parsePlacementHints(
  hint: string | null,
): Array<{ x: number; y: number }> {
  if (!hint?.trim()) return [];

  return hint
    .split(";")
    .map((segment) => segment.trim())
    .flatMap((segment) => {
      const match = segment.match(/x:\s*([\d.]+),\s*y:\s*([\d.]+)\s*ft/i);
      if (!match) return [];

      return [
        {
          x: Number.parseFloat(match[1]),
          y: Number.parseFloat(match[2]),
        },
      ];
    })
    .filter(
      (placement) =>
        Number.isFinite(placement.x) && Number.isFinite(placement.y),
    );
}

function parseCanvasDimensions(
  notes: string | null,
): { width: number; height: number } | null {
  if (!notes) return null;

  const match = notes.match(/([\d.]+)\s*x\s*([\d.]+)\s*ft on canvas/i);
  if (!match) return null;

  const width = Number.parseFloat(match[1]);
  const height = Number.parseFloat(match[2]);

  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

  return { width, height };
}

export function buildPlanFromProducts(
  products: EventProductRecord[],
  venueLength: number,
  venueWidth: number,
): EventLayoutPlannerPlan {
  const objects: EventLayoutPlannerPlan["objects"] = [];
  let objectIndex = 0;

  for (const product of products) {
    const placements = parsePlacementHints(product.placement_hint);
    const parsedDimensions = parseCanvasDimensions(product.extra_notes);
    const catalogDimensions = getCatalogDimensions(
      product.product_master.category,
      product.product_master.name,
    );
    const width = parsedDimensions?.width ?? catalogDimensions.width;
    const height = parsedDimensions?.height ?? catalogDimensions.height;
    const kind = `product-master:${product.product_master_id}` as PlannerObjectKind;

    if (placements.length === 0) continue;

    for (const placement of placements) {
      objects.push({
        id: `restored-${product.product_master_id}-${objectIndex++}`,
        kind,
        productMasterId: product.product_master_id,
        label: product.product_master.name,
        x: placement.x,
        y: placement.y,
        width,
        height,
        rotation: 0,
      });
    }
  }

  return {
    venue: {
      lengthFt: venueLength,
      widthFt: venueWidth,
      areaSqFt: venueLength * venueWidth,
    },
    objects,
  };
}

export function toEventRecord(fullEvent: FullEventRecord) {
  return {
    id: fullEvent.id,
    title: fullEvent.title,
    client_name: fullEvent.client_name,
    client_email: fullEvent.client_email,
    client_phone: fullEvent.client_phone,
    status: fullEvent.status,
    created_at: fullEvent.created_at,
    updated_at: fullEvent.updated_at ?? "",
  };
}

export function extractEventDetails(
  fullEvent: FullEventRecord,
): EventDetailsRecord | null {
  return fullEvent.event_details ?? null;
}

export function applyFullEventState(fullEvent: FullEventRecord): {
  event: ReturnType<typeof toEventRecord>;
  eventDetails: EventDetailsRecord | null;
  venueSession: { venue: VenueRecord } | null;
  plan: EventLayoutPlannerPlan | null;
  step: "venue";
} {
  const event = toEventRecord(fullEvent);
  const eventDetails = extractEventDetails(fullEvent);

  if (!fullEvent.venue) {
    return {
      event,
      eventDetails,
      venueSession: null,
      plan: null,
      step: "venue",
    };
  }

  const venue = normalizeVenue(fullEvent.venue);
  const venueLength = venue.length_ft ?? 90;
  const venueWidth = venue.width_ft ?? 55;
  const plan = fullEvent.products?.length
    ? buildPlanFromProducts(fullEvent.products, venueLength, venueWidth)
    : {
        venue: {
          lengthFt: venueLength,
          widthFt: venueWidth,
          areaSqFt: venueLength * venueWidth,
        },
        objects: [],
      };

  return {
    event,
    eventDetails,
    venueSession: { venue },
    plan,
    step: "venue",
  };
}

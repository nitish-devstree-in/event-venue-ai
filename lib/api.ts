const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://event-planner.devstree.in/api/v1";

export type EventRecord = {
  id: number;
  title: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  status: string;
  created_at: string;
  updated_at: string | null;
};

export type CreateEventPayload = {
  title: string;
  client_name: string;
  client_email: string;
  client_phone: string;
};

export type VenueRecord = {
  id: number;
  event_id: number;
  name: string | null;
  width_ft: number | null;
  length_ft: number | null;
  venue_image_url?: string | null;
  layout_2d_url?: string | null;
  image_url?: string | null;
  created_at?: string;
  updated_at?: string | null;
};

export type UploadVenuePayload = {
  venue_image: File;
  name?: string;
  width_ft?: number;
  length_ft?: number;
};

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      detail?: string | Array<{ msg?: string }>;
      message?: string;
    };

    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((item) => item.msg ?? "Validation error").join(", ");
    }
    if (data.message) return data.message;
  } catch {
    // Fall through to generic message.
  }

  return `Request failed (${response.status})`;
}

async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);

  if (!response.ok) {
    throw new ApiError(await parseErrorMessage(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function listEvents(): Promise<EventRecord[]> {
  return apiRequest<EventRecord[]>("/events");
}

export async function getEvent(eventId: number): Promise<FullEventRecord> {
  return apiRequest<FullEventRecord>(`/events/${eventId}`);
}

export async function createEvent(
  payload: CreateEventPayload,
): Promise<EventRecord> {
  return apiRequest<EventRecord>("/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type UpdateEventPayload = {
  title?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  status?: string;
};

export async function updateEvent(
  eventId: number,
  payload: UpdateEventPayload,
): Promise<EventRecord> {
  return apiRequest<EventRecord>(`/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type EventDetailsRecord = {
  id?: number;
  event_id: number;
  theme: string | null;
  color_palette: string | null;
  lighting_type: string | null;
  lighting_notes: string | null;
  guest_count: number | null;
  extra_notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type EventDetailsPayload = {
  theme?: string;
  color_palette?: string;
  lighting_type?: string;
  lighting_notes?: string;
  guest_count?: number;
  extra_notes?: string;
};

export async function createEventDetails(
  eventId: number,
  payload: EventDetailsPayload,
): Promise<EventDetailsRecord> {
  return apiRequest<EventDetailsRecord>(`/events/${eventId}/details`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateEventDetails(
  eventId: number,
  payload: EventDetailsPayload,
): Promise<EventDetailsRecord> {
  return apiRequest<EventDetailsRecord>(`/events/${eventId}/details`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getVenue(eventId: number): Promise<VenueRecord> {
  const venue = await apiRequest<VenueRecord>(`/events/${eventId}/venue`);
  return {
    ...venue,
    image_url: venue.venue_image_url ?? venue.image_url ?? null,
  };
}

export async function uploadVenue(
  eventId: number,
  payload: UploadVenuePayload,
): Promise<VenueRecord> {
  const formData = new FormData();
  formData.append("venue_image", payload.venue_image);

  if (payload.name?.trim()) {
    formData.append("name", payload.name.trim());
  }
  if (payload.width_ft != null) {
    formData.append("width_ft", String(payload.width_ft));
  }
  if (payload.length_ft != null) {
    formData.append("length_ft", String(payload.length_ft));
  }

  return apiRequest<VenueRecord>(`/events/${eventId}/venue`, {
    method: "POST",
    body: formData,
  });
}

export async function uploadVenueLayout(
  eventId: number,
  layoutImage: Blob | File,
): Promise<VenueRecord> {
  const formData = new FormData();
  formData.append("layout_image", layoutImage, "layout.png");

  return apiRequest<VenueRecord>(`/events/${eventId}/venue/layout`, {
    method: "PATCH",
    body: formData,
  });
}

export type ProductMasterRecord = {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateProductMasterPayload = {
  name: string;
  category?: string;
  description?: string;
  product_image?: File;
};

export type UpdateProductMasterPayload = {
  name?: string;
  category?: string;
  description?: string;
  is_active?: boolean;
  product_image?: File;
};

export async function listProductMaster(options?: {
  category?: string;
  activeOnly?: boolean;
}): Promise<ProductMasterRecord[]> {
  const params = new URLSearchParams();
  if (options?.category) {
    params.set("category", options.category);
  }
  if (options?.activeOnly === false) {
    params.set("active_only", "false");
  }

  const query = params.toString();
  return apiRequest<ProductMasterRecord[]>(
    `/product-master${query ? `?${query}` : ""}`,
  );
}

export async function createProductMaster(
  payload: CreateProductMasterPayload,
): Promise<ProductMasterRecord> {
  const formData = new FormData();
  formData.append("name", payload.name.trim());

  if (payload.category?.trim()) {
    formData.append("category", payload.category.trim());
  }
  if (payload.description?.trim()) {
    formData.append("description", payload.description.trim());
  }
  if (payload.product_image) {
    formData.append("product_image", payload.product_image);
  }

  return apiRequest<ProductMasterRecord>("/product-master", {
    method: "POST",
    body: formData,
  });
}

export async function updateProductMaster(
  masterId: number,
  payload: UpdateProductMasterPayload,
): Promise<ProductMasterRecord> {
  const formData = new FormData();

  if (payload.name != null) {
    formData.append("name", payload.name.trim());
  }
  if (payload.category != null) {
    formData.append("category", payload.category.trim());
  }
  if (payload.description != null) {
    formData.append("description", payload.description.trim());
  }
  if (payload.is_active != null) {
    formData.append("is_active", String(payload.is_active));
  }
  if (payload.product_image) {
    formData.append("product_image", payload.product_image);
  }

  return apiRequest<ProductMasterRecord>(`/product-master/${masterId}`, {
    method: "PATCH",
    body: formData,
  });
}

export type EventProductRecord = {
  id: number;
  event_id: number;
  product_master_id: number;
  quantity: number;
  placement_hint: string | null;
  extra_notes: string | null;
  created_at: string;
  updated_at?: string;
  product_master: ProductMasterRecord;
};

export type AddEventProductPayload = {
  product_master_id: number;
  quantity?: number;
  placement_hint?: string;
  extra_notes?: string;
};

export type UpdateEventProductPayload = {
  quantity?: number;
  placement_hint?: string;
  extra_notes?: string;
};

export async function listEventProducts(
  eventId: number,
): Promise<EventProductRecord[]> {
  return apiRequest<EventProductRecord[]>(`/events/${eventId}/products`);
}

export async function addEventProduct(
  eventId: number,
  payload: AddEventProductPayload,
): Promise<EventProductRecord> {
  return apiRequest<EventProductRecord>(`/events/${eventId}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      product_master_id: payload.product_master_id,
      quantity: payload.quantity ?? 1,
      placement_hint: payload.placement_hint ?? "",
      extra_notes: payload.extra_notes ?? "",
    }),
  });
}

export async function addEventProductsBulk(
  eventId: number,
  items: AddEventProductPayload[],
): Promise<EventProductRecord[]> {
  return apiRequest<EventProductRecord[]>(
    `/events/${eventId}/products/bulk`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        items.map((item) => ({
          product_master_id: item.product_master_id,
          quantity: item.quantity ?? 1,
          placement_hint: item.placement_hint ?? "",
          extra_notes: item.extra_notes ?? "",
        })),
      ),
    },
  );
}

export async function updateEventProduct(
  eventId: number,
  productId: number,
  payload: UpdateEventProductPayload,
): Promise<EventProductRecord> {
  const params = new URLSearchParams();
  if (payload.quantity != null) {
    params.set("quantity", String(payload.quantity));
  }
  if (payload.placement_hint != null) {
    params.set("placement_hint", payload.placement_hint);
  }
  if (payload.extra_notes != null) {
    params.set("extra_notes", payload.extra_notes);
  }

  const query = params.toString();

  return apiRequest<EventProductRecord>(
    `/events/${eventId}/products/${productId}${query ? `?${query}` : ""}`,
    { method: "PATCH" },
  );
}

export async function deleteEventProduct(
  eventId: number,
  productId: number,
): Promise<void> {
  await apiRequest<void>(`/events/${eventId}/products/${productId}`, {
    method: "DELETE",
  });
}

export type ArrangementRecord = {
  id: number;
  event_id: number;
  version: number;
  status: string;
  arrangement_prompt: string | null;
  result_image_url: string | null;
  client_feedback: string | null;
  is_final: boolean;
  created_at: string;
  updated_at: string;
};

export type FullEventRecord = EventRecord & {
  venue: VenueRecord | null;
  event_details: EventDetailsRecord | null;
  products: EventProductRecord[];
  arrangements: ArrangementRecord[];
};

export async function listArrangements(
  eventId: number,
): Promise<ArrangementRecord[]> {
  return apiRequest<ArrangementRecord[]>(`/events/${eventId}/arrangements`);
}

export async function generateArrangement(
  eventId: number,
): Promise<ArrangementRecord> {
  return apiRequest<ArrangementRecord>(
    `/events/${eventId}/arrangements/generate`,
    { method: "POST" },
  );
}

export type RequestArrangementChangesPayload = {
  client_feedback: string;
};

export async function requestArrangementChanges(
  eventId: number,
  arrangementId: number,
  payload: RequestArrangementChangesPayload,
): Promise<ArrangementRecord> {
  return apiRequest<ArrangementRecord>(
    `/events/${eventId}/arrangements/${arrangementId}/request-changes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function getArrangement(
  eventId: number,
  arrangementId: number,
): Promise<ArrangementRecord> {
  return apiRequest<ArrangementRecord>(
    `/events/${eventId}/arrangements/${arrangementId}`,
  );
}

export { ApiError };

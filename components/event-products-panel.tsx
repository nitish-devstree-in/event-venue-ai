"use client";

import * as React from "react";
import {
  ChevronRight,
  Loader2,
  Package,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  addEventProduct,
  deleteEventProduct,
  listEventProducts,
  updateEventProduct,
  type EventProductRecord,
  type ProductMasterRecord,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export type CanvasPlacement = {
  id: string;
  productMasterId: number;
  label: string;
  width: number;
  height: number;
  x: number;
  y: number;
};

export type EventProductsPanelHandle = {
  addProductFromCanvas: (
    productMasterId: number,
    placement: { x: number; y: number; width: number; height: number },
  ) => Promise<void>;
};

type EventProductsPanelProps = {
  eventId: number;
  canvasPlacements: CanvasPlacement[];
  selectedCanvasIds: string[];
  productCatalog: ProductMasterRecord[];
  venueAreaSqFt: number;
  onSelectCanvas: (objectId: string, additive: boolean) => void;
  onPlaceOnCanvas: (productMasterId: number, quantity: number) => void;
  onRemoveFromCanvas: (productMasterId: number) => void;
  onContinue?: () => void;
  isContinuing?: boolean;
};

export const EventProductsPanel = React.forwardRef<
  EventProductsPanelHandle,
  EventProductsPanelProps
>(function EventProductsPanel(
  {
    eventId,
    canvasPlacements,
    selectedCanvasIds,
    productCatalog,
    venueAreaSqFt,
    onSelectCanvas,
    onPlaceOnCanvas,
    onRemoveFromCanvas,
    onContinue,
    isContinuing = false,
  },
  ref,
) {
  const [eventProducts, setEventProducts] = React.useState<EventProductRecord[]>(
    [],
  );
  const eventProductsRef = React.useRef(eventProducts);
  eventProductsRef.current = eventProducts;

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] =
    React.useState<EventProductRecord | null>(null);

  const loadEventProducts = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listEventProducts(eventId);
      setEventProducts(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load event products.",
      );
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  React.useEffect(() => {
    void loadEventProducts();
  }, [loadEventProducts]);

  const addProductFromCanvas = React.useCallback(
    async (
      productMasterId: number,
      placement: { x: number; y: number; width: number; height: number },
    ) => {
      setError(null);

      const hint = `x:${placement.x.toFixed(1)}, y:${placement.y.toFixed(1)} ft`;
      const notes = `${placement.width} x ${placement.height} ft on canvas`;
      const existing = eventProductsRef.current.find(
        (item) => item.product_master_id === productMasterId,
      );

      try {
        if (existing) {
          await updateEventProduct(eventId, existing.id, {
            quantity: existing.quantity + 1,
            placement_hint: existing.placement_hint
              ? `${existing.placement_hint}; ${hint}`
              : hint,
            extra_notes: notes,
          });
        } else {
          await addEventProduct(eventId, {
            product_master_id: productMasterId,
            quantity: 1,
            placement_hint: hint,
            extra_notes: notes,
          });
        }

        await loadEventProducts();
      } catch (addError) {
        setError(
          addError instanceof Error
            ? addError.message
            : "Failed to add product to event.",
        );
        throw addError;
      }
    },
    [eventId, loadEventProducts],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      addProductFromCanvas,
    }),
    [addProductFromCanvas],
  );

  const catalogOptions = React.useMemo(() => {
    const usedIds = new Set(eventProducts.map((item) => item.product_master_id));
    return productCatalog.filter((product) => !usedIds.has(product.id));
  }, [eventProducts, productCatalog]);

  const handleAddFromCatalog = async (productMasterId: number) => {
    setBusyId(productMasterId);
    setError(null);

    try {
      await addEventProduct(eventId, {
        product_master_id: productMasterId,
        quantity: 1,
      });
      await loadEventProducts();
      setAddOpen(false);
      onPlaceOnCanvas(productMasterId, 1);
    } catch (addError) {
      setError(
        addError instanceof Error
          ? addError.message
          : "Failed to add product to event.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (record: EventProductRecord) => {
    setBusyId(record.id);
    setError(null);

    try {
      await deleteEventProduct(eventId, record.id);
      await loadEventProducts();
      onRemoveFromCanvas(record.product_master_id);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to remove product from event.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleSaved = async (updated: EventProductRecord) => {
    setEditingProduct(null);
    setEventProducts((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    await loadEventProducts();
  };

  const canvasCountByMasterId = React.useMemo(() => {
    const counts = new Map<number, number>();
    canvasPlacements.forEach((placement) => {
      counts.set(
        placement.productMasterId,
        (counts.get(placement.productMasterId) ?? 0) + 1,
      );
    });
    return counts;
  }, [canvasPlacements]);

  return (
    <>
      <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <div className="flex shrink-0 items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Event products</h3>
            <p className="text-xs text-[#6f756a]">
              Added automatically when you place from the left
            </p>
          </div>
          <Button
            type="button"
            size="icon-sm"
            className="shrink-0 bg-[#315c4b] text-white hover:bg-[#25483b]"
            onClick={() => setAddOpen(true)}
            title="Add product to event"
          >
            <Plus />
          </Button>
        </div>

        {error ? (
          <div className="shrink-0 rounded-lg border border-[#f1c0c0] bg-[#fff5f5] px-3 py-2 text-xs text-[#9b1c1c]">
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-[#d1c8b9] bg-[#fbfaf7]">
              <div className="flex items-center gap-2 text-sm text-[#596153]">
                <Loader2 className="size-4 animate-spin" />
                Loading...
              </div>
            </div>
          ) : eventProducts.length === 0 ? (
            <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#d1c8b9] bg-[#fbfaf7] p-4 text-center">
              <Package className="size-6 text-[#8ca17f]" />
              <p className="text-sm font-medium">No event products yet</p>
              <p className="text-xs text-[#6f756a]">
                Click a product on the left to add it here and on the canvas.
              </p>
            </div>
          ) : (
            eventProducts.map((record, index) => {
              const canvasCount =
                canvasCountByMasterId.get(record.product_master_id) ?? 0;
              const linkedCanvasIds = canvasPlacements
                .filter(
                  (placement) =>
                    placement.productMasterId === record.product_master_id,
                )
                .map((placement) => placement.id);
              const isCanvasSelected = linkedCanvasIds.some((id) =>
                selectedCanvasIds.includes(id),
              );

              return (
                <div
                  key={record.id}
                  className={cn(
                    "rounded-lg border p-3 transition",
                    isCanvasSelected
                      ? "border-[#315c4b] bg-[#eef5ec]"
                      : "border-[#ddd6c7] bg-[#fbfaf7]",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#315c4b] text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {record.product_master.name}
                      </p>
                      <p className="text-xs text-[#6f756a]">
                        Qty {record.quantity}
                        {record.product_master.category
                          ? ` · ${record.product_master.category}`
                          : ""}
                        {canvasCount > 0 ? ` · ${canvasCount} on canvas` : ""}
                      </p>
                      {record.placement_hint ? (
                        <p className="mt-1 line-clamp-2 text-xs text-[#596153]">
                          {record.placement_hint}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {canvasCount >= record.quantity ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => onSelectCanvas(linkedCanvasIds[0]!, false)}
                      >
                        Select on canvas
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() =>
                          onPlaceOnCanvas(
                            record.product_master_id,
                            record.quantity,
                          )
                        }
                      >
                        {canvasCount > 0
                          ? `Place remaining (${record.quantity - canvasCount})`
                          : `Place all (${record.quantity})`}
                      </Button>
                    )}
                    {linkedCanvasIds.length > 0 && canvasCount < record.quantity ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => onSelectCanvas(linkedCanvasIds[0]!, false)}
                      >
                        Select on canvas
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setEditingProduct(record)}
                    >
                      <Pencil />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="xs"
                      disabled={busyId === record.id}
                      onClick={() => void handleDelete(record)}
                    >
                      {busyId === record.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-[#ebe5da] pt-3">
          <p className="text-xs font-medium text-[#6f756a]">
            Canvas: {canvasPlacements.length} placed · Event:{" "}
            {eventProducts.length} product
            {eventProducts.length === 1 ? "" : "s"} · {venueAreaSqFt} sq ft
          </p>

          {onContinue ? (
            <Button
              type="button"
              size="lg"
              className="w-full bg-[#315c4b] text-white hover:bg-[#25483b]"
              onClick={onContinue}
              disabled={isContinuing || (eventProducts.length === 0 && canvasPlacements.length === 0)}
              title="Continue to event details"
            >
              {isContinuing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />
                  Saving layout...
                </>
              ) : (
                <>
                  Continue to generate
                  <ChevronRight className="size-4" />
                </>
              )}
            </Button>
          ) : null}
        </div>
      </section>

      <AddEventProductDialog
        open={addOpen}
        options={catalogOptions}
        busyId={busyId}
        onClose={() => setAddOpen(false)}
        onSelect={(productMasterId) => void handleAddFromCatalog(productMasterId)}
      />

      <EditEventProductDialog
        open={editingProduct != null}
        eventId={eventId}
        record={editingProduct}
        onClose={() => setEditingProduct(null)}
        onSaved={handleSaved}
      />
    </>
  );
});

function AddEventProductDialog({
  open,
  options,
  busyId,
  onClose,
  onSelect,
}: {
  open: boolean;
  options: ProductMasterRecord[];
  busyId: number | null;
  onClose: () => void;
  onSelect: (productMasterId: number) => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-[#1f2520]/45"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[80vh] w-full max-w-md overflow-hidden rounded-xl border border-[#d8d1c3] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#ebe5da] p-4">
          <h2 className="text-lg font-semibold">Add to event</h2>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose}>
            <X />
          </Button>
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
          {options.length === 0 ? (
            <p className="text-sm text-[#6f756a]">
              All catalogue products are already on this event.
            </p>
          ) : (
            options.map((product) => (
              <button
                key={product.id}
                type="button"
                disabled={busyId === product.id}
                onClick={() => onSelect(product.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-[#ddd6c7] bg-[#fbfaf7] p-3 text-left transition hover:border-[#8ca17f] hover:bg-[#f4f8ef] disabled:opacity-60"
              >
                {product.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.image_url}
                    alt=""
                    className="size-12 rounded-md object-cover"
                  />
                ) : (
                  <span className="flex size-12 items-center justify-center rounded-md bg-white">
                    <Package className="size-5 text-[#8ca17f]" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{product.name}</span>
                  <span className="text-xs text-[#6f756a]">
                    {product.category ?? "Uncategorised"}
                  </span>
                </span>
                {busyId === product.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function EditEventProductDialog({
  open,
  eventId,
  record,
  onClose,
  onSaved,
}: {
  open: boolean;
  eventId: number;
  record: EventProductRecord | null;
  onClose: () => void;
  onSaved: (record: EventProductRecord) => void;
}) {
  const [quantity, setQuantity] = React.useState("1");
  const [placementHint, setPlacementHint] = React.useState("");
  const [extraNotes, setExtraNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open || !record) return;
    setQuantity(String(record.quantity));
    setPlacementHint(record.placement_hint ?? "");
    setExtraNotes(record.extra_notes ?? "");
    setError(null);
    setSubmitting(false);
  }, [open, record]);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!record) return;

    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) {
      setError("Quantity must be at least 1.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const updated = await updateEventProduct(eventId, record.id, {
        quantity: parsedQuantity,
        placement_hint: placementHint,
        extra_notes: extraNotes,
      });
      onSaved(updated);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to update product.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !record) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-[#1f2520]/45"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-[#d8d1c3] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b715f]">
              Edit event product
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {record.product_master.name}
            </h2>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose}>
            <X />
          </Button>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#5c6659]">Quantity</span>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="h-9 w-full rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] px-3 text-sm outline-none focus:border-[#66835d] focus:ring-2 focus:ring-[#66835d]/20"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#5c6659]">
              Placement hint
            </span>
            <input
              type="text"
              value={placementHint}
              onChange={(event) => setPlacementHint(event.target.value)}
              placeholder="Near stage, left aisle..."
              className="h-9 w-full rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] px-3 text-sm outline-none focus:border-[#66835d] focus:ring-2 focus:ring-[#66835d]/20"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#5c6659]">
              Extra notes
            </span>
            <textarea
              value={extraNotes}
              onChange={(event) => setExtraNotes(event.target.value)}
              rows={2}
              className="w-full resize-y rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] px-3 py-2 text-sm outline-none focus:border-[#66835d] focus:ring-2 focus:ring-[#66835d]/20"
            />
          </label>

          {error ? (
            <div className="rounded-lg border border-[#f1c0c0] bg-[#fff5f5] px-3 py-2 text-sm text-[#9b1c1c]">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
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
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

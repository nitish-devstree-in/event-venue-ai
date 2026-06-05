"use client";

import * as React from "react";
import {
  BadgeCheck,
  Download,
  Move,
  RotateCcw,
} from "lucide-react";

import {
  EventProductsPanel,
  type CanvasPlacement,
  type EventProductsPanelHandle,
} from "@/components/event-products-panel";

import { ProductMasterPanel } from "@/components/product-master-panel";
import { Button } from "@/components/ui/button";
import type { ProductMasterRecord } from "@/lib/api";
import {
  buildProductTemplateMap,
  clampObjectSize,
  getCatalogDimensions,
  getResizeLimits,
  normalizeProductCategory,
  PLANNER_PRODUCT_DRAG_TYPE,
  productFitsVenue,
  type PlannerObjectKind,
  type PlannerTemplate,
} from "@/lib/product-master-planner";

const CANVAS_VIEW_SIZE = 1000;

function toDisplayX(valueFt: number, venueLengthFt: number) {
  if (venueLengthFt <= 0) return 0;
  return (valueFt / venueLengthFt) * CANVAS_VIEW_SIZE;
}

function toDisplayY(valueFt: number, venueWidthFt: number) {
  if (venueWidthFt <= 0) return 0;
  return (valueFt / venueWidthFt) * CANVAS_VIEW_SIZE;
}

function toFeetX(valueDisplay: number, venueLengthFt: number) {
  return (valueDisplay / CANVAS_VIEW_SIZE) * venueLengthFt;
}

function toFeetY(valueDisplay: number, venueWidthFt: number) {
  return (valueDisplay / CANVAS_VIEW_SIZE) * venueWidthFt;
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type PlannerObject = PlannerTemplate & {
  id: string;
  x: number;
  y: number;
  rotation: number;
};

function objectToDisplay(
  object: PlannerObject,
  venueLength: number,
  venueWidth: number,
): PlannerObject {
  return {
    ...object,
    x: toDisplayX(object.x, venueLength),
    y: toDisplayY(object.y, venueWidth),
    width: toDisplayX(object.width, venueLength),
    height: toDisplayY(object.height, venueWidth),
  };
}

type MoveState = {
  type: "move";
  pointerId: number;
  startPoint: Point;
  originals: Record<string, Pick<PlannerObject, "x" | "y">>;
};

type ResizeState = {
  type: "resize";
  id: string;
  pointerId: number;
  handle: ResizeHandle;
  original: Pick<PlannerObject, "x" | "y" | "width" | "height">;
  startPoint: Point;
};

type InteractionState = MoveState | ResizeState;

type Point = {
  x: number;
  y: number;
};

export type EventLayoutPlannerPlan = {
  venue: {
    lengthFt: number;
    widthFt: number;
    areaSqFt: number;
  };
  objects: Array<{
    id: string;
    kind: PlannerObjectKind;
    productMasterId: number;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  }>;
};

const resizeHandles: Array<{
  handle: ResizeHandle;
  cursor: string;
  getPoint: (object: PlannerObject) => Point;
}> = [
  {
    handle: "nw",
    cursor: "nwse-resize",
    getPoint: (object) => ({ x: object.x, y: object.y }),
  },
  {
    handle: "n",
    cursor: "ns-resize",
    getPoint: (object) => ({ x: object.x + object.width / 2, y: object.y }),
  },
  {
    handle: "ne",
    cursor: "nesw-resize",
    getPoint: (object) => ({ x: object.x + object.width, y: object.y }),
  },
  {
    handle: "e",
    cursor: "ew-resize",
    getPoint: (object) => ({
      x: object.x + object.width,
      y: object.y + object.height / 2,
    }),
  },
  {
    handle: "se",
    cursor: "nwse-resize",
    getPoint: (object) => ({
      x: object.x + object.width,
      y: object.y + object.height,
    }),
  },
  {
    handle: "s",
    cursor: "ns-resize",
    getPoint: (object) => ({
      x: object.x + object.width / 2,
      y: object.y + object.height,
    }),
  },
  {
    handle: "sw",
    cursor: "nesw-resize",
    getPoint: (object) => ({ x: object.x, y: object.y + object.height }),
  },
  {
    handle: "w",
    cursor: "ew-resize",
    getPoint: (object) => ({ x: object.x, y: object.y + object.height / 2 }),
  },
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const makeObjectId = (productMasterId: number) =>
  `pm-${productMasterId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const objectsOverlap = (first: PlannerObject, second: PlannerObject) =>
  first.x < second.x + second.width &&
  first.x + first.width > second.x &&
  first.y < second.y + second.height &&
  first.y + first.height > second.y;

const formatNumber = (value: number) => Number(value.toFixed(1));

function getGridPosition(
  index: number,
  objectWidth: number,
  objectHeight: number,
  venueLength: number,
  venueWidth: number,
): Point {
  const gap = 1;
  const cols = Math.max(
    1,
    Math.floor((venueLength - gap) / (objectWidth + gap)),
  );
  const col = index % cols;
  const row = Math.floor(index / cols);

  return {
    x: clamp(
      gap + col * (objectWidth + gap),
      0,
      Math.max(0, venueLength - objectWidth),
    ),
    y: clamp(
      gap + row * (objectHeight + gap),
      0,
      Math.max(0, venueWidth - objectHeight),
    ),
  };
}

export function EventLayoutPlanner({
  eventId,
  onPlanChange,
  onContinue,
  initialVenueLength = 90,
  initialVenueWidth = 55,
  initialPlanObjects,
}: {
  eventId: number;
  onPlanChange?: (plan: EventLayoutPlannerPlan) => void;
  onContinue?: () => void;
  initialVenueLength?: number;
  initialVenueWidth?: number;
  initialPlanObjects?: EventLayoutPlannerPlan["objects"];
}) {
  const [venueLength, setVenueLength] = React.useState(initialVenueLength);
  const [venueWidth, setVenueWidth] = React.useState(initialVenueWidth);
  const [products, setProducts] = React.useState<ProductMasterRecord[]>([]);
  const productTemplateMap = React.useMemo(
    () => buildProductTemplateMap(products),
    [products],
  );
  const [objects, setObjects] = React.useState<PlannerObject[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [interaction, setInteraction] = React.useState<InteractionState | null>(
    null,
  );
  const [placementError, setPlacementError] = React.useState<string | null>(
    null,
  );
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const eventProductsRef = React.useRef<EventProductsPanelHandle | null>(null);
  const restoredPlanRef = React.useRef(false);
  const selectedIdSet = React.useMemo(
    () => new Set(selectedIds),
    [selectedIds],
  );

  const overlapIds = React.useMemo(() => {
    const ids = new Set<string>();

    objects.forEach((object, index) => {
      objects.slice(index + 1).forEach((otherObject) => {
        if (objectsOverlap(object, otherObject)) {
          ids.add(object.id);
          ids.add(otherObject.id);
        }
      });
    });

    return ids;
  }, [objects]);

  const canvasPlacements = React.useMemo<CanvasPlacement[]>(
    () =>
      objects.map((object) => ({
        id: object.id,
        productMasterId: object.productMasterId,
        label: object.label,
        width: object.width,
        height: object.height,
        x: object.x,
        y: object.y,
      })),
    [objects],
  );

  const removeObjectsByMasterId = React.useCallback((productMasterId: number) => {
    setObjects((currentObjects) => {
      const remaining = currentObjects.filter(
        (object) => object.productMasterId !== productMasterId,
      );
      setSelectedIds((currentIds) =>
        currentIds.filter((id) => remaining.some((object) => object.id === id)),
      );
      return remaining;
    });
  }, []);

  const gridLines = React.useMemo(() => {
    const lines: Array<{ axis: "x" | "y"; value: number; major: boolean }> = [];
    const gridStepFt = Math.min(venueLength, venueWidth) <= 20 ? 2 : 5;

    for (let x = 0; x <= venueLength; x += gridStepFt) {
      lines.push({
        axis: "x",
        value: toDisplayX(x, venueLength),
        major: x % 10 === 0,
      });
    }

    for (let y = 0; y <= venueWidth; y += gridStepFt) {
      lines.push({
        axis: "y",
        value: toDisplayY(y, venueWidth),
        major: y % 10 === 0,
      });
    }

    return lines;
  }, [venueLength, venueWidth]);

  const snapshotHeight = venueWidth + 16 + objects.length * 4.5;
  const venueAreaSqFt = venueLength * venueWidth;

  const resolveObjectDimensions = React.useCallback(
    (template: PlannerTemplate) =>
      getCatalogDimensions(template.category, template.label),
    [],
  );

  const getLimitsForTemplate = React.useCallback(
    (template: PlannerTemplate) =>
      getResizeLimits(
        template.category,
        template.label,
        venueLength,
        venueWidth,
      ),
    [venueLength, venueWidth],
  );

  const venueTooSmallForCatalog = venueLength < 16 || venueWidth < 16;

  React.useEffect(() => {
    if (!onPlanChange) return;
    onPlanChange({
      venue: {
        lengthFt: venueLength,
        widthFt: venueWidth,
        areaSqFt: venueAreaSqFt,
      },
      objects: objects.map((object) => ({
        id: object.id,
        kind: object.kind,
        productMasterId: object.productMasterId,
        label: object.label,
        x: formatNumber(object.x),
        y: formatNumber(object.y),
        width: formatNumber(object.width),
        height: formatNumber(object.height),
        rotation: object.rotation,
      })),
    });
  }, [objects, onPlanChange, venueAreaSqFt, venueLength, venueWidth]);

  React.useEffect(() => {
    if (
      restoredPlanRef.current ||
      !initialPlanObjects?.length ||
      productTemplateMap.size === 0
    ) {
      return;
    }

    restoredPlanRef.current = true;
    setObjects(
      initialPlanObjects.flatMap((savedObject) => {
        const template = productTemplateMap.get(savedObject.productMasterId);
        if (!template) return [];

        const fixed = resolveObjectDimensions(template);
        const limits = getLimitsForTemplate(template);
        const size = clampObjectSize(
          savedObject.width,
          savedObject.height,
          limits,
        );

        return [
          {
            ...template,
            ...size,
            id: savedObject.id,
            x: clamp(
              savedObject.x,
              0,
              Math.max(0, venueLength - size.width),
            ),
            y: clamp(
              savedObject.y,
              0,
              Math.max(0, venueWidth - size.height),
            ),
            rotation: savedObject.rotation,
          },
        ];
      }),
    );
  }, [
    initialPlanObjects,
    productTemplateMap,
    getLimitsForTemplate,
    resolveObjectDimensions,
    venueLength,
    venueWidth,
  ]);

  const getPointInVenue = React.useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;

      if (!svg) {
        return { x: 0, y: 0 };
      }

      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;

      const matrix = svg.getScreenCTM();

      if (!matrix) {
        return { x: 0, y: 0 };
      }

      const transformed = point.matrixTransform(matrix.inverse());

      return {
        x: clamp(toFeetX(transformed.x, venueLength), 0, venueLength),
        y: clamp(toFeetY(transformed.y, venueWidth), 0, venueWidth),
      };
    },
    [venueLength, venueWidth],
  );

  const addProductObject = React.useCallback(
    (productMasterId: number, position?: Point): PlannerObject | null => {
      const template = productTemplateMap.get(productMasterId);

      if (!template) {
        return null;
      }

      const catalog = resolveObjectDimensions(template);

      if (!productFitsVenue(catalog.width, catalog.height, venueLength, venueWidth)) {
        setPlacementError(
          `${template.label} is ${catalog.width}×${catalog.height} ft — larger than this venue. Use the corner handles to resize it after placing.`,
        );
      } else {
        setPlacementError(null);
      }

      const nextObject: PlannerObject = {
        ...template,
        ...catalog,
        id: makeObjectId(productMasterId),
        x: clamp(
          position?.x ?? venueLength / 2 - catalog.width / 2,
          0,
          Math.max(0, venueLength - catalog.width),
        ),
        y: clamp(
          position?.y ?? venueWidth / 2 - catalog.height / 2,
          0,
          Math.max(0, venueWidth - catalog.height),
        ),
        rotation: 0,
      };

      setObjects((currentObjects) => [...currentObjects, nextObject]);
      setSelectedIds([nextObject.id]);
      return nextObject;
    },
    [productTemplateMap, resolveObjectDimensions, venueLength, venueWidth],
  );

  const placeProduct = React.useCallback(
    async (
      productMasterId: number,
      position?: Point,
      options?: { syncToEvent?: boolean },
    ) => {
      const placed = addProductObject(productMasterId, position);
      if (!placed || options?.syncToEvent === false) return;

      try {
        await eventProductsRef.current?.addProductFromCanvas(productMasterId, {
          x: placed.x,
          y: placed.y,
          width: placed.width,
          height: placed.height,
        });
      } catch {
        // Error state is shown in the event products panel.
      }
    },
    [addProductObject],
  );

  const placeProductsForQuantity = React.useCallback(
    (
      productMasterId: number,
      targetQuantity: number,
      options?: { syncToEvent?: boolean },
    ) => {
      const template = productTemplateMap.get(productMasterId);
      if (!template) return;

      const catalog = resolveObjectDimensions(template);
      const currentCount = objects.filter(
        (object) => object.productMasterId === productMasterId,
      ).length;
      const toPlace = Math.max(0, targetQuantity - currentCount);

      if (toPlace === 0) {
        setPlacementError(
          `All ${targetQuantity} ${template.label} items are already on the canvas.`,
        );
        return;
      }

      if (
        !productFitsVenue(catalog.width, catalog.height, venueLength, venueWidth)
      ) {
        setPlacementError(
          `${template.label} is ${catalog.width}×${catalog.height} ft — larger than this venue. Use the corner handles to resize after placing.`,
        );
      } else {
        setPlacementError(null);
      }

      const newObjects: PlannerObject[] = Array.from({ length: toPlace }, (_, i) => {
        const index = currentCount + i;
        const position = getGridPosition(
          index,
          catalog.width,
          catalog.height,
          venueLength,
          venueWidth,
        );

        return {
          ...template,
          ...catalog,
          id: makeObjectId(productMasterId),
          x: position.x,
          y: position.y,
          rotation: 0,
        };
      });

      setObjects((currentObjects) => [...currentObjects, ...newObjects]);
      setSelectedIds(newObjects.map((object) => object.id));

      if (options?.syncToEvent === false) return;

      void (async () => {
        for (const object of newObjects) {
          try {
            await eventProductsRef.current?.addProductFromCanvas(productMasterId, {
              x: object.x,
              y: object.y,
              width: object.width,
              height: object.height,
            });
          } catch {
            break;
          }
        }
      })();
    },
    [objects, productTemplateMap, resolveObjectDimensions, venueLength, venueWidth],
  );

  const updateObject = React.useCallback(
    (id: string, patch: Partial<PlannerObject>) => {
      setObjects((currentObjects) =>
        currentObjects.map((object) => {
          if (object.id !== id) {
            return object;
          }

          const template = productTemplateMap.get(object.productMasterId);
          const limits = template
            ? getLimitsForTemplate(template)
            : getResizeLimits(
                object.category,
                object.label,
                venueLength,
                venueWidth,
              );
          const size = clampObjectSize(
            patch.width ?? object.width,
            patch.height ?? object.height,
            limits,
          );

          const nextObject = {
            ...object,
            ...patch,
            ...size,
            rotation: clamp(patch.rotation ?? object.rotation, 0, 355),
          };

          return {
            ...nextObject,
            x: clamp(
              nextObject.x,
              0,
              Math.max(0, venueLength - nextObject.width),
            ),
            y: clamp(
              nextObject.y,
              0,
              Math.max(0, venueWidth - nextObject.height),
            ),
          };
        }),
      );
    },
    [getLimitsForTemplate, productTemplateMap, venueLength, venueWidth],
  );

  const handleVenueLengthChange = (value: number) => {
    const nextLength = clamp(value, 5, 180);
    setVenueLength(nextLength);
    setObjects((currentObjects) =>
      currentObjects.map((object) => {
        const template = productTemplateMap.get(object.productMasterId);
        const limits = template
          ? getResizeLimits(
              template.category,
              template.label,
              nextLength,
              venueWidth,
            )
          : getResizeLimits(
              object.category,
              object.label,
              nextLength,
              venueWidth,
            );
        const size = clampObjectSize(object.width, object.height, limits);

        return {
          ...object,
          ...size,
          x: clamp(object.x, 0, Math.max(0, nextLength - size.width)),
        };
      }),
    );
  };

  const handleVenueWidthChange = (value: number) => {
    const nextWidth = clamp(value, 5, 120);
    setVenueWidth(nextWidth);
    setObjects((currentObjects) =>
      currentObjects.map((object) => {
        const template = productTemplateMap.get(object.productMasterId);
        const limits = template
          ? getResizeLimits(
              template.category,
              template.label,
              venueLength,
              nextWidth,
            )
          : getResizeLimits(
              object.category,
              object.label,
              venueLength,
              nextWidth,
            );
        const size = clampObjectSize(object.width, object.height, limits);

        return {
          ...object,
          ...size,
          y: clamp(object.y, 0, Math.max(0, nextWidth - size.height)),
        };
      }),
    );
  };

  const selectObject = (objectId: string, additive: boolean) => {
    setSelectedIds((currentIds) => {
      if (!additive) {
        return [objectId];
      }

      if (currentIds.includes(objectId)) {
        return currentIds.filter((id) => id !== objectId);
      }

      return [...currentIds, objectId];
    });
  };

  const startObjectMove = (
    event: React.PointerEvent<SVGGElement>,
    object: PlannerObject,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const movingIds =
      selectedIdSet.has(object.id) && !additive ? selectedIds : [object.id];
    const nextSelectedIds = additive
      ? selectedIds.includes(object.id)
        ? selectedIds.filter((id) => id !== object.id)
        : [...selectedIds, object.id]
      : movingIds;
    const point = getPointInVenue(event.clientX, event.clientY);
    const originals = Object.fromEntries(
      objects
        .filter((item) => nextSelectedIds.includes(item.id))
        .map((item) => [item.id, { x: item.x, y: item.y }]),
    );

    setSelectedIds(nextSelectedIds);
    setInteraction({
      type: "move",
      pointerId: event.pointerId,
      startPoint: point,
      originals,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startResize = (
    event: React.PointerEvent<SVGCircleElement>,
    object: PlannerObject,
    handle: ResizeHandle,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    setSelectedIds([object.id]);
    setInteraction({
      type: "resize",
      id: object.id,
      pointerId: event.pointerId,
      handle,
      original: {
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
      },
      startPoint: getPointInVenue(event.clientX, event.clientY),
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveOrResizeObject = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!interaction) {
      return;
    }

    const point = getPointInVenue(event.clientX, event.clientY);

    if (interaction.type === "move") {
      const deltaX = point.x - interaction.startPoint.x;
      const deltaY = point.y - interaction.startPoint.y;

      setObjects((currentObjects) =>
        currentObjects.map((object) => {
          const original = interaction.originals[object.id];

          if (!original) {
            return object;
          }

          return {
            ...object,
            x: clamp(
              original.x + deltaX,
              0,
              Math.max(0, venueLength - object.width),
            ),
            y: clamp(
              original.y + deltaY,
              0,
              Math.max(0, venueWidth - object.height),
            ),
          };
        }),
      );
      return;
    }

    const deltaX = point.x - interaction.startPoint.x;
    const deltaY = point.y - interaction.startPoint.y;
    const { original, handle } = interaction;
    const next = { ...original };

    if (handle.includes("e")) {
      next.width = original.width + deltaX;
    }
    if (handle.includes("s")) {
      next.height = original.height + deltaY;
    }
    if (handle.includes("w")) {
      next.x = original.x + deltaX;
      next.width = original.width - deltaX;
    }
    if (handle.includes("n")) {
      next.y = original.y + deltaY;
      next.height = original.height - deltaY;
    }

    updateObject(interaction.id, next);
  };

  const finishInteraction = (event: React.PointerEvent<SVGSVGElement>) => {
    if (interaction?.pointerId === event.pointerId) {
      setInteraction(null);
    }
  };

  const resetLayout = () => {
    setVenueLength(initialVenueLength);
    setVenueWidth(initialVenueWidth);
    setObjects([]);
    setSelectedIds([]);
    setPlacementError(null);
  };

  const resolveOverlaps = () => {
    setObjects((currentObjects) => {
      const nextObjects = currentObjects.map((object) => ({ ...object }));

      for (let pass = 0; pass < 8; pass += 1) {
        nextObjects.forEach((object, index) => {
          nextObjects.slice(index + 1).forEach((otherObject) => {
            if (!objectsOverlap(object, otherObject)) {
              return;
            }

            otherObject.x = clamp(
              otherObject.x + otherObject.width / 2 + 2,
              0,
              Math.max(0, venueLength - otherObject.width),
            );
            otherObject.y = clamp(
              otherObject.y + otherObject.height / 2 + 2,
              0,
              Math.max(0, venueWidth - otherObject.height),
            );
          });
        });
      }

      return nextObjects;
    });
  };

  const downloadSnapshot = async () => {
    const svg = svgRef.current;

    if (!svg) {
      return;
    }

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("viewBox", `0 0 ${venueLength} ${snapshotHeight}`);
    clone.setAttribute("width", "2000");
    clone.setAttribute(
      "height",
      `${Math.round((2000 * snapshotHeight) / venueLength)}`,
    );

    clone
      .querySelectorAll("[data-editor-only='true']")
      .forEach((node) => node.remove());
    clone.querySelectorAll("[data-snapshot-only='true']").forEach((node) => {
      node.removeAttribute("display");
      node.setAttribute("opacity", "1");
    });

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(clone);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;

      const context = canvas.getContext("2d");
      context?.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);

      const link = document.createElement("a");
      link.download = "wedding-layout-ai-reference.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    };

    image.src = url;
  };

  const handleCanvasDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const productIdRaw = event.dataTransfer.getData(PLANNER_PRODUCT_DRAG_TYPE);
    const productMasterId = Number(productIdRaw);

    if (!productIdRaw || !Number.isFinite(productMasterId)) {
      return;
    }

    event.preventDefault();

    const point = getPointInVenue(event.clientX, event.clientY);
    const template = productTemplateMap.get(productMasterId);
    const fixed = template
      ? resolveObjectDimensions(template)
      : { width: 0, height: 0 };

    void placeProduct(productMasterId, {
      x: point.x - fixed.width / 2,
      y: point.y - fixed.height / 2,
    });
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col text-[#1f2520]">
      <div className="mx-auto grid w-full max-w-[1540px] flex-1 grid-cols-1 gap-4 px-4 pb-4 lg:min-h-0 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)_minmax(0,320px)] lg:overflow-hidden">
        <aside className="flex min-h-0 flex-col gap-4 overflow-hidden rounded-lg border border-[#d8d1c3] bg-white p-4 shadow-sm">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b715f]">
              Wedding Layout
            </p>
            <h1 className="mt-2 text-2xl font-semibold">2D event planner</h1>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Venue size</h2>
              <span className="rounded-md bg-[#eef3ea] px-2 py-1 text-xs font-medium text-[#45614c]">
                {venueAreaSqFt} sq ft
              </span>
            </div>

            <NumberField
              label="Length"
              value={venueLength}
              min={5}
              max={180}
              suffix="ft"
              onChange={handleVenueLengthChange}
            />
            <NumberField
              label="Width"
              value={venueWidth}
              min={5}
              max={120}
              suffix="ft"
              onChange={handleVenueWidthChange}
            />

            {venueTooSmallForCatalog ? (
              <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-xs text-[#92400e]">
                Small venue — place items then drag corner handles to resize
                them down. Default sizes: chair 4×4 ft, sofa 14×6 ft, mandap
                16×16 ft.
              </div>
            ) : null}

            {placementError ? (
              <div className="rounded-lg border border-[#f1c0c0] bg-[#fff5f5] px-3 py-2 text-xs text-[#9b1c1c]">
                {placementError}
              </div>
            ) : null}
          </section>

          <ProductMasterPanel
            onProductsChange={setProducts}
            onAddToCanvas={(productId) => void placeProduct(productId)}
          />
          </div>

          <div className="flex shrink-0 gap-2 border-t border-[#ebe5da] pt-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={resetLayout}
              title="Reset layout"
            >
              <RotateCcw />
              Reset
            </Button>
            <Button
              type="button"
              className="flex-1 bg-[#315c4b] text-white hover:bg-[#25483b]"
              onClick={downloadSnapshot}
              title="Download AI reference snapshot"
            >
              <Download />
              Snapshot
            </Button>
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d8d1c3] bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-[#4e594c]">
              <Move className="size-4" />
              <span>{objects.length} placed objects</span>
              <span className="h-4 w-px bg-[#d8d1c3]" />
              <span>{selectedIds.length} selected</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-[#5f665d]">
              {overlapIds.size > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resolveOverlaps}
                  title="Move overlapping objects apart"
                >
                  <BadgeCheck />
                  Separate overlaps
                </Button>
              ) : null}
              <span>{venueLength} ft length</span>
              <span className="h-4 w-px bg-[#d8d1c3]" />
              <span>{venueWidth} ft width</span>
            </div>
          </div>

          <div
            className="relative min-h-[420px] w-full flex-1 overflow-hidden rounded-lg border border-[#cfc6b6] bg-[#fffdf8]"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleCanvasDrop}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_VIEW_SIZE} ${CANVAS_VIEW_SIZE}`}
              width="100%"
              height="100%"
              preserveAspectRatio="none"
              role="img"
              aria-label="Wedding event layout canvas"
              className="absolute inset-0 block h-full w-full touch-none select-none"
              onPointerMove={moveOrResizeObject}
              onPointerUp={finishInteraction}
              onPointerCancel={finishInteraction}
              onPointerDown={() => setSelectedIds([])}
            >
              <rect
                x="0"
                y="0"
                width={CANVAS_VIEW_SIZE}
                height={CANVAS_VIEW_SIZE}
                fill="#fffdf8"
              />

              {gridLines.map((line) =>
                line.axis === "x" ? (
                  <line
                    key={`x-${line.value}`}
                    x1={line.value}
                    x2={line.value}
                    y1="0"
                    y2={CANVAS_VIEW_SIZE}
                    stroke={line.major ? "#ded6c7" : "#eee9df"}
                    strokeWidth={line.major ? 1.2 : 0.8}
                  />
                ) : (
                  <line
                    key={`y-${line.value}`}
                    x1="0"
                    x2={CANVAS_VIEW_SIZE}
                    y1={line.value}
                    y2={line.value}
                    stroke={line.major ? "#ded6c7" : "#eee9df"}
                    strokeWidth={line.major ? 1.2 : 0.8}
                  />
                ),
              )}

              <rect
                x="4"
                y="4"
                width={CANVAS_VIEW_SIZE - 8}
                height={CANVAS_VIEW_SIZE - 8}
                fill="none"
                stroke="#cfc6b6"
                strokeWidth="2"
              />

              {objects.map((object, index) => (
                <PlannerShape
                  key={object.id}
                  object={object}
                  index={index + 1}
                  venueLength={venueLength}
                  venueWidth={venueWidth}
                  selected={selectedIdSet.has(object.id)}
                  overlapping={overlapIds.has(object.id)}
                  onPointerDown={startObjectMove}
                  onResizeStart={startResize}
                />
              ))}

              <SnapshotLegend
                objects={objects}
                y={venueWidth + 13}
                venueLength={venueLength}
                venueWidth={venueWidth}
                overlapIds={overlapIds}
              />
            </svg>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-4 overflow-hidden rounded-lg border border-[#d8d1c3] bg-white p-4 shadow-sm">
          <EventProductsPanel
            ref={eventProductsRef}
            eventId={eventId}
            canvasPlacements={canvasPlacements}
            selectedCanvasIds={selectedIds}
            productCatalog={products}
            venueAreaSqFt={venueAreaSqFt}
            onSelectCanvas={selectObject}
            onPlaceOnCanvas={(productId, quantity) =>
              placeProductsForQuantity(productId, quantity, {
                syncToEvent: false,
              })
            }
            onRemoveFromCanvas={removeObjectsByMasterId}
            onContinue={onContinue}
          />
        </aside>
      </div>
    </main>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[#5c6659]">{label}</span>
      <span className="flex h-9 items-center rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] focus-within:border-[#66835d] focus-within:ring-2 focus-within:ring-[#66835d]/20">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : min}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm font-medium outline-none"
        />
        <span className="px-3 text-xs font-semibold text-[#6f756a]">
          {suffix}
        </span>
      </span>
    </label>
  );
}

function PlannerShape({
  object,
  index,
  venueLength,
  venueWidth,
  selected,
  overlapping,
  onPointerDown,
  onResizeStart,
}: {
  object: PlannerObject;
  index: number;
  venueLength: number;
  venueWidth: number;
  selected: boolean;
  overlapping: boolean;
  onPointerDown: (
    event: React.PointerEvent<SVGGElement>,
    object: PlannerObject,
  ) => void;
  onResizeStart: (
    event: React.PointerEvent<SVGCircleElement>,
    object: PlannerObject,
    handle: ResizeHandle,
  ) => void;
}) {
  const display = objectToDisplay(object, venueLength, venueWidth);
  const centerX = display.x + display.width / 2;
  const centerY = display.y + display.height / 2;
  const uiUnit = CANVAS_VIEW_SIZE / 100;
  const badgeRadius = Math.max(3.5, uiUnit * 1.4);
  const badgeOffset = badgeRadius + uiUnit * 0.35;
  const labelSize = Math.max(7.5, uiUnit * 2.8);
  const dimensionSize = Math.max(6, uiUnit * 2.1);
  const selectionPadding = Math.max(2.5, uiUnit * 0.8);
  const selectionStroke = Math.max(1.2, uiUnit * 0.18);
  const handleRadius = Math.max(2.2, uiUnit * 1.1);
  const handleStroke = Math.max(0.8, uiUnit * 0.14);

  return (
    <g
      transform={`rotate(${object.rotation} ${centerX} ${centerY})`}
      onPointerDown={(event) => onPointerDown(event, object)}
      className="cursor-grab active:cursor-grabbing"
    >
      <rect
        x={display.x}
        y={display.y}
        width={display.width}
        height={display.height}
        rx={Math.min(8, display.width / 8, display.height / 8)}
        fill={object.fill}
        fillOpacity={overlapping ? 0.78 : 0.95}
        stroke={selected ? "#111827" : overlapping ? "#b91c1c" : object.stroke}
        strokeWidth={selected ? selectionStroke * 1.2 : overlapping ? selectionStroke : selectionStroke * 0.8}
      />

      <ObjectIllustration object={display} />

      <circle
        cx={display.x + badgeOffset}
        cy={display.y + badgeOffset}
        r={badgeRadius}
        fill="#1f2937"
        stroke="#fffdf8"
        strokeWidth={Math.max(0.8, uiUnit * 0.12)}
      />
      <text
        x={display.x + badgeOffset}
        y={display.y + badgeOffset}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Arial, sans-serif"
        fontSize={Math.max(0.65, badgeRadius * 1.05)}
        fontWeight="700"
        fill="#ffffff"
      >
        {index}
      </text>

      <text
        x={centerX}
        y={centerY - uiUnit * 0.9}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Arial, sans-serif"
        fontSize={labelSize}
        fontWeight="700"
        fill="#1f2520"
        paintOrder="stroke"
        stroke="#fffdf8"
        strokeWidth={Math.max(0.08, uiUnit * 0.16)}
      >
        {object.label}
      </text>

      <text
        x={centerX}
        y={centerY + uiUnit * 1.1}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Arial, sans-serif"
        fontSize={dimensionSize}
        fontWeight="700"
        fill="#374151"
        paintOrder="stroke"
        stroke="#fffdf8"
        strokeWidth={Math.max(0.06, uiUnit * 0.12)}
      >
        {formatNumber(object.width)} x {formatNumber(object.height)} ft
      </text>

      {overlapping ? (
        <text
          x={centerX}
          y={display.y - uiUnit * 1.2}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Arial, sans-serif"
          fontSize={Math.max(0.7, uiUnit * 2.2)}
          fontWeight="700"
          fill="#b91c1c"
          paintOrder="stroke"
          stroke="#fffdf8"
          strokeWidth={Math.max(0.06, uiUnit * 0.12)}
        >
          overlap
        </text>
      ) : null}

      {selected ? (
        <g data-editor-only="true">
          <rect
            x={display.x - selectionPadding}
            y={display.y - selectionPadding}
            width={display.width + selectionPadding * 2}
            height={display.height + selectionPadding * 2}
            rx={Math.max(4, uiUnit * 0.8)}
            fill="none"
            stroke="#111827"
            strokeDasharray={`${uiUnit * 1.5} ${uiUnit * 1.1}`}
            strokeWidth={selectionStroke}
            pointerEvents="none"
          />
          {resizeHandles.map((item) => {
            const point = item.getPoint(display);

            return (
              <circle
                key={item.handle}
                cx={point.x}
                cy={point.y}
                r={handleRadius}
                fill="#ffffff"
                stroke="#111827"
                strokeWidth={handleStroke}
                style={{ cursor: item.cursor }}
                onPointerDown={(event) =>
                  onResizeStart(event, object, item.handle)
                }
              />
            );
          })}
        </g>
      ) : null}
    </g>
  );
}

function ObjectIllustration({ object }: { object: PlannerObject }) {
  const category = normalizeProductCategory(object.category) ?? "";
  const nameLower = object.label.toLowerCase();
  const resolvedCategory =
    nameLower.includes("sofa")
      ? "sofa"
      : nameLower.includes("mandap")
        ? "mandap"
        : nameLower.includes("chair") || nameLower.includes("seat")
          ? "seating"
          : category;

  if (resolvedCategory === "seating") {
    return (
      <>
        <rect
          x={object.x + object.width * 0.18}
          y={object.y + object.height * 0.18}
          width={object.width * 0.64}
          height={object.height * 0.38}
          rx="0.45"
          fill={object.accent}
          stroke={object.stroke}
          strokeWidth="0.25"
        />
        <line
          x1={object.x + object.width * 0.23}
          x2={object.x + object.width * 0.77}
          y1={object.y + object.height * 0.72}
          y2={object.y + object.height * 0.72}
          stroke={object.stroke}
          strokeWidth="0.35"
        />
      </>
    );
  }

  if (resolvedCategory === "stage" || resolvedCategory === "dance") {
    const pad = Math.min(object.width, object.height) * 0.06;

    return (
      <>
        <rect
          x={object.x + pad}
          y={object.y + pad}
          width={Math.max(0, object.width - pad * 2)}
          height={Math.max(0, object.height - pad * 2)}
          rx={pad * 0.75}
          fill={object.accent}
          opacity="0.75"
        />
        <path
          d={`M ${object.x + pad * 1.5} ${object.y + object.height - pad} C ${
            object.x + object.width / 2
          } ${object.y + object.height + pad * 0.8} ${object.x + object.width - pad * 1.5} ${
            object.y + object.height - pad
          }`}
          fill="none"
          stroke={object.stroke}
          strokeWidth={Math.max(0.35, pad * 0.12)}
        />
      </>
    );
  }

  if (
    resolvedCategory === "sofa" ||
    resolvedCategory === "furniture" ||
    resolvedCategory === "dining" ||
    resolvedCategory === "dj"
  ) {
    return (
      <>
        <rect
          x={object.x + object.width * 0.08}
          y={object.y + object.height * 0.24}
          width={object.width * 0.84}
          height={object.height * 0.44}
          rx="1"
          fill={object.accent}
          stroke={object.stroke}
          strokeWidth="0.25"
        />
        <line
          x1={object.x + object.width / 2}
          x2={object.x + object.width / 2}
          y1={object.y + object.height * 0.25}
          y2={object.y + object.height * 0.7}
          stroke={object.stroke}
          strokeWidth="0.25"
        />
      </>
    );
  }

  if (
    resolvedCategory === "backdrop" ||
    resolvedCategory === "background" ||
    resolvedCategory === "decor" ||
    resolvedCategory === "mandap"
  ) {
    const dotCount = resolvedCategory === "mandap" ? 10 : 7;

    return (
      <>
        {Array.from({ length: dotCount }).map((_, index) => {
            const cx =
              object.x +
              ((index + 0.7) / (resolvedCategory === "mandap" ? 10.4 : 7.4)) *
                object.width;
            const cy =
              object.y + object.height * (index % 2 === 0 ? 0.32 : 0.68);

            return (
              <circle
                key={index}
                cx={cx}
                cy={cy}
                r={Math.max(0.35, Math.min(object.width, object.height) * 0.11)}
                fill={index % 2 === 0 ? "#fff7cc" : object.accent}
                stroke={object.stroke}
                strokeWidth="0.18"
              />
            );
          },
        )}
      </>
    );
  }

  if (resolvedCategory === "aisle") {
    const pad = Math.min(object.width, object.height) * 0.08;

    return (
      <>
        <line
          x1={object.x + object.width / 2}
          x2={object.x + object.width / 2}
          y1={object.y + pad}
          y2={object.y + object.height - pad}
          stroke={object.stroke}
          strokeDasharray={`${pad * 0.8} ${pad * 0.8}`}
          strokeWidth={Math.max(0.35, pad * 0.12)}
        />
        <circle
          cx={object.x + object.width / 2}
          cy={object.y + object.height / 2}
          r={Math.max(0.8, pad * 0.35)}
          fill={object.stroke}
        />
      </>
    );
  }

  return (
    <rect
      x={object.x + object.width * 0.12}
      y={object.y + object.height * 0.12}
      width={object.width * 0.76}
      height={object.height * 0.76}
      rx="0.6"
      fill={object.accent}
      stroke={object.stroke}
      strokeWidth="0.25"
      opacity="0.85"
    />
  );
}

function SnapshotLegend({
  objects,
  y,
  venueLength,
  venueWidth,
  overlapIds,
}: {
  objects: PlannerObject[];
  y: number;
  venueLength: number;
  venueWidth: number;
  overlapIds: Set<string>;
}) {
  const legendTop = venueWidth + 1;
  const rowGap = 4.5;

  return (
    <g data-snapshot-only="true" display="none" opacity="0">
      <rect
        x="0"
        y={legendTop}
        width={venueLength}
        height={14 + objects.length * rowGap}
        fill="#ffffff"
        stroke="#d8d1c3"
        strokeWidth="0.25"
      />
      <text
        x="2"
        y={legendTop + 4}
        fontFamily="Arial, sans-serif"
        fontSize="2"
        fontWeight="700"
        fill="#1f2520"
      >
        AI layout reference details
      </text>
      <text
        x="2"
        y={legendTop + 8}
        fontFamily="Arial, sans-serif"
        fontSize="1.45"
        fill="#4b5563"
      >
        Venue: {venueLength} ft x {venueWidth} ft. Objects are numbered on the
        plan. Red outline means overlapping placement.
      </text>
      {objects.map((object, index) => (
        <text
          key={object.id}
          x="2"
          y={y + index * rowGap}
          fontFamily="Arial, sans-serif"
          fontSize="1.55"
          fill={overlapIds.has(object.id) ? "#b91c1c" : "#1f2937"}
        >
          {index + 1}. {object.label}: {formatNumber(object.width)} ft x{" "}
          {formatNumber(object.height)} ft, position x {formatNumber(object.x)}{" "}
          ft y {formatNumber(object.y)} ft, rotation {object.rotation} deg
        </text>
      ))}
    </g>
  );
}

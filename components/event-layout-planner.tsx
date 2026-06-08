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
import {
  type ProductMasterRecord,
  type VenueRecord,
  uploadVenueLayout,
} from "@/lib/api";
import {
  buildProductTemplateMap,
  clampObjectSize,
  getCatalogDimensions,
  getInitialPlacementDimensions,
  getResizeLimits,
  normalizeProductCategory,
  PLANNER_PRODUCT_DRAG_TYPE,
  productFitsVenue,
  type PlannerObjectKind,
  type PlannerTemplate,
} from "@/lib/product-master-planner";

const CANVAS_VIEW_SIZE = 1000;
const MIN_VENUE_FT = 5;
const MAX_VENUE_LENGTH_FT = 500;
const MAX_VENUE_WIDTH_FT = 500;
const DEFAULT_PLACEMENT_GAP_FT = 4;
function prepareSnapshotClone(
  svg: SVGSVGElement,
  snapshotWidth: number,
  snapshotHeight: number,
) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `0 0 ${snapshotWidth} ${snapshotHeight}`);
  clone.setAttribute("width", "2000");
  clone.setAttribute(
    "height",
    `${Math.round((2000 * snapshotHeight) / snapshotWidth)}`,
  );

  clone
    .querySelectorAll("[data-editor-only='true']")
    .forEach((node) => node.remove());
  clone
    .querySelectorAll("[data-canvas-only='true']")
    .forEach((node) => node.remove());
  clone.querySelectorAll("[data-layout-only='true']").forEach((node) => {
    node.removeAttribute("display");
    node.removeAttribute("style");
  });
  clone.querySelectorAll("g[opacity]").forEach((node) => {
    node.setAttribute("opacity", "1");
  });

  return clone;
}

async function renderSvgCloneToPngBlob(clone: SVGSVGElement): Promise<Blob> {
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(clone);
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to load SVG layout image"));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to get 2D context");
    }

    context.drawImage(image, 0, 0);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error("Canvas toBlob failed"));
        }
      }, "image/png");
    });

    return pngBlob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

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

function objectToVisualDisplay(
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

function displayBoxesOverlap(
  first: Pick<PlannerObject, "x" | "y" | "width" | "height">,
  second: Pick<PlannerObject, "x" | "y" | "width" | "height">,
) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function intersectionBox(
  first: Pick<PlannerObject, "x" | "y" | "width" | "height">,
  second: Pick<PlannerObject, "x" | "y" | "width" | "height">,
) {
  const x = Math.max(first.x, second.x);
  const y = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  const width = right - x;
  const height = bottom - y;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}

type OverlapInfo = {
  /** IDs of all objects this object overlaps with */
  overlappingWith: string[];
  /**
   * true  → this object is "on top" (smaller area or placed later)
   *         → render with reduced opacity so the object beneath shows through
   * false → this object is the background (larger or placed earlier)
   */
  isTopObject: boolean;
  /** How many objects are in this overlap cluster (for the count badge) */
  clusterSize: number;
  /** Show the cluster-count badge on top of this object */
  showClusterBadge: boolean;
};

function computeOverlapInfo(
  objects: PlannerObject[],
  venueLength: number,
  venueWidth: number,
): Map<string, OverlapInfo> {
  const visuals = objects.map((object) => {
    const visual = objectToVisualDisplay(object, venueLength, venueWidth);
    return {
      id: object.id,
      x: visual.x,
      y: visual.y,
      width: visual.width,
      height: visual.height,
      area: visual.width * visual.height,
      arrayIndex: objects.findIndex((o) => o.id === object.id),
    };
  });

  // Union-Find for cluster grouping
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const cur = parent.get(id) ?? id;
    if (cur === id) return id;
    const root = find(cur);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  visuals.forEach((v) => parent.set(v.id, v.id));

  // Collect pairwise overlaps
  const pairOverlaps: Array<[string, string]> = [];
  visuals.forEach((v, i) => {
    visuals.slice(i + 1).forEach((other) => {
      if (displayBoxesOverlap(v, other)) {
        pairOverlaps.push([v.id, other.id]);
        union(v.id, other.id);
      }
    });
  });

  // Build per-id: who am I overlapping with?
  const overlappingWithMap = new Map<string, Set<string>>();
  visuals.forEach((v) => overlappingWithMap.set(v.id, new Set()));
  pairOverlaps.forEach(([a, b]) => {
    overlappingWithMap.get(a)!.add(b);
    overlappingWithMap.get(b)!.add(a);
  });

  // Build clusters
  const clusters = new Map<string, string[]>();
  visuals.forEach((v) => {
    const root = find(v.id);
    const members = clusters.get(root) ?? [];
    members.push(v.id);
    clusters.set(root, members);
  });

  const result = new Map<string, OverlapInfo>();

  clusters.forEach((memberIds) => {
    if (memberIds.length < 2) return;

    // Sort by area DESC, then by array index ASC (larger/earlier = background)
    const sorted = [...memberIds].sort((a, b) => {
      const va = visuals.find((v) => v.id === a)!;
      const vb = visuals.find((v) => v.id === b)!;
      if (vb.area !== va.area) return vb.area - va.area; // bigger area first
      return va.arrayIndex - vb.arrayIndex; // earlier placement first
    });

    // The LAST in sorted order is the "top" object (smallest / placed last)
    const topId = sorted[sorted.length - 1];

    memberIds.forEach((id) => {
      result.set(id, {
        overlappingWith: Array.from(overlappingWithMap.get(id) ?? []),
        isTopObject: id === topId,
        clusterSize: memberIds.length,
        showClusterBadge: id === topId,
      });
    });
  });

  return result;
}

function hasVisualOverlap(
  candidate: PlannerObject,
  existingObjects: PlannerObject[],
  venueLength: number,
  venueWidth: number,
  padding = 6,
): boolean {
  const candidateVisual = objectToVisualDisplay(candidate, venueLength, venueWidth);
  const paddedCandidate = {
    x: candidateVisual.x - padding,
    y: candidateVisual.y - padding,
    width: candidateVisual.width + padding * 2,
    height: candidateVisual.height + padding * 2,
  };

  return existingObjects.some((object) => {
    const visual = objectToVisualDisplay(object, venueLength, venueWidth);
    return displayBoxesOverlap(paddedCandidate, visual);
  });
}

function findOpenPlacementPosition(
  template: PlannerTemplate,
  catalog: { width: number; height: number },
  existingObjects: PlannerObject[],
  venueLength: number,
  venueWidth: number,
  preferred?: Point,
): Point {
  const clampPosition = (x: number, y: number): Point => ({
    x: clamp(x, 0, Math.max(0, venueLength - catalog.width)),
    y: clamp(y, 0, Math.max(0, venueWidth - catalog.height)),
  });

  const makeCandidate = (x: number, y: number): PlannerObject => {
    const position = clampPosition(x, y);
    return {
      ...template,
      ...catalog,
      id: "candidate",
      x: position.x,
      y: position.y,
      rotation: 0,
    };
  };

  const isFree = (x: number, y: number) =>
    !hasVisualOverlap(
      makeCandidate(x, y),
      existingObjects,
      venueLength,
      venueWidth,
    );

  if (preferred) {
    const preferredPosition = clampPosition(preferred.x, preferred.y);
    if (isFree(preferredPosition.x, preferredPosition.y)) {
      return preferredPosition;
    }
  } else {
    const centerPosition = clampPosition(
      venueLength / 2 - catalog.width / 2,
      venueWidth / 2 - catalog.height / 2,
    );
    if (isFree(centerPosition.x, centerPosition.y)) {
      return centerPosition;
    }
  }

  const gridSlots =
    Math.max(
      1,
      Math.ceil(venueLength / Math.max(catalog.width, 4)),
    ) *
    Math.max(
      1,
      Math.ceil(venueWidth / Math.max(catalog.height, 4)),
    );

  for (let index = 0; index < gridSlots + existingObjects.length; index += 1) {
    const position = getGridPosition(
      index,
      catalog.width,
      catalog.height,
      venueLength,
      venueWidth,
    );
    if (isFree(position.x, position.y)) {
      return position;
    }
  }

  const step = Math.max(catalog.width, catalog.height, 6);
  const centerX = venueLength / 2 - catalog.width / 2;
  const centerY = venueWidth / 2 - catalog.height / 2;

  for (let ring = 1; ring <= 24; ring += 1) {
    for (let angle = 0; angle < 8; angle += 1) {
      const radians = (angle * Math.PI) / 4;
      const position = clampPosition(
        centerX + Math.cos(radians) * ring * step,
        centerY + Math.sin(radians) * ring * step,
      );
      if (isFree(position.x, position.y)) {
        return position;
      }
    }
  }

  const lastObject = existingObjects[existingObjects.length - 1];
  if (lastObject) {
    const offsetPosition = clampPosition(
      lastObject.x + lastObject.width + 2,
      lastObject.y,
    );
    if (isFree(offsetPosition.x, offsetPosition.y)) {
      return offsetPosition;
    }
  }

  return getGridPosition(
    existingObjects.length,
    catalog.width,
    catalog.height,
    venueLength,
    venueWidth,
  );
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

const formatNumber = (value: number) => Number(value.toFixed(1));

function getHandleDisplayPoint(
  object: PlannerObject,
  handle: ResizeHandle,
  venueLength: number,
  venueWidth: number,
): Point {
  const config = resizeHandles.find((entry) => entry.handle === handle);
  if (!config) {
    return { x: 0, y: 0 };
  }

  const feetPoint = config.getPoint(object);
  return {
    x: toDisplayX(feetPoint.x, venueLength),
    y: toDisplayY(feetPoint.y, venueWidth),
  };
}

function getGridPosition(
  index: number,
  objectWidth: number,
  objectHeight: number,
  venueLength: number,
  venueWidth: number,
): Point {
  const gap = DEFAULT_PLACEMENT_GAP_FT;
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
  onContinue?: (venue: VenueRecord) => void | Promise<void>;
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
  const interactionRef = React.useRef<InteractionState | null>(null);
  interactionRef.current = interaction;
  const [placementError, setPlacementError] = React.useState<string | null>(
    null,
  );
  const [isContinuing, setIsContinuing] = React.useState(false);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const eventProductsRef = React.useRef<EventProductsPanelHandle | null>(null);
  const restoredPlanRef = React.useRef(false);
  const initialObjectsRef = React.useRef(initialPlanObjects);
  const skipPlanSyncRef = React.useRef(Boolean(initialPlanObjects?.length));

  if (initialPlanObjects?.length && !initialObjectsRef.current?.length) {
    initialObjectsRef.current = initialPlanObjects;
    skipPlanSyncRef.current = true;
  }
  const selectedIdSet = React.useMemo(
    () => new Set(selectedIds),
    [selectedIds],
  );

  const overlapInfoMap = React.useMemo(
    () => computeOverlapInfo(objects, venueLength, venueWidth),
    [objects, venueLength, venueWidth],
  );
  const overlapIds = React.useMemo(() => {
    const ids = new Set<string>();
    overlapInfoMap.forEach((_, id) => ids.add(id));
    return ids;
  }, [overlapInfoMap]);

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

  const venueAreaSqFt = venueLength * venueWidth;

  const resolveObjectDimensions = React.useCallback(
    (template: PlannerTemplate) =>
      getInitialPlacementDimensions(
        template.category,
        template.label,
        venueLength,
        venueWidth,
      ),
    [venueLength, venueWidth],
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
    if (!onPlanChange || skipPlanSyncRef.current) return;
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
    const objectsToRestore = initialObjectsRef.current;

    if (
      restoredPlanRef.current ||
      !objectsToRestore?.length ||
      productTemplateMap.size === 0
    ) {
      return;
    }

    restoredPlanRef.current = true;

    const restoredObjects = objectsToRestore.flatMap((savedObject) => {
      const template = productTemplateMap.get(savedObject.productMasterId);
      if (!template) return [];

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
    });

    skipPlanSyncRef.current = false;

    if (restoredObjects.length > 0) {
      setObjects(restoredObjects);
    }
  }, [
    productTemplateMap,
    getLimitsForTemplate,
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

      const placement = findOpenPlacementPosition(
        template,
        catalog,
        objects,
        venueLength,
        venueWidth,
        position,
      );

      const nextObject: PlannerObject = {
        ...template,
        ...catalog,
        id: makeObjectId(productMasterId),
        x: placement.x,
        y: placement.y,
        rotation: 0,
      };

      setObjects((currentObjects) => [...currentObjects, nextObject]);
      setSelectedIds([nextObject.id]);
      return nextObject;
    },
    [objects, productTemplateMap, resolveObjectDimensions, venueLength, venueWidth],
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

      const placedObjects = [...objects];
      const newObjects: PlannerObject[] = Array.from({ length: toPlace }, () => {
        const position = findOpenPlacementPosition(
          template,
          catalog,
          placedObjects,
          venueLength,
          venueWidth,
        );

        const nextObject: PlannerObject = {
          ...template,
          ...catalog,
          id: makeObjectId(productMasterId),
          x: position.x,
          y: position.y,
          rotation: 0,
        };

        placedObjects.push(nextObject);
        return nextObject;
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
            rotation:
              ((patch.rotation ?? object.rotation) % 360 + 360) % 360,
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
    if (!Number.isFinite(value)) return;
    const nextLength = clamp(value, MIN_VENUE_FT, MAX_VENUE_LENGTH_FT);
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
    if (!Number.isFinite(value)) return;
    const nextWidth = clamp(value, MIN_VENUE_FT, MAX_VENUE_WIDTH_FT);
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

  const rotateObject90 = React.useCallback(
    (objectId: string) => {
      const object = objects.find((item) => item.id === objectId);
      if (!object) return;

      updateObject(objectId, {
        rotation: (object.rotation + 90) % 360,
      });
    },
    [objects, updateObject],
  );

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
    svgRef.current?.setPointerCapture(event.pointerId);
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
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const applyInteractionMove = React.useCallback(
    (clientX: number, clientY: number) => {
      const activeInteraction = interactionRef.current;
      if (!activeInteraction) {
        return;
      }

      const point = getPointInVenue(clientX, clientY);

      if (activeInteraction.type === "move") {
        const deltaX = point.x - activeInteraction.startPoint.x;
        const deltaY = point.y - activeInteraction.startPoint.y;

        setObjects((currentObjects) =>
          currentObjects.map((object) => {
            const original = activeInteraction.originals[object.id];

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

      const deltaX = point.x - activeInteraction.startPoint.x;
      const deltaY = point.y - activeInteraction.startPoint.y;
      const { original, handle } = activeInteraction;
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

      updateObject(activeInteraction.id, next);
    },
    [getPointInVenue, updateObject, venueLength, venueWidth],
  );

  React.useEffect(() => {
    if (!interaction) {
      return;
    }

    const pointerId = interaction.pointerId;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      applyInteractionMove(event.clientX, event.clientY);
    };

    const finishPointer = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      setInteraction(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishPointer);
    window.addEventListener("pointercancel", finishPointer);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPointer);
      window.removeEventListener("pointercancel", finishPointer);
    };
  }, [interaction, applyInteractionMove]);

  const moveOrResizeObject = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!interactionRef.current) {
      return;
    }

    applyInteractionMove(event.clientX, event.clientY);
  };

  const finishInteraction = (event: React.PointerEvent<SVGSVGElement>) => {
    if (interactionRef.current?.pointerId === event.pointerId) {
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
          const visual = objectToVisualDisplay(object, venueLength, venueWidth);

          nextObjects.slice(index + 1).forEach((otherObject) => {
            const otherVisual = objectToVisualDisplay(
              otherObject,
              venueLength,
              venueWidth,
            );

            if (!displayBoxesOverlap(visual, otherVisual)) {
              return;
            }

            const shiftDisplayX =
              (visual.x + visual.width / 2 - otherVisual.x - otherVisual.width / 2) *
              0.5;
            const shiftDisplayY =
              (visual.y + visual.height / 2 - otherVisual.y - otherVisual.height / 2) *
              0.5;

            otherObject.x = clamp(
              otherObject.x + toFeetX(shiftDisplayX, venueLength),
              0,
              Math.max(0, venueLength - otherObject.width),
            );
            otherObject.y = clamp(
              otherObject.y + toFeetY(shiftDisplayY, venueWidth),
              0,
              Math.max(0, venueWidth - otherObject.height),
            );
          });
        });
      }

      return nextObjects;
    });
  };

  const handleContinue = async () => {
    if (isContinuing) return;
    setIsContinuing(true);

    try {
      await eventProductsRef.current?.syncCanvasPlacements(canvasPlacements);

      const svg = svgRef.current;
      if (!svg) {
        throw new Error("SVG element not found");
      }

      const clone = prepareSnapshotClone(svg, CANVAS_VIEW_SIZE, CANVAS_VIEW_SIZE);
      const pngBlob = await renderSvgCloneToPngBlob(clone);
      const updatedVenue = await uploadVenueLayout(eventId, pngBlob);
      await onContinue?.(updatedVenue);
    } catch (err) {
      console.error("Error generating/uploading layout snapshot:", err);
    } finally {
      setIsContinuing(false);
    }
  };

  const downloadSnapshot = async () => {
    const svg = svgRef.current;

    if (!svg) {
      return;
    }

    try {
      const clone = prepareSnapshotClone(svg, CANVAS_VIEW_SIZE, CANVAS_VIEW_SIZE);
      const pngBlob = await renderSvgCloneToPngBlob(clone);
      const url = URL.createObjectURL(pngBlob);

      try {
        const link = document.createElement("a");
        link.download = "wedding-layout.png";
        link.href = url;
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Error generating layout snapshot:", err);
    }
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
                min={MIN_VENUE_FT}
                max={MAX_VENUE_LENGTH_FT}
                suffix="ft"
                onChange={handleVenueLengthChange}
              />
              <NumberField
                label="Width"
                value={venueWidth}
                min={MIN_VENUE_FT}
                max={MAX_VENUE_WIDTH_FT}
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
              onClick={() => void downloadSnapshot()}
              title="Download layout PNG"
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

              {/* Render large objects first (bottom layer) so smaller ones appear on top.
                  The smaller / top object is given opacity 0.8 so the background shows through. */}
              {React.useMemo(() => {
                // Build [{ object, originalIndex }] sorted by visual area DESC
                // (largest rendered first → sits at the bottom in SVG z-order)
                const indexed = objects.map((object, i) => ({
                  object,
                  originalIndex: i + 1,
                  area: (() => {
                    const v = objectToVisualDisplay(object, venueLength, venueWidth);
                    return v.width * v.height;
                  })(),
                }));
                // Only re-sort when there are actual overlaps; otherwise keep original order
                if (overlapIds.size === 0) {
                  return indexed;
                }
                return [...indexed].sort((a, b) => b.area - a.area);
              }, [objects, venueLength, venueWidth, overlapIds]).map(({ object, originalIndex }) => (
                <PlannerShape
                  key={object.id}
                  object={object}
                  index={originalIndex}
                  venueLength={venueLength}
                  venueWidth={venueWidth}
                  selected={selectedIdSet.has(object.id)}
                  overlapInfo={overlapInfoMap.get(object.id)}
                  onPointerDown={startObjectMove}
                  onResizeStart={startResize}
                  onRotate90={rotateObject90}
                />
              ))}

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
            onContinue={handleContinue}
            isContinuing={isContinuing}
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
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) {
              onChange(next);
            }
          }}
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
  overlapInfo,
  onPointerDown,
  onResizeStart,
  onRotate90,
}: {
  object: PlannerObject;
  index: number;
  venueLength: number;
  venueWidth: number;
  selected: boolean;
  overlapInfo?: OverlapInfo;
  onPointerDown: (
    event: React.PointerEvent<SVGGElement>,
    object: PlannerObject,
  ) => void;
  onResizeStart: (
    event: React.PointerEvent<SVGCircleElement>,
    object: PlannerObject,
    handle: ResizeHandle,
  ) => void;
  onRotate90: (objectId: string) => void;
}) {
  const display = objectToVisualDisplay(object, venueLength, venueWidth);
  const logicalLeft = toDisplayX(object.x, venueLength);
  const logicalTop = toDisplayY(object.y, venueWidth);
  const logicalWidth = toDisplayX(object.width, venueLength);
  const logicalHeight = toDisplayY(object.height, venueWidth);
  const rotationCenterX = logicalLeft + logicalWidth / 2;
  const rotationCenterY = logicalTop + logicalHeight / 2;
  const centerX = display.x + display.width / 2;
  const centerY = display.y + display.height / 2;
  const minDimension = Math.min(display.width, display.height);
  const uiUnit = CANVAS_VIEW_SIZE / 100;
  const badgeRadius = Math.min(
    Math.max(3, minDimension * 0.14),
    Math.max(3.5, uiUnit * 1.2),
  );
  const badgeOffset = badgeRadius + 1.5;
  const labelSize = Math.min(Math.max(4.5, minDimension * 0.16), 10);
  const dimensionSize = Math.min(Math.max(4, minDimension * 0.14), 9);
  const showDimensions = minDimension >= 28;
  const selectionPadding = Math.max(2.5, uiUnit * 0.8);
  const selectionStroke = Math.max(1.2, uiUnit * 0.18);
  const handleRadius = Math.max(3.5, uiUnit * 1.1);
  const rotateHandleOffset = handleRadius * 2.8;
  const rotateHandleY =
    logicalTop - selectionPadding - rotateHandleOffset;
  const cornerRadius = Math.min(8, display.width / 8, display.height / 8);
  const isOverlapping = Boolean(overlapInfo);
  // Top object = smaller/later → rendered on top naturally by SVG z-order → apply 0.8 opacity
  const isTopObject = overlapInfo?.isTopObject ?? false;

  return (
    <g
      transform={`rotate(${object.rotation} ${rotationCenterX} ${rotationCenterY})`}
      onPointerDown={(event) => onPointerDown(event, object)}
      className="cursor-grab active:cursor-grabbing"
      // Top overlapping object → semi-transparent so object beneath is visible
      opacity={isTopObject && !selected ? 0.8 : 1}
    >
      <rect
        x={display.x}
        y={display.y}
        width={display.width}
        height={display.height}
        rx={cornerRadius}
        fill={object.fill}
        fillOpacity={0.95}
        stroke={
          selected
            ? "#111827"
            : isOverlapping && !isTopObject
              ? object.stroke  // background object keeps its normal stroke
              : object.stroke
        }
        strokeWidth={
          selected
            ? selectionStroke * 1.2
            : selectionStroke * 0.8
        }
        pointerEvents="none"
      />

      <ObjectIllustration object={display} />

      {showDimensions ? (
        <text
          x={centerX}
          y={centerY}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Arial, sans-serif"
          fontSize={dimensionSize}
          fontWeight="600"
          fill="#1f2520"
          paintOrder="stroke"
          stroke="#fffdf8"
          strokeWidth={Math.max(0.4, dimensionSize * 0.15)}
          pointerEvents="none"
        >
          {formatNumber(object.width)} x {formatNumber(object.height)} ft
        </text>
      ) : null}

      <circle
        cx={display.x + badgeOffset}
        cy={display.y + badgeOffset}
        r={badgeRadius}
        fill="#1f2937"
        stroke="#fffdf8"
        strokeWidth={Math.max(0.8, uiUnit * 0.12)}
        pointerEvents="none"
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
        pointerEvents="none"
      >
        {index}
      </text>

      <text
        x={centerX}
        y={display.y + display.height + labelSize * 0.9}
        textAnchor="middle"
        dominantBaseline="hanging"
        fontFamily="Arial, sans-serif"
        fontSize={labelSize}
        fontWeight="600"
        fill="#1f2520"
        paintOrder="stroke"
        stroke="#fffdf8"
        strokeWidth={Math.max(0.5, labelSize * 0.18)}
        pointerEvents="none"
      >
        {object.label}
      </text>

      {/* Cluster badge on the top object showing how many are overlapping */}
      {overlapInfo?.showClusterBadge ? (
        <g pointerEvents="none">
          <rect
            x={display.x + display.width - minDimension * 0.42}
            y={display.y - minDimension * 0.18}
            width={minDimension * 0.5}
            height={minDimension * 0.22}
            rx={minDimension * 0.11}
            fill="#f59e0b"
          />
          <text
            x={display.x + display.width - minDimension * 0.17}
            y={display.y - minDimension * 0.07}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Arial, sans-serif"
            fontSize={Math.min(Math.max(4.5, minDimension * 0.13), 8)}
            fontWeight="700"
            fill="#ffffff"
          >
            {overlapInfo.clusterSize}×
          </text>
        </g>
      ) : null}

      <rect
        x={display.x}
        y={display.y}
        width={display.width}
        height={display.height}
        fill="transparent"
        pointerEvents={selected ? "none" : "all"}
      />

      {selected ? (
        <g data-editor-only="true">
          <rect
            x={logicalLeft - selectionPadding}
            y={logicalTop - selectionPadding}
            width={logicalWidth + selectionPadding * 2}
            height={logicalHeight + selectionPadding * 2}
            rx={Math.max(4, uiUnit * 0.8)}
            fill="none"
            stroke="#111827"
            strokeDasharray={`${uiUnit * 1.5} ${uiUnit * 1.1}`}
            strokeWidth={selectionStroke}
            pointerEvents="none"
          />

          {resizeHandles.map(({ handle, cursor }) => {
            const point = getHandleDisplayPoint(
              object,
              handle,
              venueLength,
              venueWidth,
            );

            return (
              <circle
                key={handle}
                cx={point.x}
                cy={point.y}
                r={handleRadius}
                fill="#ffffff"
                stroke="#111827"
                strokeWidth={Math.max(1, uiUnit * 0.14)}
                style={{ cursor }}
                onPointerDown={(event) => onResizeStart(event, object, handle)}
              />
            );
          })}

          <line
            x1={rotationCenterX}
            y1={logicalTop - selectionPadding}
            x2={rotationCenterX}
            y2={rotateHandleY + handleRadius}
            stroke="#111827"
            strokeWidth={Math.max(1, uiUnit * 0.12)}
            pointerEvents="none"
          />
          <g
            style={{ cursor: "pointer" }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRotate90(object.id);
            }}
          >
            <circle
              cx={rotationCenterX}
              cy={rotateHandleY}
              r={handleRadius}
              fill="#ffffff"
              stroke="#111827"
              strokeWidth={Math.max(1, uiUnit * 0.14)}
            />
            <path
              d={`M ${rotationCenterX - handleRadius * 0.35} ${rotateHandleY - handleRadius * 0.1}
                A ${handleRadius * 0.42} ${handleRadius * 0.42} 0 1 1 ${rotationCenterX + handleRadius * 0.35} ${rotateHandleY - handleRadius * 0.1}
                M ${rotationCenterX + handleRadius * 0.35} ${rotateHandleY - handleRadius * 0.1}
                L ${rotationCenterX + handleRadius * 0.55} ${rotateHandleY - handleRadius * 0.35}
                M ${rotationCenterX + handleRadius * 0.35} ${rotateHandleY - handleRadius * 0.1}
                L ${rotationCenterX + handleRadius * 0.55} ${rotateHandleY + handleRadius * 0.05}`}
              fill="none"
              stroke="#111827"
              strokeWidth={Math.max(0.8, uiUnit * 0.12)}
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          </g>
        </g>
      ) : null}
    </g>
  );
}

function ObjectIllustration({ object }: { object: PlannerObject }) {
  const inset = Math.min(object.width, object.height) * 0.06;
  const innerX = object.x + inset;
  const innerY = object.y + inset;
  const innerWidth = Math.max(0, object.width - inset * 2);
  const innerHeight = Math.max(0, object.height - inset * 2);

  return (
    <>
      <g
        data-layout-only="true"
        display={object.imageSrc ? "none" : undefined}
        pointerEvents="none"
      >
        <LayoutSchematic object={object} />
      </g>
      {object.imageSrc ? (
        <image
          data-canvas-only="true"
          href={object.imageSrc}
          x={innerX}
          y={innerY}
          width={innerWidth}
          height={innerHeight}
          preserveAspectRatio="xMidYMid meet"
          pointerEvents="none"
        />
      ) : null}
    </>
  );
}

function LayoutSchematic({ object }: { object: PlannerObject }) {
  const inset = Math.min(object.width, object.height) * 0.06;
  const innerX = object.x + inset;
  const innerY = object.y + inset;
  const innerWidth = Math.max(0, object.width - inset * 2);
  const innerHeight = Math.max(0, object.height - inset * 2);

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
    const seatWidth = innerWidth * 0.72;
    const seatHeight = innerHeight * 0.42;
    const seatX = innerX + (innerWidth - seatWidth) / 2;
    const seatY = innerY + innerHeight * 0.34;
    const backHeight = innerHeight * 0.36;

    return (
      <g pointerEvents="none">
        <rect
          x={seatX}
          y={innerY + innerHeight * 0.08}
          width={seatWidth}
          height={backHeight}
          rx={Math.max(0.8, innerWidth * 0.08)}
          fill={object.accent}
          stroke={object.stroke}
          strokeWidth={Math.max(0.2, innerWidth * 0.04)}
        />
        <rect
          x={seatX}
          y={seatY}
          width={seatWidth}
          height={seatHeight}
          rx={Math.max(0.8, innerWidth * 0.1)}
          fill={object.fill}
          stroke={object.stroke}
          strokeWidth={Math.max(0.2, innerWidth * 0.04)}
        />
        <line
          x1={seatX + seatWidth * 0.12}
          x2={seatX + seatWidth * 0.88}
          y1={seatY + seatHeight * 0.55}
          y2={seatY + seatHeight * 0.55}
          stroke={object.stroke}
          strokeWidth={Math.max(0.2, innerWidth * 0.035)}
        />
      </g>
    );
  }

  if (resolvedCategory === "stage" || resolvedCategory === "dance") {
    const pad = Math.min(innerWidth, innerHeight) * 0.08;

    return (
      <g pointerEvents="none">
        <rect
          x={innerX + pad}
          y={innerY + pad}
          width={Math.max(0, innerWidth - pad * 2)}
          height={Math.max(0, innerHeight - pad * 2)}
          rx={pad * 0.75}
          fill={object.accent}
          opacity="0.75"
        />
        <path
          d={`M ${innerX + pad * 1.5} ${innerY + innerHeight - pad} C ${innerX + innerWidth / 2
            } ${innerY + innerHeight + pad * 0.8} ${innerX + innerWidth - pad * 1.5} ${innerY + innerHeight - pad
            }`}
          fill="none"
          stroke={object.stroke}
          strokeWidth={Math.max(0.35, pad * 0.12)}
        />
      </g>
    );
  }

  if (
    resolvedCategory === "sofa" ||
    resolvedCategory === "furniture" ||
    resolvedCategory === "dining" ||
    resolvedCategory === "dj"
  ) {
    const bodyY = innerY + innerHeight * 0.18;
    const bodyHeight = innerHeight * 0.56;

    return (
      <g pointerEvents="none">
        <rect
          x={innerX + innerWidth * 0.04}
          y={bodyY}
          width={innerWidth * 0.92}
          height={bodyHeight}
          rx={Math.max(0.8, innerWidth * 0.06)}
          fill={object.accent}
          stroke={object.stroke}
          strokeWidth={Math.max(0.2, innerWidth * 0.03)}
        />
        <rect
          x={innerX + innerWidth * 0.08}
          y={innerY + innerHeight * 0.08}
          width={innerWidth * 0.18}
          height={innerHeight * 0.34}
          rx={Math.max(0.6, innerWidth * 0.04)}
          fill={object.fill}
          stroke={object.stroke}
          strokeWidth={Math.max(0.15, innerWidth * 0.025)}
        />
        <rect
          x={innerX + innerWidth * 0.74}
          y={innerY + innerHeight * 0.08}
          width={innerWidth * 0.18}
          height={innerHeight * 0.34}
          rx={Math.max(0.6, innerWidth * 0.04)}
          fill={object.fill}
          stroke={object.stroke}
          strokeWidth={Math.max(0.15, innerWidth * 0.025)}
        />
        <line
          x1={innerX + innerWidth / 2}
          x2={innerX + innerWidth / 2}
          y1={bodyY + bodyHeight * 0.12}
          y2={bodyY + bodyHeight * 0.88}
          stroke={object.stroke}
          strokeWidth={Math.max(0.15, innerWidth * 0.025)}
        />
      </g>
    );
  }

  if (
    resolvedCategory === "backdrop" ||
    resolvedCategory === "background" ||
    resolvedCategory === "decor" ||
    resolvedCategory === "mandap"
  ) {
    const framePad = Math.min(innerWidth, innerHeight) * 0.08;

    return (
      <g pointerEvents="none">
        <rect
          x={innerX + framePad}
          y={innerY + framePad}
          width={innerWidth - framePad * 2}
          height={innerHeight - framePad * 2}
          rx={Math.max(0.6, framePad * 0.5)}
          fill={object.accent}
          stroke={object.stroke}
          strokeWidth={Math.max(0.2, framePad * 0.15)}
          opacity="0.9"
        />
        <rect
          x={innerX + framePad * 2.2}
          y={innerY + framePad * 2.2}
          width={innerWidth - framePad * 4.4}
          height={innerHeight - framePad * 4.4}
          rx={Math.max(0.4, framePad * 0.35)}
          fill={object.fill}
          stroke={object.stroke}
          strokeWidth={Math.max(0.15, framePad * 0.1)}
          opacity="0.85"
        />
      </g>
    );
  }

  if (resolvedCategory === "aisle") {
    const pad = Math.min(innerWidth, innerHeight) * 0.08;

    return (
      <g pointerEvents="none">
        <line
          x1={innerX + innerWidth / 2}
          x2={innerX + innerWidth / 2}
          y1={innerY + pad}
          y2={innerY + innerHeight - pad}
          stroke={object.stroke}
          strokeDasharray={`${pad * 0.8} ${pad * 0.8}`}
          strokeWidth={Math.max(0.35, pad * 0.12)}
        />
        <circle
          cx={innerX + innerWidth / 2}
          cy={innerY + innerHeight / 2}
          r={Math.max(0.8, pad * 0.35)}
          fill={object.stroke}
        />
      </g>
    );
  }

  return (
    <rect
      x={innerX}
      y={innerY}
      width={innerWidth}
      height={innerHeight}
      rx={Math.max(0.6, Math.min(innerWidth, innerHeight) * 0.08)}
      fill={object.accent}
      stroke={object.stroke}
      strokeWidth={Math.max(0.2, Math.min(innerWidth, innerHeight) * 0.03)}
      opacity="0.9"
      pointerEvents="none"
    />
  );
}

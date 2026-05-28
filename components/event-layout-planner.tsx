"use client";

import * as React from "react";
import {
  Armchair,
  BadgeCheck,
  Camera,
  CircleDot,
  DoorOpen,
  Download,
  Fence,
  Flower2,
  Grid3X3,
  Layers,
  Move,
  Music,
  RotateCcw,
  Sofa,
  Sparkles,
  Trash2,
  Utensils,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PlannerObjectKind =
  | "chair"
  | "stage"
  | "sofa"
  | "background"
  | "mandap"
  | "dining"
  | "dance"
  | "photo"
  | "entry"
  | "aisle"
  | "dj"
  | "decor";

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type PlannerTemplate = {
  kind: PlannerObjectKind;
  label: string;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  accent: string;
  icon: React.ComponentType<{ className?: string }>;
};

type PlannerObject = PlannerTemplate & {
  id: string;
  x: number;
  y: number;
  rotation: number;
};

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

const templates: PlannerTemplate[] = [
  {
    kind: "chair",
    label: "Guest chair",
    width: 4,
    height: 4,
    fill: "#f8d98b",
    stroke: "#a86e11",
    accent: "#fff4d1",
    icon: Armchair,
  },
  {
    kind: "stage",
    label: "Wedding stage",
    width: 28,
    height: 12,
    fill: "#d9ead7",
    stroke: "#4d7c58",
    accent: "#f6fbf3",
    icon: Layers,
  },
  {
    kind: "sofa",
    label: "Couple sofa",
    width: 14,
    height: 6,
    fill: "#f4b6c2",
    stroke: "#b23a5a",
    accent: "#ffe7ec",
    icon: Sofa,
  },
  {
    kind: "background",
    label: "Floral backdrop",
    width: 30,
    height: 5,
    fill: "#bcd7f6",
    stroke: "#366da8",
    accent: "#edf6ff",
    icon: Camera,
  },
  {
    kind: "mandap",
    label: "Mandap",
    width: 16,
    height: 16,
    fill: "#f4dfc1",
    stroke: "#9b6237",
    accent: "#fff7e9",
    icon: Sparkles,
  },
  {
    kind: "dining",
    label: "Dining table",
    width: 12,
    height: 6,
    fill: "#c7e7e1",
    stroke: "#24756d",
    accent: "#edfffb",
    icon: Utensils,
  },
  {
    kind: "dance",
    label: "Dance floor",
    width: 18,
    height: 14,
    fill: "#ddd2ff",
    stroke: "#6a56a4",
    accent: "#f4f0ff",
    icon: Grid3X3,
  },
  {
    kind: "photo",
    label: "Photo booth",
    width: 10,
    height: 8,
    fill: "#ffc9a8",
    stroke: "#b45b2f",
    accent: "#fff0e7",
    icon: Camera,
  },
  {
    kind: "entry",
    label: "Entry gate",
    width: 12,
    height: 4,
    fill: "#cbd5e1",
    stroke: "#475569",
    accent: "#f8fafc",
    icon: DoorOpen,
  },
  {
    kind: "aisle",
    label: "Aisle runner",
    width: 8,
    height: 28,
    fill: "#fee2e2",
    stroke: "#b91c1c",
    accent: "#fff7f7",
    icon: Fence,
  },
  {
    kind: "dj",
    label: "DJ console",
    width: 12,
    height: 5,
    fill: "#d1d5db",
    stroke: "#374151",
    accent: "#f9fafb",
    icon: Music,
  },
  {
    kind: "decor",
    label: "Decor island",
    width: 7,
    height: 7,
    fill: "#dcfce7",
    stroke: "#15803d",
    accent: "#f0fdf4",
    icon: Flower2,
  },
];

const templateByKind = new Map(
  templates.map((template) => [template.kind, template]),
);

const defaultObjects: PlannerObject[] = [
  {
    ...templates[1],
    id: "stage-1",
    x: 36,
    y: 6,
    rotation: 0,
  },
  {
    ...templates[3],
    id: "background-1",
    x: 35,
    y: 1,
    rotation: 0,
  },
  {
    ...templates[2],
    id: "sofa-1",
    x: 43,
    y: 10,
    rotation: 0,
  },
  {
    ...templates[0],
    id: "chair-1",
    x: 32,
    y: 30,
    rotation: 0,
  },
  {
    ...templates[0],
    id: "chair-2",
    x: 39,
    y: 30,
    rotation: 0,
  },
  {
    ...templates[0],
    id: "chair-3",
    x: 46,
    y: 30,
    rotation: 0,
  },
  {
    ...templates[0],
    id: "chair-4",
    x: 53,
    y: 30,
    rotation: 0,
  },
];

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

const makeId = (kind: PlannerObjectKind) =>
  `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const objectsOverlap = (first: PlannerObject, second: PlannerObject) =>
  first.x < second.x + second.width &&
  first.x + first.width > second.x &&
  first.y < second.y + second.height &&
  first.y + first.height > second.y;

const formatNumber = (value: number) => Number(value.toFixed(1));

export function EventLayoutPlanner() {
  const [venueLength, setVenueLength] = React.useState(90);
  const [venueWidth, setVenueWidth] = React.useState(55);
  const [objects, setObjects] = React.useState<PlannerObject[]>(defaultObjects);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([
    defaultObjects[0].id,
  ]);
  const [interaction, setInteraction] = React.useState<InteractionState | null>(
    null,
  );
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  const selectedObjects = React.useMemo(
    () => objects.filter((object) => selectedIds.includes(object.id)),
    [objects, selectedIds],
  );
  const selectedObject =
    selectedObjects.length === 1 ? selectedObjects[0] : null;
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

  const gridLines = React.useMemo(() => {
    const lines: Array<{ axis: "x" | "y"; value: number }> = [];

    for (let x = 0; x <= venueLength; x += 5) {
      lines.push({ axis: "x", value: x });
    }

    for (let y = 0; y <= venueWidth; y += 5) {
      lines.push({ axis: "y", value: y });
    }

    return lines;
  }, [venueLength, venueWidth]);

  const snapshotHeight = venueWidth + 16 + objects.length * 4.5;

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
        x: clamp(transformed.x, 0, venueLength),
        y: clamp(transformed.y, 0, venueWidth),
      };
    },
    [venueLength, venueWidth],
  );

  const addObject = React.useCallback(
    (kind: PlannerObjectKind, position?: Point) => {
      const template = templateByKind.get(kind);

      if (!template) {
        return;
      }

      const nextObject: PlannerObject = {
        ...template,
        id: makeId(kind),
        x: clamp(
          position?.x ?? venueLength / 2 - template.width / 2,
          0,
          Math.max(0, venueLength - template.width),
        ),
        y: clamp(
          position?.y ?? venueWidth / 2 - template.height / 2,
          0,
          Math.max(0, venueWidth - template.height),
        ),
        rotation: 0,
      };

      setObjects((currentObjects) => [...currentObjects, nextObject]);
      setSelectedIds([nextObject.id]);
    },
    [venueLength, venueWidth],
  );

  const updateObject = React.useCallback(
    (id: string, patch: Partial<PlannerObject>) => {
      setObjects((currentObjects) =>
        currentObjects.map((object) => {
          if (object.id !== id) {
            return object;
          }

          const nextObject = { ...object, ...patch };

          return {
            ...nextObject,
            width: clamp(nextObject.width, 2, venueLength),
            height: clamp(nextObject.height, 2, venueWidth),
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
            rotation: clamp(nextObject.rotation, 0, 355),
          };
        }),
      );
    },
    [venueLength, venueWidth],
  );

  const handleVenueLengthChange = (value: number) => {
    const nextLength = clamp(value, 30, 180);
    setVenueLength(nextLength);
    setObjects((currentObjects) =>
      currentObjects.map((object) => ({
        ...object,
        width: Math.min(object.width, nextLength),
        x: clamp(object.x, 0, Math.max(0, nextLength - object.width)),
      })),
    );
  };

  const handleVenueWidthChange = (value: number) => {
    const nextWidth = clamp(value, 20, 120);
    setVenueWidth(nextWidth);
    setObjects((currentObjects) =>
      currentObjects.map((object) => ({
        ...object,
        height: Math.min(object.height, nextWidth),
        y: clamp(object.y, 0, Math.max(0, nextWidth - object.height)),
      })),
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

    if (next.width < 2) {
      next.x = handle.includes("w") ? original.x + original.width - 2 : next.x;
      next.width = 2;
    }

    if (next.height < 2) {
      next.y = handle.includes("n") ? original.y + original.height - 2 : next.y;
      next.height = 2;
    }

    updateObject(interaction.id, next);
  };

  const finishInteraction = (event: React.PointerEvent<SVGSVGElement>) => {
    if (interaction?.pointerId === event.pointerId) {
      setInteraction(null);
    }
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) {
      return;
    }

    setObjects((currentObjects) =>
      currentObjects.filter((object) => !selectedIds.includes(object.id)),
    );
    setSelectedIds([]);
  };

  const resetLayout = () => {
    setVenueLength(90);
    setVenueWidth(55);
    setObjects(defaultObjects);
    setSelectedIds([defaultObjects[0].id]);
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
    const kind = event.dataTransfer.getData(
      "application/x-planner-object",
    ) as PlannerObjectKind;

    if (!kind) {
      return;
    }

    event.preventDefault();

    const point = getPointInVenue(event.clientX, event.clientY);
    const template = templateByKind.get(kind);

    addObject(kind, {
      x: point.x - (template?.width ?? 0) / 2,
      y: point.y - (template?.height ?? 0) / 2,
    });
  };

  return (
    <main className="min-h-screen bg-[#f6f4ef] text-[#1f2520]">
      <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-4 px-4 py-4 lg:h-screen lg:flex-row lg:overflow-hidden">
        <aside className="flex flex-col gap-4 rounded-lg border border-[#d8d1c3] bg-white p-4 shadow-sm lg:w-80 lg:overflow-auto">
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
                {venueLength * venueWidth} sq ft
              </span>
            </div>

            <NumberField
              label="Length"
              value={venueLength}
              min={30}
              max={180}
              suffix="ft"
              onChange={handleVenueLengthChange}
            />
            <NumberField
              label="Width"
              value={venueWidth}
              min={20}
              max={120}
              suffix="ft"
              onChange={handleVenueWidthChange}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Objects</h2>
            <div className="grid grid-cols-2 gap-2">
              {templates.map((template) => {
                const Icon = template.icon;

                return (
                  <button
                    key={template.kind}
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        "application/x-planner-object",
                        template.kind,
                      );
                    }}
                    onClick={() => addObject(template.kind)}
                    className="flex min-h-24 flex-col items-start justify-between rounded-lg border border-[#ddd6c7] bg-[#fbfaf7] p-3 text-left transition hover:border-[#8ca17f] hover:bg-[#f4f8ef]"
                    title={`Add ${template.label}`}
                  >
                    <Icon className="size-5" />
                    <span className="text-sm font-semibold leading-tight">
                      {template.label}
                    </span>
                    <span className="text-xs text-[#6f756a]">
                      {template.width} x {template.height} ft
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="mt-auto flex gap-2">
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

        <section className="flex min-w-0 flex-1 flex-col gap-3 lg:overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d8d1c3] bg-white px-4 py-3 shadow-sm">
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
            className="min-h-[360px] flex-1 overflow-auto rounded-lg border border-[#cfc6b6] bg-[#e9e3d6] p-3 shadow-inner"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleCanvasDrop}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${venueLength} ${venueWidth}`}
              role="img"
              aria-label="Wedding event layout canvas"
              className="mx-auto block h-auto min-w-[760px] max-w-full rounded-md bg-[#fffdf8] shadow-sm"
              style={{ aspectRatio: `${venueLength} / ${venueWidth}` }}
              onPointerMove={moveOrResizeObject}
              onPointerUp={finishInteraction}
              onPointerCancel={finishInteraction}
              onPointerDown={() => setSelectedIds([])}
            >
              <defs>
                <filter
                  id="objectShadow"
                  x="-20%"
                  y="-20%"
                  width="140%"
                  height="140%"
                >
                  <feDropShadow
                    dx="0.35"
                    dy="0.45"
                    stdDeviation="0.35"
                    floodColor="#18201a"
                    floodOpacity="0.18"
                  />
                </filter>
              </defs>

              <rect
                x="0"
                y="0"
                width={venueLength}
                height={venueWidth}
                fill="#fffdf8"
              />

              {gridLines.map((line) =>
                line.axis === "x" ? (
                  <line
                    key={`x-${line.value}`}
                    x1={line.value}
                    x2={line.value}
                    y1="0"
                    y2={venueWidth}
                    stroke={line.value % 10 === 0 ? "#ded6c7" : "#eee9df"}
                    strokeWidth="0.12"
                  />
                ) : (
                  <line
                    key={`y-${line.value}`}
                    x1="0"
                    x2={venueLength}
                    y1={line.value}
                    y2={line.value}
                    stroke={line.value % 10 === 0 ? "#ded6c7" : "#eee9df"}
                    strokeWidth="0.12"
                  />
                ),
              )}

              <rect
                x="0.3"
                y="0.3"
                width={venueLength - 0.6}
                height={venueWidth - 0.6}
                fill="none"
                stroke="#4a5446"
                strokeWidth="0.6"
              />

              {objects.map((object, index) => (
                <PlannerShape
                  key={object.id}
                  object={object}
                  index={index + 1}
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

        <aside className="flex flex-col gap-4 rounded-lg border border-[#d8d1c3] bg-white p-4 shadow-sm lg:w-80 lg:overflow-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b715f]">
                Selection
              </p>
              <h2 className="mt-2 text-xl font-semibold">
                {selectedObject
                  ? selectedObject.label
                  : selectedObjects.length > 1
                    ? `${selectedObjects.length} objects selected`
                    : "No object selected"}
              </h2>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              onClick={deleteSelected}
              disabled={selectedIds.length === 0}
              title="Delete selected objects"
            >
              <Trash2 />
            </Button>
          </div>

          {selectedObject ? (
            <section className="space-y-3">
              <TextField
                label="Label"
                value={selectedObject.label}
                onChange={(value) =>
                  updateObject(selectedObject.id, { label: value })
                }
              />
              <NumberField
                label="Object length"
                value={selectedObject.width}
                min={2}
                max={venueLength}
                suffix="ft"
                onChange={(value) =>
                  updateObject(selectedObject.id, { width: value })
                }
              />
              <NumberField
                label="Object width"
                value={selectedObject.height}
                min={2}
                max={venueWidth}
                suffix="ft"
                onChange={(value) =>
                  updateObject(selectedObject.id, { height: value })
                }
              />
              <NumberField
                label="X position"
                value={formatNumber(selectedObject.x)}
                min={0}
                max={venueLength - selectedObject.width}
                suffix="ft"
                onChange={(value) =>
                  updateObject(selectedObject.id, { x: value })
                }
              />
              <NumberField
                label="Y position"
                value={formatNumber(selectedObject.y)}
                min={0}
                max={venueWidth - selectedObject.height}
                suffix="ft"
                onChange={(value) =>
                  updateObject(selectedObject.id, { y: value })
                }
              />
              <NumberField
                label="Rotation"
                value={selectedObject.rotation}
                min={0}
                max={355}
                step={5}
                suffix="deg"
                onChange={(value) =>
                  updateObject(selectedObject.id, { rotation: value })
                }
              />
            </section>
          ) : selectedObjects.length > 1 ? (
            <div className="rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] p-3 text-sm text-[#596153]">
              Drag any selected object to move the group. Use the placed list or
              Shift/Ctrl click on the canvas to add or remove objects from the
              selection.
            </div>
          ) : (
            <div className="flex min-h-52 items-center justify-center rounded-lg border border-dashed border-[#d1c8b9] bg-[#fbfaf7] text-center text-sm text-[#777d73]">
              Select an object on the canvas.
            </div>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Placed list</h3>
            <div className="max-h-64 space-y-2 overflow-auto pr-1">
              {objects.map((object, index) => (
                <button
                  key={object.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition",
                    selectedIdSet.has(object.id)
                      ? "border-[#315c4b] bg-[#eef5ec]"
                      : overlapIds.has(object.id)
                        ? "border-[#b91c1c] bg-[#fff7f7]"
                        : "border-[#ddd6c7] bg-[#fbfaf7] hover:bg-[#f4f8ef]",
                  )}
                  onClick={(event) =>
                    selectObject(
                      object.id,
                      event.shiftKey || event.metaKey || event.ctrlKey,
                    )
                  }
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#315c4b] text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                    <span className="min-w-0 truncate font-medium">
                      {object.label}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-[#6f756a]">
                    {object.width} x {object.height}
                  </span>
                </button>
              ))}
            </div>
          </section>
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

function TextField({
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
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] px-3 text-sm font-medium outline-none focus:border-[#66835d] focus:ring-2 focus:ring-[#66835d]/20"
      />
    </label>
  );
}

function PlannerShape({
  object,
  index,
  selected,
  overlapping,
  onPointerDown,
  onResizeStart,
}: {
  object: PlannerObject;
  index: number;
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
  const centerX = object.x + object.width / 2;
  const centerY = object.y + object.height / 2;
  const labelSize = clamp(
    Math.min(object.width, object.height) * 0.22,
    1.25,
    2.4,
  );
  const dimensionSize = clamp(
    Math.min(object.width, object.height) * 0.16,
    0.95,
    1.4,
  );

  return (
    <g
      transform={`rotate(${object.rotation} ${centerX} ${centerY})`}
      onPointerDown={(event) => onPointerDown(event, object)}
      className="cursor-grab active:cursor-grabbing"
      filter="url(#objectShadow)"
    >
      <rect
        x={object.x}
        y={object.y}
        width={object.width}
        height={object.height}
        rx={Math.min(1.2, object.width / 6, object.height / 6)}
        fill={object.fill}
        fillOpacity={overlapping ? 0.78 : 0.95}
        stroke={selected ? "#111827" : overlapping ? "#b91c1c" : object.stroke}
        strokeWidth={selected ? 0.7 : overlapping ? 0.65 : 0.45}
      />

      <ObjectIllustration object={object} />

      <circle
        cx={object.x + 1.45}
        cy={object.y + 1.45}
        r="1.2"
        fill="#1f2937"
        stroke="#fffdf8"
        strokeWidth="0.25"
      />
      <text
        x={object.x + 1.45}
        y={object.y + 1.45}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Arial, sans-serif"
        fontSize="1.3"
        fontWeight="700"
        fill="#ffffff"
      >
        {index}
      </text>

      <text
        x={centerX}
        y={centerY - 0.7}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Arial, sans-serif"
        fontSize={labelSize}
        fontWeight="700"
        fill="#1f2520"
        paintOrder="stroke"
        stroke="#fffdf8"
        strokeWidth="0.38"
      >
        {object.label}
      </text>

      <text
        x={centerX}
        y={centerY + 1.25}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Arial, sans-serif"
        fontSize={dimensionSize}
        fontWeight="700"
        fill="#374151"
        paintOrder="stroke"
        stroke="#fffdf8"
        strokeWidth="0.28"
      >
        {formatNumber(object.width)} x {formatNumber(object.height)} ft
      </text>

      {overlapping ? (
        <text
          x={centerX}
          y={object.y - 1.2}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Arial, sans-serif"
          fontSize="1.25"
          fontWeight="700"
          fill="#b91c1c"
          paintOrder="stroke"
          stroke="#fffdf8"
          strokeWidth="0.3"
        >
          overlap
        </text>
      ) : null}

      {selected ? (
        <g data-editor-only="true">
          <rect
            x={object.x - 0.8}
            y={object.y - 0.8}
            width={object.width + 1.6}
            height={object.height + 1.6}
            rx="1.2"
            fill="none"
            stroke="#111827"
            strokeDasharray="1.5 1.2"
            strokeWidth="0.35"
          />
          {resizeHandles.map((item) => {
            const point = item.getPoint(object);

            return (
              <circle
                key={item.handle}
                cx={point.x}
                cy={point.y}
                r="0.85"
                fill="#ffffff"
                stroke="#111827"
                strokeWidth="0.32"
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
  if (object.kind === "chair") {
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

  if (object.kind === "stage" || object.kind === "dance") {
    return (
      <>
        <rect
          x={object.x + 1.2}
          y={object.y + 1.2}
          width={Math.max(0, object.width - 2.4)}
          height={Math.max(0, object.height - 2.4)}
          rx="0.9"
          fill={object.accent}
          opacity="0.75"
        />
        <path
          d={`M ${object.x + 2} ${object.y + object.height - 2} C ${
            object.x + object.width / 2
          } ${object.y + object.height + 1.4} ${object.x + object.width - 2} ${
            object.y + object.height - 2
          }`}
          fill="none"
          stroke={object.stroke}
          strokeWidth="0.35"
        />
      </>
    );
  }

  if (
    object.kind === "sofa" ||
    object.kind === "dining" ||
    object.kind === "dj"
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
    object.kind === "background" ||
    object.kind === "decor" ||
    object.kind === "mandap"
  ) {
    return (
      <>
        {Array.from({ length: object.kind === "mandap" ? 10 : 7 }).map(
          (_, index) => {
            const cx =
              object.x +
              ((index + 0.7) / (object.kind === "mandap" ? 10.4 : 7.4)) *
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

  if (object.kind === "aisle") {
    return (
      <>
        <line
          x1={object.x + object.width / 2}
          x2={object.x + object.width / 2}
          y1={object.y + 1}
          y2={object.y + object.height - 1}
          stroke={object.stroke}
          strokeDasharray="1 1"
          strokeWidth="0.35"
        />
        <CircleDot
          x={object.x + object.width / 2 - 1}
          y={object.y + object.height / 2 - 1}
          width="2"
          height="2"
          color={object.stroke}
        />
      </>
    );
  }

  return null;
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

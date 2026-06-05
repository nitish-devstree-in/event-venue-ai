import {
  Armchair,
  Camera,
  Fence,
  Layers,
  Package,
  Sofa,
  type LucideIcon,
} from "lucide-react";

import type { ProductMasterRecord } from "@/lib/api";

export type PlannerObjectKind = `product-master:${number}`;

export type PlannerTemplate = {
  kind: PlannerObjectKind;
  productMasterId: number;
  label: string;
  width: number;
  height: number;
  imageSrc?: string;
  fill: string;
  stroke: string;
  accent: string;
  icon: LucideIcon;
  category: string | null;
};

const CATEGORY_ALIASES: Record<string, string> = {
  sitting: "seating",
  chair: "seating",
  chairs: "seating",
  guest: "seating",
  decoration: "decor",
  decorations: "decor",
  mandap: "mandap",
};

const CATEGORY_DIMENSIONS: Record<string, { width: number; height: number }> = {
  seating: { width: 4, height: 4 },
  stage: { width: 28, height: 12 },
  furniture: { width: 14, height: 6 },
  sofa: { width: 14, height: 6 },
  backdrop: { width: 30, height: 5 },
  decor: { width: 10, height: 10 },
  aisle: { width: 8, height: 28 },
  mandap: { width: 16, height: 16 },
  dining: { width: 12, height: 6 },
};

const CATEGORY_STYLES: Record<
  string,
  Pick<PlannerTemplate, "fill" | "stroke" | "accent">
> = {
  seating: {
    fill: "#f8d98b",
    stroke: "#a86e11",
    accent: "#fff4d1",
  },
  stage: {
    fill: "#d9ead7",
    stroke: "#4d7c58",
    accent: "#f6fbf3",
  },
  furniture: {
    fill: "#f4b6c2",
    stroke: "#b23a5a",
    accent: "#ffe7ec",
  },
  sofa: {
    fill: "#f4b6c2",
    stroke: "#b23a5a",
    accent: "#ffe7ec",
  },
  backdrop: {
    fill: "#bcd7f6",
    stroke: "#366da8",
    accent: "#edf6ff",
  },
  decor: {
    fill: "#dcfce7",
    stroke: "#15803d",
    accent: "#f0fdf4",
  },
  aisle: {
    fill: "#fee2e2",
    stroke: "#b91c1c",
    accent: "#fff7f7",
  },
};

const DEFAULT_DIMENSIONS = { width: 6, height: 6 };
const DEFAULT_STYLE = {
  fill: "#e8e4dc",
  stroke: "#6b715f",
  accent: "#fbfaf7",
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  seating: Armchair,
  stage: Layers,
  furniture: Sofa,
  sofa: Sofa,
  backdrop: Camera,
  aisle: Fence,
};

export function productMasterKind(productId: number): PlannerObjectKind {
  return `product-master:${productId}`;
}

export function parseProductMasterKind(
  kind: string,
): number | null {
  const match = /^product-master:(\d+)$/.exec(kind);
  if (!match) return null;
  return Number(match[1]);
}

export function normalizeProductCategory(category: string | null): string | null {
  if (!category) return null;
  const normalized = category.toLowerCase().trim();
  return CATEGORY_ALIASES[normalized] ?? normalized;
}

export function getDefaultDimensions(
  category: string | null,
  productName?: string | null,
) {
  const nameLower = productName?.toLowerCase() ?? "";
  if (nameLower.includes("sofa")) return CATEGORY_DIMENSIONS.sofa;
  if (nameLower.includes("mandap")) return CATEGORY_DIMENSIONS.mandap;
  if (nameLower.includes("chair") || nameLower.includes("seat")) {
    return CATEGORY_DIMENSIONS.seating;
  }

  const normalized = normalizeProductCategory(category);
  if (!normalized) return DEFAULT_DIMENSIONS;
  return CATEGORY_DIMENSIONS[normalized] ?? DEFAULT_DIMENSIONS;
}

export function getCatalogDimensions(
  category: string | null,
  productName?: string | null,
) {
  return getDefaultDimensions(category, productName);
}

export function productFitsVenue(
  width: number,
  height: number,
  venueLength: number,
  venueWidth: number,
): boolean {
  return width <= venueLength && height <= venueWidth;
}

export function getResizeLimits(
  category: string | null,
  productName: string | null | undefined,
  venueLength: number,
  venueWidth: number,
) {
  const catalog = getCatalogDimensions(category, productName);

  return {
    catalogWidth: catalog.width,
    catalogHeight: catalog.height,
    minWidth: 2,
    minHeight: 2,
    maxWidth: Math.min(catalog.width, venueLength),
    maxHeight: Math.min(catalog.height, venueWidth),
  };
}

export function clampObjectSize(
  width: number,
  height: number,
  limits: ReturnType<typeof getResizeLimits>,
): { width: number; height: number } {
  return {
    width: Number(
      clamp(width, limits.minWidth, limits.maxWidth).toFixed(1),
    ),
    height: Number(
      clamp(height, limits.minHeight, limits.maxHeight).toFixed(1),
    ),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getFixedProductDimensions(
  category: string | null,
  _venueLength: number,
  _venueWidth: number,
  productName?: string | null,
): { width: number; height: number } {
  return getCatalogDimensions(category, productName);
}

/** @deprecated Use getFixedProductDimensions instead. */
export function fitDimensionsToVenue(
  width: number,
  height: number,
  venueLength: number,
  venueWidth: number,
): { width: number; height: number } {
  if (width <= venueLength && height <= venueWidth) {
    return {
      width: Number(width.toFixed(1)),
      height: Number(height.toFixed(1)),
    };
  }

  const scale = Math.min(venueLength / width, venueWidth / height, 1);

  return {
    width: Number(Math.max(2, width * scale).toFixed(1)),
    height: Number(Math.max(2, height * scale).toFixed(1)),
  };
}

function getCategoryStyle(category: string | null) {
  const normalized = normalizeProductCategory(category);
  if (!normalized) return DEFAULT_STYLE;
  return CATEGORY_STYLES[normalized] ?? DEFAULT_STYLE;
}

function getCategoryIcon(category: string | null): LucideIcon {
  const normalized = normalizeProductCategory(category);
  if (!normalized) return Package;
  return CATEGORY_ICONS[normalized] ?? Package;
}

export function productToPlannerTemplate(
  product: ProductMasterRecord,
): PlannerTemplate {
  const dimensions = getDefaultDimensions(product.category, product.name);
  const style = getCategoryStyle(product.category);

  return {
    kind: productMasterKind(product.id),
    productMasterId: product.id,
    label: product.name,
    width: dimensions.width,
    height: dimensions.height,
    imageSrc: product.image_url ?? undefined,
    category: product.category,
    icon: getCategoryIcon(product.category),
    ...style,
  };
}

export function buildProductTemplateMap(
  products: ProductMasterRecord[],
): Map<number, PlannerTemplate> {
  return new Map(
    products.map((product) => [product.id, productToPlannerTemplate(product)]),
  );
}

export const PLANNER_PRODUCT_DRAG_TYPE = "application/x-planner-product-id";

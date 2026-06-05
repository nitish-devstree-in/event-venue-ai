"use client";

import * as React from "react";
import { Loader2, Package, Pencil, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  createProductMaster,
  listProductMaster,
  updateProductMaster,
  type ProductMasterRecord,
} from "@/lib/api";
import {
  getDefaultDimensions,
  PLANNER_PRODUCT_DRAG_TYPE,
} from "@/lib/product-master-planner";
type ProductMasterPanelProps = {
  onProductsChange: (products: ProductMasterRecord[]) => void;
  onAddToCanvas: (productId: number) => void;
};

export function ProductMasterPanel({
  onProductsChange,
  onAddToCanvas,
}: ProductMasterPanelProps) {
  const [products, setProducts] = React.useState<ProductMasterRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [formMode, setFormMode] = React.useState<"create" | "edit" | null>(
    null,
  );
  const [editingProduct, setEditingProduct] =
    React.useState<ProductMasterRecord | null>(null);

  const loadProducts = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listProductMaster({ activeOnly: true });
      setProducts(data);
      onProductsChange(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load product master.",
      );
    } finally {
      setLoading(false);
    }
  }, [onProductsChange]);

  React.useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const openCreate = () => {
    setEditingProduct(null);
    setFormMode("create");
  };

  const openEdit = (
    event: React.MouseEvent,
    product: ProductMasterRecord,
  ) => {
    event.stopPropagation();
    setEditingProduct(product);
    setFormMode("edit");
  };

  const handleSaved = async (product: ProductMasterRecord) => {
    setFormMode(null);
    setEditingProduct(null);

    try {
      const data = await listProductMaster({ activeOnly: true });
      setProducts(data);
      onProductsChange(data);
    } catch {
      setProducts((current) => {
        const exists = current.some((item) => item.id === product.id);
        const next = exists
          ? current.map((item) => (item.id === product.id ? product : item))
          : [product, ...current];
        onProductsChange(next);
        return next;
      });
    }
  };

  return (
    <>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Product master</h2>
            <p className="text-xs text-[#6f756a]">
              Tap to place on canvas · pencil to edit
            </p>
          </div>
          <Button
            type="button"
            size="icon-sm"
            className="shrink-0 bg-[#315c4b] text-white hover:bg-[#25483b]"
            onClick={openCreate}
            title="Add product"
          >
            <Plus />
          </Button>
        </div>

        {error ? (
          <div className="rounded-lg border border-[#f1c0c0] bg-[#fff5f5] px-3 py-2 text-xs text-[#9b1c1c]">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-[#d1c8b9] bg-[#fbfaf7]">
            <div className="flex items-center gap-2 text-sm text-[#596153]">
              <Loader2 className="size-4 animate-spin" />
              Loading products...
            </div>
          </div>
        ) : products.length === 0 ? (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#d1c8b9] bg-[#fbfaf7] p-4 text-center">
            <Package className="size-6 text-[#8ca17f]" />
            <p className="text-sm font-medium">No products yet</p>
            <p className="text-xs text-[#6f756a]">
              Add sofas, chairs, stages, and more to your catalogue.
            </p>
            <Button
              type="button"
              size="sm"
              className="bg-[#315c4b] text-white hover:bg-[#25483b]"
              onClick={openCreate}
            >
              <Plus />
              Add product
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAdd={() => onAddToCanvas(product.id)}
                onEdit={(event) => openEdit(event, product)}
              />
            ))}
          </div>
        )}
      </section>

      <ProductFormModal
        open={formMode != null}
        mode={formMode ?? "create"}
        product={editingProduct}
        onClose={() => {
          setFormMode(null);
          setEditingProduct(null);
        }}
        onSaved={handleSaved}
      />
    </>
  );
}

function ProductCard({
  product,
  onAdd,
  onEdit,
}: {
  product: ProductMasterRecord;
  onAdd: () => void;
  onEdit: (event: React.MouseEvent) => void;
}) {
  const dimensions = getDefaultDimensions(product.category, product.name);

  return (
    <div className="group relative">
      <button
        type="button"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(
            PLANNER_PRODUCT_DRAG_TYPE,
            String(product.id),
          );
        }}
        onClick={onAdd}
        className="flex min-h-24 w-full flex-col items-start justify-between rounded-lg border border-[#ddd6c7] bg-[#fbfaf7] p-3 text-left transition hover:border-[#8ca17f] hover:bg-[#f4f8ef]"
        title={`Add ${product.name}`}
      >
        <span className="relative w-full overflow-hidden rounded-lg border border-[#e7e0d4] bg-white">
          <span className="flex h-16 w-full items-center justify-center bg-[#fbfaf7]">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image_url}
                alt={product.name}
                className="h-full w-full object-cover"
                loading="lazy"
                onError={(event) => {
                  (event.currentTarget as HTMLImageElement).style.display =
                    "none";
                }}
              />
            ) : (
              <Package className="size-7 text-[#8ca17f]" />
            )}
          </span>
        </span>
        <span className="mt-2 line-clamp-2 text-sm font-semibold leading-tight">
          {product.name}
        </span>
        <span className="text-xs text-[#6f756a]">
          {dimensions.width} x {dimensions.height} ft
          {product.category ? ` · ${product.category}` : ""}
        </span>
      </button>

      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        className="absolute right-2 top-2 bg-white/95 opacity-0 shadow-sm transition group-hover:opacity-100"
        onClick={onEdit}
        title={`Edit ${product.name}`}
      >
        <Pencil />
      </Button>
    </div>
  );
}

function ProductFormModal({
  open,
  mode,
  product,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  product: ProductMasterRecord | null;
  onClose: () => void;
  onSaved: (product: ProductMasterRecord) => void;
}) {
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    setName(product?.name ?? "");
    setCategory(product?.category ?? "");
    setDescription(product?.description ?? "");
    setIsActive(product?.is_active ?? true);
    setImageFile(null);
    setImagePreview(product?.image_url ?? null);
    setError(null);
    setSubmitting(false);
  }, [open, product]);

  React.useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

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
    setError(null);
    setSubmitting(true);

    try {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error("Product name is required.");
      }

      const saved =
        mode === "create"
          ? await createProductMaster({
              name: trimmedName,
              category: category.trim() || undefined,
              description: description.trim() || undefined,
              product_image: imageFile ?? undefined,
            })
          : await updateProductMaster(product!.id, {
              name: trimmedName,
              category: category.trim(),
              description: description.trim(),
              is_active: isActive,
              product_image: imageFile ?? undefined,
            });

      onSaved(saved);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to save product.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-[#1f2520]/45 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#d8d1c3] bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b715f]">
              Product master
            </p>
            <h2 id="product-form-title" className="mt-1 text-xl font-semibold">
              {mode === "create" ? "Add product" : "Edit product"}
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </Button>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <FormField
            label="Name"
            value={name}
            onChange={setName}
            placeholder="Guest chair"
            required
          />
          <FormField
            label="Category"
            value={category}
            onChange={setCategory}
            placeholder="seating, stage, decor..."
          />
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#5c6659]">
              Description
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="Optional notes about this product"
              className="w-full resize-y rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] px-3 py-2 text-sm outline-none focus:border-[#66835d] focus:ring-2 focus:ring-[#66835d]/20"
            />
          </label>

          {mode === "edit" ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                className="size-4 rounded border-[#d8d1c3]"
              />
              <span className="font-medium text-[#4e594c]">Active in catalogue</span>
            </label>
          ) : null}

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-[#5c6659]">
              Product image
            </span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-[#cfc6b6] bg-[#fbfaf7] p-4 transition hover:bg-[#f6f4ef]"
            >
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="max-h-36 w-full rounded-md object-contain"
                />
              ) : (
                <Package className="size-8 text-[#8ca17f]" />
              )}
              <span className="text-xs text-[#6f756a]">
                {imageFile ? imageFile.name : "Click to upload image"}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) =>
                setImageFile(event.target.files?.[0] ?? null)
              }
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-[#f1c0c0] bg-[#fff5f5] px-3 py-2 text-sm text-[#9b1c1c]">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
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
              ) : mode === "create" ? (
                "Create product"
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[#5c6659]">{label}</span>
      <input
        type="text"
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-[#d8d1c3] bg-[#fbfaf7] px-3 text-sm font-medium outline-none focus:border-[#66835d] focus:ring-2 focus:ring-[#66835d]/20"
      />
    </label>
  );
}

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)$/i;

export function isImageFile(file: File | null | undefined): file is File {
  if (!file) return false;
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXTENSION_PATTERN.test(file.name);
}

export function getDraggedImageFile(
  dataTransfer: DataTransfer,
): File | null {
  if (dataTransfer.files?.length) {
    const file = dataTransfer.files[0];
    return isImageFile(file) ? file : null;
  }

  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (isImageFile(file)) return file;
  }

  return null;
}

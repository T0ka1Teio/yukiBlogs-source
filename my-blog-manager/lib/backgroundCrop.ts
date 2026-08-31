export type BackgroundCrop = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export type BackgroundCropMap = Record<string, BackgroundCrop>;

export const DEFAULT_BACKGROUND_CROP: BackgroundCrop = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
};

function finiteNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeBackgroundCrop(value: unknown): BackgroundCrop {
  if (!value || typeof value !== 'object') return DEFAULT_BACKGROUND_CROP;
  const crop = value as Partial<BackgroundCrop>;
  return {
    zoom: Math.max(1, Math.min(3, finiteNumber(crop.zoom, 1))),
    offsetX: finiteNumber(crop.offsetX, 0),
    offsetY: finiteNumber(crop.offsetY, 0),
  };
}

export function upsertBackgroundSelection(
  images: readonly string[],
  crops: BackgroundCropMap,
  sourceUrl: string,
  crop: BackgroundCrop,
) {
  const url = sourceUrl.trim();
  return {
    images: images.includes(url) ? [...images] : [...images, url],
    crops: { ...crops, [url]: normalizeBackgroundCrop(crop) },
  };
}

export function removeBackgroundSelection(
  images: readonly string[],
  crops: BackgroundCropMap,
  index: number,
) {
  const removedUrl = images[index];
  const nextCrops = { ...crops };
  if (removedUrl) delete nextCrops[removedUrl];
  return {
    images: images.filter((_, imageIndex) => imageIndex !== index),
    crops: nextCrops,
  };
}

export type BackgroundLayout = {
  width: number;
  height: number;
  left: number;
  top: number;
};

export function getBackgroundLayout(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
  cropValue: unknown,
): BackgroundLayout {
  const crop = normalizeBackgroundCrop(cropValue);
  const safeContainerWidth = Math.max(1, finiteNumber(containerWidth, 1));
  const safeContainerHeight = Math.max(1, finiteNumber(containerHeight, 1));
  const safeImageWidth = Math.max(1, finiteNumber(imageWidth, safeContainerWidth));
  const safeImageHeight = Math.max(1, finiteNumber(imageHeight, safeContainerHeight));
  const baseScale = Math.max(
    safeContainerWidth / safeImageWidth,
    safeContainerHeight / safeImageHeight,
  );
  const width = safeImageWidth * baseScale * crop.zoom;
  const height = safeImageHeight * baseScale * crop.zoom;
  const maxOffsetX = Math.max(0, (width - safeContainerWidth) / 2);
  const maxOffsetY = Math.max(0, (height - safeContainerHeight) / 2);
  const requestedOffsetX = crop.offsetX * safeContainerWidth;
  const requestedOffsetY = crop.offsetY * safeContainerHeight;
  const offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, requestedOffsetX));
  const offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, requestedOffsetY));

  return {
    width,
    height,
    left: (safeContainerWidth - width) / 2 + offsetX,
    top: (safeContainerHeight - height) / 2 + offsetY,
  };
}

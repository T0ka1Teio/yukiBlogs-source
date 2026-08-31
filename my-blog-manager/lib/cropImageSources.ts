export type CropImageCandidate = {
  source: string;
  crossOrigin: 'anonymous' | null;
  referrerPolicy?: 'no-referrer';
};

export function buildCropImageCandidates(
  imageUrl: string,
  backendBase: string | null,
  reuseSourceUrl: boolean,
): CropImageCandidate[] {
  if (!/^https?:\/\//i.test(imageUrl)) {
    return [{ source: imageUrl, crossOrigin: 'anonymous' }];
  }

  const candidates: CropImageCandidate[] = [
    { source: imageUrl, crossOrigin: 'anonymous' },
  ];

  if (backendBase) {
    candidates.push({
      source: `${backendBase}/api/picbed/proxy-image?url=${encodeURIComponent(imageUrl)}`,
      crossOrigin: 'anonymous',
      referrerPolicy: 'no-referrer',
    });
  }

  if (reuseSourceUrl) {
    candidates.push({ source: imageUrl, crossOrigin: null });
  }

  return candidates;
}

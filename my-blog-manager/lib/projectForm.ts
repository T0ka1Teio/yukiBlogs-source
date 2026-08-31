export function formatProjectTags(tags: readonly string[] | undefined) {
  return (tags || []).join(', ');
}

export function parseProjectTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export const TABLE_PICKER_LIMIT = 10;

export type TableSize = {
  rows: number;
  cols: number;
};

export type TableInsertChoice = TableSize & {
  withHeaderRow: boolean;
};

const normalizeDimension = (value: number) => {
  if (!Number.isFinite(value)) return 1;
  return Math.min(TABLE_PICKER_LIMIT, Math.max(1, Math.round(value)));
};

export function normalizeTableSize(rows: number, cols: number): TableSize {
  return {
    rows: normalizeDimension(rows),
    cols: normalizeDimension(cols),
  };
}

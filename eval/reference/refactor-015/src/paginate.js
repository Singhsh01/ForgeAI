function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Returns one page of `items`. Pages are 1-based.
 * Accepts paginate(items, page, size) or paginate(items, { page, size }).
 */
export function paginate(items, pageOrOptions = 1, size = 10) {
  let page = pageOrOptions;
  if (pageOrOptions !== null && typeof pageOrOptions === "object") {
    page = pageOrOptions.page ?? 1;
    size = pageOrOptions.size ?? 10;
  }
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = clamp(page, 1, pages);
  const start = (p - 1) * size;
  return { items: items.slice(start, start + size), page: p, pages, total: items.length };
}

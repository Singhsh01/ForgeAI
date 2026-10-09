function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Returns one page of `items`. Pages are 1-based. */
export function paginate(items, page = 1, size = 10) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = clamp(page, 1, pages);
  const start = p * size;
  return { items: items.slice(start, start + size), page: p, pages, total: items.length };
}

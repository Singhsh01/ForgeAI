import { roundCents } from "./money.js";

/**
 * Computes the cart total in cents.
 * items: [{ priceCents, qty }]
 * discountPercent: applied once to the subtotal, result rounded to the nearest cent.
 */
export function cartTotal(items, discountPercent = 0) {
  let total = 0;
  for (const item of items) {
    const line = item.priceCents * item.qty;
    total += roundCents(line - (line * discountPercent) / 100);
  }
  return roundCents(total - (total * discountPercent) / 100);
}

export function itemCount(items) {
  return items.reduce((n, i) => n + i.qty, 0);
}

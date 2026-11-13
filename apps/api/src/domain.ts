export const managementRoles = ["ADMIN", "SUPER_ADMIN", "MODERATOR"];
export function isManager(role: string) {
  return managementRoles.includes(role);
}

export type Scope = {
  regions: { locationId: string }[];
  branches: { branchId: string }[];
};
/** An empty scope is deliberately unavailable, never worldwide. */
export function scopeMatches(
  scope: Scope,
  ancestors: string[],
  branchIds: string[],
) {
  const regionMatch =
    scope.regions.length === 0 ||
    scope.regions.some((r) => ancestors.includes(r.locationId));
  const branchMatch =
    scope.branches.length === 0 ||
    scope.branches.some((b) => branchIds.includes(b.branchId));
  return (
    (scope.regions.length > 0 || scope.branches.length > 0) &&
    regionMatch &&
    branchMatch
  );
}
export function activeWindow(start: Date, end: Date, now = new Date()) {
  return start <= now && end > now;
}
export function validateWindow(start: Date, end: Date) {
  return Number.isFinite(+start) && Number.isFinite(+end) && end > start;
}
export function discountPercent(price: number, original?: number | null) {
  return original && original >= price && original > 0
    ? Math.round((1 - price / original) * 100)
    : null;
}
export function exactVariant(
  a: {
    productId: string;
    label: string;
    quantity: string;
    unit: string;
    packaging: string;
  },
  b: typeof a,
) {
  return (
    a.productId === b.productId &&
    a.label === b.label &&
    Number(a.quantity) === Number(b.quantity) &&
    a.unit === b.unit &&
    a.packaging === b.packaging
  );
}
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: typeof a,
) {
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude),
    dLon = rad(b.longitude - a.longitude);
  const v =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(1 - v));
}

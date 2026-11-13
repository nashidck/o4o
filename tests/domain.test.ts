import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scopeMatches,
  activeWindow,
  validateWindow,
  exactVariant,
  discountPercent,
  distanceKm,
} from "../apps/api/src/domain";
test("district inherits state and country scope", () => {
  assert.equal(
    scopeMatches(
      { regions: [{ locationId: "kerala" }], branches: [] },
      ["kannur", "kerala", "india"],
      [],
    ),
    true,
  );
});
test("district does not inherit another district scope", () => {
  assert.equal(
    scopeMatches(
      { regions: [{ locationId: "ernakulam" }], branches: [] },
      ["kannur", "kerala", "india"],
      [],
    ),
    false,
  );
});
test("branch restriction is intersected with region applicability", () => {
  const scope = {
    regions: [{ locationId: "kerala" }],
    branches: [{ branchId: "branch-a" }],
  };
  assert.equal(scopeMatches(scope, ["kerala"], ["branch-b"]), false);
  assert.equal(scopeMatches(scope, ["kerala"], ["branch-a"]), true);
});
test("no explicit scope is unavailable", () => {
  assert.equal(
    scopeMatches({ regions: [], branches: [] }, ["india"], []),
    false,
  );
});
test("branch-only scope applies only to selected branch", () => {
  assert.equal(
    scopeMatches({ regions: [], branches: [{ branchId: "a" }] }, [], ["a"]),
    true,
  );
});
test("expiry boundary is exclusive", () => {
  const start = new Date("2026-01-01"),
    end = new Date("2026-01-02");
  assert.equal(activeWindow(start, end, start), true);
  assert.equal(activeWindow(start, end, end), false);
});
test("invalid validity windows are rejected", () => {
  assert.equal(validateWindow(new Date("invalid"), new Date()), false);
  const d = new Date();
  assert.equal(validateWindow(d, d), false);
});
test("similar variants cannot be compared as exact", () => {
  const a = {
    productId: "a",
    label: "Original",
    quantity: "1000",
    unit: "g",
    packaging: "bag",
  };
  assert.equal(exactVariant(a, { ...a, quantity: "500" }), false);
  assert.equal(exactVariant(a, { ...a, label: "Premium" }), false);
  assert.equal(exactVariant(a, { ...a, packaging: "box" }), false);
  assert.equal(exactVariant(a, { ...a }), true);
});
test("discount is never invented for missing or inconsistent original price", () => {
  assert.equal(discountPercent(100), null);
  assert.equal(discountPercent(100, 90), null);
  assert.equal(discountPercent(75, 100), 25);
});
test("distance calculation respects identical locations", () => {
  assert.equal(
    distanceKm(
      { latitude: 11, longitude: 75 },
      { latitude: 11, longitude: 75 },
    ),
    0,
  );
  assert.ok(
    distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) >
      111,
  );
});

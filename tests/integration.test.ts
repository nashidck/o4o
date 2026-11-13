import { test } from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";
import { createDb } from "../packages/database";
import { randomBytes, createHash } from "node:crypto";

const base = process.env.TEST_API_URL || "http://localhost:4000/api/v1";
type Session = { cookie: string; csrf: string; id: string };
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  session?: Session,
  origin = "http://localhost:3000",
) {
  const response = await fetch(`${base}/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(session
        ? { Cookie: session.cookie, "X-CSRF-Token": session.csrf }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  return { response, data };
}
test("real database and API: authentication, isolation, moderation, geography, prices and collaborative lists", async () => {
  const db = createDb(),
    suffix = Date.now().toString(36),
    users: string[] = [],
    retailers: string[] = [],
    campaigns: string[] = [],
    products: string[] = [],
    coupons: string[] = [],
    localities: string[] = [];
  async function account(label: string): Promise<Session> {
    const { response, data } = await call("auth/register", "POST", {
      name: `TEST ONLY ${label}`,
      email: `test-${label}-${suffix}@example.invalid`,
      password: "test-only-long-password-487!",
    });
    assert.equal(response.status, 201, JSON.stringify(data));
    users.push(data.user.id);
    return {
      cookie: response.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; "),
      csrf: data.csrf,
      id: data.user.id,
    };
  }
  try {
    assert.equal((await call("health")).response.status, 200);
    const admin = await account("admin"),
      owner = await account("retailer"),
      other = await account("customer");
    const emailToken = randomBytes(32).toString("hex");
    await db.recoveryToken.create({
      data: {
        userId: other.id,
        tokenHash: createHash("sha256").update(emailToken).digest("hex"),
        purpose: "VERIFY_EMAIL",
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    assert.equal(
      (await call("auth/verification/confirm", "POST", { token: emailToken }))
        .response.status,
      201,
    );
    assert.equal(
      (await call("auth/verification/confirm", "POST", { token: emailToken }))
        .response.status,
      400,
      "email tokens are single-use",
    );
    await db.user.update({
      where: { id: admin.id },
      data: { role: "SUPER_ADMIN" },
    });
    assert.equal(
      (await call("admin/overview", "GET", undefined, owner)).response.status,
      403,
    );
    assert.equal(
      (
        await call(
          "lists",
          "POST",
          { name: "Blocked origin" },
          owner,
          "https://untrusted.invalid",
        )
      ).response.status,
      403,
    );
    assert.equal(
      (
        await call(
          "lists",
          "POST",
          { name: "Blocked CSRF" },
          { ...owner, csrf: "wrong" },
        )
      ).response.status,
      403,
    );
    assert.equal(
      (
        await call("auth/login", "POST", {
          email: `test-retailer-${suffix}@example.invalid`,
          password: "incorrect-password",
        })
      ).response.status,
      401,
    );
    const r = await call(
      "retailer/register",
      "POST",
      {
        name: `TEST ONLY Store ${suffix}`,
        slug: `test-store-${suffix}`,
        description:
          "Disposable integration test retailer. Not a participating business.",
      },
      owner,
    );
    assert.equal(r.response.status, 201, JSON.stringify(r.data));
    retailers.push(r.data.id);
    assert.equal(
      (
        await call(
          `retailer/${r.data.id}`,
          "PATCH",
          { name: "Intrusion" },
          other,
        )
      ).response.status,
      403,
    );
    const kannur = await db.location.findUniqueOrThrow({
        where: { code: "IN-KL-kannur" },
      }),
      ernakulam = await db.location.findUniqueOrThrow({
        where: { code: "IN-KL-ernakulam" },
      });
    assert.equal(
      (
        await call(
          `admin/retailers/${r.data.id}/status`,
          "PATCH",
          { status: "ACTIVE" },
          admin,
        )
      ).response.status,
      200,
    );
    const b = await call(
      `retailer/${r.data.id}/branches`,
      "POST",
      {
        name: "TEST ONLY Kannur branch",
        address: "Test address, not a real store",
        locationId: kannur.id,
      },
      owner,
    );
    assert.equal(b.response.status, 201, JSON.stringify(b.data));
    await call(`me/follows/${r.data.id}`, "POST", {}, other);
    const locality = await call(
      "admin/locations",
      "POST",
      {
        code: `TEST-${suffix}`,
        name: `TEST ONLY Locality ${suffix}`,
        kind: "LOCALITY",
        parentId: kannur.id,
      },
      admin,
    );
    assert.equal(locality.response.status, 201, JSON.stringify(locality.data));
    localities.push(locality.data.id);
    const start = new Date(Date.now() - 3600000).toISOString(),
      end = new Date(Date.now() + 86400000).toISOString();
    const c = await call(
      "retailer/campaigns",
      "POST",
      {
        retailerId: r.data.id,
        title: `TEST ONLY Campaign ${suffix}`,
        startsAt: start,
        endsAt: end,
        regionIds: [kannur.id],
        branchIds: [b.data.id],
      },
      owner,
    );
    assert.equal(c.response.status, 201, JSON.stringify(c.data));
    campaigns.push(c.data.id);
    const category = await db.category.findFirstOrThrow();
    const p = await call(
      "admin/products",
      "POST",
      {
        name: `TEST ONLY Product ${suffix}`,
        slug: `test-product-${suffix}`,
        categoryId: category.id,
        label: "Test 1kg",
        quantity: 1,
        unit: "kg",
        packaging: "Test bag",
      },
      admin,
    );
    assert.equal(p.response.status, 201, JSON.stringify(p.data));
    products.push(p.data.id);
    const search = await call(
      `search?q=${encodeURIComponent(suffix)}&location=${kannur.id}`,
    );
    assert.equal(search.response.status, 200, JSON.stringify(search.data));
    assert.ok(search.data.items.some((x: any) => x.id === p.data.id));
    const coupon = await call(
      "admin/coupons",
      "POST",
      {
        retailerId: r.data.id,
        title: `TEST ONLY Coupon ${suffix}`,
        description: "Disposable test coupon",
        discountType: "PERCENT",
        discountValue: 10,
        startsAt: start,
        endsAt: end,
        instructions: "Test only, not redeemable",
        terms: "Integration test only",
        regionIds: [locality.data.id],
        active: true,
      },
      admin,
    );
    assert.equal(coupon.response.status, 201, JSON.stringify(coupon.data));
    coupons.push(coupon.data.id);
    assert.ok(
      (await call(`coupons?location=${kannur.id}`)).data.some(
        (x: any) => x.id === coupon.data.id,
      ),
      "district discovery includes locality-only coupons with their explicit scope",
    );
    assert.ok(
      !(await call(`coupons?location=${ernakulam.id}`)).data.some(
        (x: any) => x.id === coupon.data.id,
      ),
      "locality coupon does not leak to another district",
    );
    const o = await call(
      "retailer/offers",
      "POST",
      {
        campaignId: c.data.id,
        variantId: p.data.variants[0].id,
        price: 75,
        originalPrice: 100,
        startsAt: start,
        endsAt: end,
        regionIds: [kannur.id],
        branchIds: [b.data.id],
      },
      owner,
    );
    assert.equal(o.response.status, 201, JSON.stringify(o.data));
    assert.equal(
      (await call(`retailer/campaigns/${c.data.id}/submit`, "POST", {}, owner))
        .response.status,
      201,
    );
    assert.equal(
      (
        await call(
          `admin/campaigns/${c.data.id}/moderate`,
          "POST",
          { decision: "PUBLISHED", version: 2 },
          admin,
        )
      ).response.status,
      409,
    );
    assert.equal(
      (
        await call(
          `admin/campaigns/${c.data.id}/moderate`,
          "POST",
          { decision: "APPROVED", version: 2 },
          admin,
        )
      ).response.status,
      201,
    );
    assert.equal(
      (
        await call(
          `admin/campaigns/${c.data.id}/moderate`,
          "POST",
          { decision: "PUBLISHED", version: 2 },
          admin,
        )
      ).response.status,
      409,
    );
    assert.equal(
      (
        await call(
          `admin/campaigns/${c.data.id}/moderate`,
          "POST",
          { decision: "PUBLISHED", version: 3 },
          admin,
        )
      ).response.status,
      201,
    );
    const notifications = await call("notifications", "GET", undefined, other);
    assert.ok(
      notifications.data.some(
        (n: any) => n.dedupeKey === `campaign:${c.data.id}:${other.id}`,
      ),
      "publication notifies opted-in followers",
    );
    let found = await call(`offers?location=${kannur.id}&q=${suffix}`);
    assert.equal(found.data.items.length, 0, "unverified prices stay hidden");
    assert.equal((await call(`me/saved/${o.data.id}`,'POST',{},other)).response.status,404,'unverified prices cannot be accessed by saving a guessed offer id');
    assert.equal(
      (await call(`admin/offers/${o.data.id}/verify`, "POST", {}, admin))
        .response.status,
      201,
    );
    found = await call(`offers?location=${kannur.id}&q=${suffix}`);
    assert.equal(found.response.status, 200, JSON.stringify(found.data));
    assert.equal(found.data.items.length, 1);
    assert.equal((await call(`offers?location=${kannur.id}&q=${suffix}&minDiscount=30`)).data.items.length,0);
    assert.equal((await call(`offers?location=${kannur.id}&q=${suffix}&minDiscount=20`)).data.items.length,1);
    const changedTitle=`TEST ONLY Revised ${suffix}`;
    assert.equal((await call(`retailer/campaigns/${c.data.id}`,'PATCH',{title:changedTitle,description:'Reviewed replacement',version:4},owner)).response.status,200);
    assert.equal((await call(`campaigns?location=${kannur.id}&q=${suffix}`)).data.items[0].title,c.data.title,'published content remains unchanged during revision review');
    const revision=await db.campaignRevision.findFirstOrThrow({where:{campaignId:c.data.id}});
    assert.equal((await call(`admin/campaigns/${c.data.id}/revisions/${revision.id}`,'POST',{decision:'APPROVED'},admin)).response.status,201);
    assert.equal((await call(`campaigns?location=${kannur.id}&q=${suffix}`)).data.items[0].title,changedTitle);
    assert.equal(
      (await call(`offers?location=${ernakulam.id}&q=${suffix}`)).data.items
        .length,
      0,
      "branch-specific offer does not leak to another district",
    );
    assert.equal(
      (await call(`offers?q=${suffix}`)).data.items.length,
      0,
      "missing location does not imply worldwide availability",
    );
    assert.equal(
      (await call(`compare/${p.data.variants[0].id}?location=${kannur.id}`))
        .data.length,
      1,
    );
    const l = await call(
      "lists",
      "POST",
      { name: "TEST ONLY Family list" },
      owner,
    );
    assert.equal(l.response.status, 201);
    assert.equal(
      (
        await call(
          `lists/${l.data.id}/items`,
          "POST",
          { name: "Unauthorised item" },
          other,
        )
      ).response.status,
      404,
    );
    assert.equal(
      (
        await call(
          `lists/${l.data.id}/members`,
          "POST",
          { email: `test-customer-${suffix}@example.invalid` },
          owner,
        )
      ).response.status,
      201,
    );
    const item = await call(
      `lists/${l.data.id}/items`,
      "POST",
      { name: "TEST ONLY Milk", quantity: 2 },
      other,
    );
    assert.equal(item.response.status, 201);
    assert.equal(
      (
        await call(
          `lists/${l.data.id}/items/${item.data.id}`,
          "PATCH",
          { purchased: true, version: l.data.version },
          owner,
        )
      ).response.status,
      200,
    );
    assert.equal(
      (await call("lists", "GET", undefined, other)).data.some(
        (x: any) => x.id === l.data.id,
      ),
      true,
    );
    assert.equal((await call(`lists/${l.data.id}/items/${item.data.id}`,'PATCH',{purchased:false,version:l.data.version},other)).response.status,409,'stale list edits are rejected');
    await db.campaign.update({
      where: { id: c.data.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    assert.equal(
      (await call(`offers?location=${kannur.id}&q=${suffix}`)).data.items
        .length,
      0,
      "campaign expiry hides otherwise active offers immediately",
    );
    assert.ok((await db.auditLog.count({ where: { actorId: admin.id } })) > 0);
  } finally {
    await db.coupon.deleteMany({ where: { id: { in: coupons } } });
    await db.productRegion.deleteMany({
      where: { offer: { campaignId: { in: campaigns } } },
    });
    await db.offer.deleteMany({ where: { campaignId: { in: campaigns } } });
    await db.moderation.deleteMany({
      where: { campaignId: { in: campaigns } },
    });
    await db.campaign.deleteMany({ where: { id: { in: campaigns } } });
    await db.branch.deleteMany({ where: { retailerId: { in: retailers } } });
    await db.retailer.deleteMany({ where: { id: { in: retailers } } });
    await db.productVariant.deleteMany({
      where: { productId: { in: products } },
    });
    await db.product.deleteMany({ where: { id: { in: products } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.location.deleteMany({ where: { id: { in: localities } } });
    await db.$disconnect();
  }
});

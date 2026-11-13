"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Plus, Save, MapPin, ShieldCheck } from "lucide-react";
type Row = Record<string, any>;
type Api = (path: string, method?: string, body?: unknown) => Promise<any>;
type Action = (fn: () => Promise<any>, message: string) => Promise<boolean>;
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";
export function VerifyEmail({ api, action }: { api: Api; action: Action }) {
  const [token, setToken] = useState("");
  useEffect(
    () =>
      setToken(new URLSearchParams(window.location.search).get("token") || ""),
    [],
  );
  return (
    <div className="panel narrow">
      <h2>Verify your email</h2>
      <p>
        Confirm this email belongs to you before receiving private invitations.
      </p>
      <button
        className="button"
        disabled={!token}
        onClick={() =>
          action(
            () => api("auth/verification/confirm", "POST", { token }),
            "Email verified. You can now receive private invitations.",
          )
        }
      >
        Confirm email
        <ShieldCheck size={16} />
      </button>
    </div>
  );
}
export function RecoveryForm({ api, action }: { api: Api; action: Action }) {
  const [token, setToken] = useState("");
  useEffect(
    () =>
      setToken(new URLSearchParams(window.location.search).get("token") || ""),
    [],
  );
  return (
    <form
      className="panel stack-form narrow"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        action(
          () =>
            api(
              `auth/${token ? "reset" : "recover"}`,
              "POST",
              token
                ? { token, password: f.get("password") }
                : { email: f.get("email") },
            ),
          token
            ? "Password reset. Sign in with your new password."
            : "If an active account exists, a recovery link has been sent.",
        );
      }}
    >
      <h2>{token ? "Choose a new password" : "Recover your account"}</h2>
      <p>
        {token
          ? "Resetting your password signs out all existing sessions."
          : "We’ll email you a short-lived recovery link."}
      </p>
      {token ? (
        <label>
          New password
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            required
            autoComplete="new-password"
          />
        </label>
      ) : (
        <label>
          Email address
          <input name="email" type="email" required autoComplete="email" />
        </label>
      )}
      <button className="button">
        {token ? "Reset password" : "Send recovery link"}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
export function AccountPreferences({
  user,
  api,
  action,
}: {
  user: Row;
  api: Api;
  action: Action;
}) {
  return (
    <form
      className="stack-form preferences"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        action(
          () =>
            api("me/preferences", "PATCH", {
              language: f.get("language"),
              theme: f.get("theme"),
              notifications: f.get("notifications") === "on",
            }),
          "Preferences saved",
        );
      }}
    >
      {!user.emailVerifiedAt && (
        <div className="verification-note">
          <p>Verify your email before receiving private invitations.</p>
          <button
            type="button"
            className="outline-button"
            onClick={() =>
              action(
                () => api("auth/verification/request", "POST"),
                "Verification email sent",
              )
            }
          >
            Send verification email
          </button>
        </div>
      )}
      <label>
        Preferred language
        <select
          name="language"
          defaultValue={user.preference?.language || "en"}
        >
          <option value="en">English</option>
          <option value="ml">മലയാളം</option>
        </select>
      </label>
      <label>
        Theme
        <select name="theme" defaultValue={user.preference?.theme || "system"}>
          <option value="system">Follow device</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          name="notifications"
          defaultChecked={user.preference?.notifications !== false}
        />
        Relevant in-app notifications
      </label>
      <button className="outline-button">
        Save preferences
        <Save size={14} />
      </button>
    </form>
  );
}
export function RetailerOfferForm({
  retailer,
  api,
  action,
}: {
  retailer: Row;
  api: Api;
  action: Action;
}) {
  const [products, setProducts] = useState<Row[]>([]),
    [q, setQ] = useState(""),
    [campaign, setCampaign] = useState("");
  const drafts = retailer.campaigns.filter((c: Row) =>
    ["DRAFT", "REJECTED"].includes(c.status),
  );
  useEffect(() => {
    api(`products?q=${encodeURIComponent(q)}`)
      .then((d) => setProducts(d.items))
      .catch(() => {});
  }, [q]);
  const c = drafts.find((c: Row) => c.id === campaign) || drafts[0];
  if (!c) return null;
  return (
    <form
      className="panel stack-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          body: Row = {
            campaignId: c.id,
            variantId: f.get("variantId"),
            price: Number(f.get("price")),
            startsAt: c.startsAt,
            endsAt: c.endsAt,
            regionIds: c.regions.map((r: Row) => r.locationId),
            branchIds: c.branches.map((b: Row) => b.branchId),
          };
        if (f.get("originalPrice"))
          body.originalPrice = Number(f.get("originalPrice"));
        action(
          () => api("retailer/offers", "POST", body),
          "Offer saved for verification",
        );
      }}
    >
      <h3>Add a product offer</h3>
      <label>
        Draft campaign
        <select value={c.id} onChange={(e) => setCampaign(e.target.value)}>
          {drafts.map((c: Row) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Find a product
        <input
          placeholder="Search the product library"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <label>
        Exact variant
        <select name="variantId" required>
          <option value="">Choose brand, quantity and packaging</option>
          {products.flatMap((p) =>
            p.variants.map((v: Row) => (
              <option key={v.id} value={v.id}>
                {p.brand?.name} {p.name} — {v.label} · {v.quantity}
                {v.unit} · {v.packaging}
              </option>
            )),
          )}
        </select>
      </label>
      <label>
        Offer price (INR)
        <input name="price" type="number" min="0.01" step="0.01" required />
      </label>
      <label>
        Original price (optional)
        <input name="originalPrice" type="number" min="0.01" step="0.01" />
      </label>
      <small>
        Uses this campaign’s dates and selected locations. Prices require
        administrative verification.
      </small>
      <button className="button">
        Save offer
        <Plus size={16} />
      </button>
    </form>
  );
}
export function ContentEditor({
  row,
  api,
  action,
}: {
  row: Row;
  api: Api;
  action: Action;
}) {
  return (
    <details className="content-editor">
      <summary>Edit homepage content</summary>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          action(
            () =>
              api(
                `admin/content/${row.key}`,
                "PATCH",
                Object.fromEntries(new FormData(e.currentTarget)),
              ),
            "Homepage content saved",
          );
        }}
      >
        {["title", "titleMl", "description", "descriptionMl"].map((k) => (
          <label key={k}>
            {
              (
                {
                  title: "English title",
                  titleMl: "Malayalam title",
                  description: "English description",
                  descriptionMl: "Malayalam description",
                } as Row
              )[k]
            }
            <textarea
              name={k}
              defaultValue={row[k] || ""}
              required={k === "title" || k === "description"}
            />
          </label>
        ))}
        <button className="outline-button">
          Save changes
          <Save size={14} />
        </button>
      </form>
    </details>
  );
}
export function CatalogueReview({
  row,
  api,
  action,
}: {
  row: Row;
  api: Api;
  action: Action;
}) {
  const [page, setPage] = useState(0),
    [offers, setOffers] = useState<Row[]>([]);
  useEffect(() => {
    api("admin/offers")
      .then((d) =>
        setOffers(
          d.filter(
            (o: Row) =>
              o.campaignId === row.campaignId && o.verification === "VERIFIED",
          ),
        ),
      )
      .catch(() => {});
  }, [row.campaignId]);
  const p = row.pages?.[page];
  return (
    <details className="catalogue-review">
      <summary>Review pages and product regions</summary>
      {row.error && <p className="processing-error">{row.error}</p>}
      {p ? (
        <>
          <select
            aria-label="Review page"
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
          >
            {row.pages.map((p: Row, i: number) => (
              <option value={i} key={p.id}>
                Page {p.number}
              </option>
            ))}
          </select>
          <img
            src={`${API}/admin/pages/${p.id}/asset`}
            alt={`Review catalogue page ${p.number}`}
            loading="lazy"
          />
          <details>
            <summary>Extracted text</summary>
            <pre>{p.text || "No text extracted"}</pre>
          </details>
          <h4>Unverified extraction candidates</h4>
          {p.regions
            ?.filter((r: Row) => r.verification === "UNVERIFIED")
            .map((r: Row) => (
              <p key={r.id}>
                {r.extractedText}{" "}
                {r.candidatePrice ? `· candidate INR ${r.candidatePrice}` : ""}
              </p>
            ))}
          <form
            className="stack-form hotspot-editor"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              action(
                () =>
                  api(`admin/pages/${p.id}/regions`, "POST", {
                    x: Number(f.get("x")) / 100,
                    y: Number(f.get("y")) / 100,
                    width: Number(f.get("width")) / 100,
                    height: Number(f.get("height")) / 100,
                    offerId: f.get("offerId"),
                    extractedText: f.get("extractedText"),
                  }),
                "Verified product region added",
              );
            }}
          >
            <label>
              Verified offer
              <select name="offerId" required>
                <option value="">Choose verified offer</option>
                {offers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.variant.product.name} · INR {o.price}
                  </option>
                ))}
              </select>
            </label>
            <div className="inline-form">
              {["x", "y", "width", "height"].map((key) => (
                <label key={key}>
                  {key} (%)
                  <input
                    name={key}
                    type="number"
                    min={key === "x" || key === "y" ? 0 : 0.1}
                    max="100"
                    step="0.1"
                    required
                  />
                </label>
              ))}
            </div>
            <label>
              Product label
              <input name="extractedText" required />
            </label>
            <button className="outline-button">
              Confirm product region
              <ShieldCheck size={14} />
            </button>
          </form>
        </>
      ) : (
        <p>No processed pages yet.</p>
      )}
    </details>
  );
}
export function NearbyMap({ branches }: { branches: Row[] }) {
  const ref = useRef<HTMLDivElement>(null),
    [failed, setFailed] = useState(false);
  const style = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  useEffect(() => {
    if (!style || !ref.current) return;
    let map: any;
    let cancelled = false;
    import("maplibre-gl")
      .then((maplibre) => {
        if (cancelled || !ref.current) return;
        const points = branches.filter(
          (b) => b.latitude != null && b.longitude != null,
        );
        map = new maplibre.Map({
          container: ref.current,
          style,
          center: points.length
            ? [points[0].longitude, points[0].latitude]
            : [76.2, 10.5],
          zoom: 9,
        });
        map.addControl(new maplibre.NavigationControl());
        map.on("error", () => setFailed(true));
        const bounds = new maplibre.LngLatBounds();
        for (const b of points) {
          const text = document.createElement("div");
          text.textContent = `${b.name} — ${b.retailer?.name || ""}`;
          new maplibre.Marker({ color: "#27573f" })
            .setLngLat([b.longitude, b.latitude])
            .setPopup(new maplibre.Popup().setDOMContent(text))
            .addTo(map);
          bounds.extend([b.longitude, b.latitude]);
        }
        if (points.length > 1)
          map.fitBounds(bounds, { padding: 45, maxZoom: 13 });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [branches, style]);
  if (!style || failed)
    return (
      <p className="map-fallback">
        <MapPin size={16} />
        Map view is currently unavailable. Browse participating branches below.
      </p>
    );
  return (
    <div
      className="nearby-map"
      ref={ref}
      aria-label="Map of participating branches"
    />
  );
}
export function AdPlacements({
  location,
  api,
}: {
  location: Row | null;
  api: Api;
}) {
  const [ads, setAds] = useState<Row[]>([]);
  useEffect(() => {
    if (!location) {
      setAds([]);
      return;
    }
    let active = true;
    api(`advertisements?location=${location.id}`)
      .then((rows) => {
        if (!active) return;
        setAds(rows);
        for (const ad of rows)
          api("events", "POST", {
            type: "AD_IMPRESSION",
            entityId: ad.id,
            locationId: location.id,
          }).catch(() => {});
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [location]);
  return (
    <>
      {ads
        .filter((a) => ["HOME_BANNER", "DISTRICT"].includes(a.placement))
        .map((a) => (
          <a
            className="sponsored-banner"
            key={a.id}
            href={a.targetUrl}
            target="_blank"
            rel="sponsored noreferrer"
            onClick={() =>
              api("events", "POST", {
                type: "AD_CLICK",
                entityId: a.id,
                locationId: location?.id,
              }).catch(() => {})
            }
          >
            <span>SPONSORED</span>
            <img src={a.creativeUrl} alt={a.title} loading="lazy" />
            <h3>{a.title}</h3>
          </a>
        ))}
    </>
  );
}

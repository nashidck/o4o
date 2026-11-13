"use client";
import { useEffect, useState, useRef, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  CampaignEdit,
  CampaignRevisions,
  RetailerTeam,
  ItemEdit,
} from "./portal-tools";
import {
  RecoveryForm,
  VerifyEmail,
  RetailerOfferForm,
  ContentEditor,
  CatalogueReview,
  NearbyMap,
  AdPlacements,
  AccountPreferences,
} from "./features";
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  MapPin,
  ChevronDown,
  SlidersHorizontal,
  Heart,
  ShoppingBag,
  Store,
  BookOpen,
  Ticket,
  ListChecks,
  Sun,
  Moon,
  X,
  Check,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize,
  Bell,
  LogOut,
  ShieldCheck,
  Globe,
  Leaf,
  Milk,
  Coffee,
  Smartphone,
  Shirt,
  Sofa,
  Sparkles,
  LocateFixed,
  AlertCircle,
  Menu,
  Upload,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";
type Row = Record<string, any>;
async function api(path: string, method = "GET", body?: unknown) {
  const csrf =
    typeof window !== "undefined"
      ? sessionStorage.getItem("o4o-csrf") ||
        document.cookie
          .split("; ")
          .find((c) => c.startsWith("o4o_csrf="))
          ?.split("=")[1] ||
        ""
      : "";
  const response = await fetch(`${API}/${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error?.message || "Unable to complete request");
  return data;
}
const money = (v: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(v));
function unitPrice(offer: Row) {
  const v = offer.variant,
    quantity = Number(v?.quantity);
  if (!quantity) return null;
  const scale = v.unit === "g" || v.unit === "ml" ? 1000 : 1,
    unit = v.unit === "g" ? "kg" : v.unit === "ml" ? "l" : v.unit;
  return `${money((Number(offer.price) * scale) / quantity)} / ${unit}`;
}
const icons = [
  ShoppingBag,
  Leaf,
  Milk,
  Coffee,
  Smartphone,
  Shirt,
  Sofa,
  Sparkles,
];
export default function Experience() {
  const router = useRouter(),
    path = usePathname();
  const [location, setLocation] = useState<Row | null>(null),
    [locationOpen, setLocationOpen] = useState(false),
    [locationRows, setLocationRows] = useState<Row[]>([]),
    [trail, setTrail] = useState<Row[]>([]),
    [locationQuery, setLocationQuery] = useState("");
  const [language, setLanguage] = useState("en"),
    [dark, setDark] = useState(false),
    [menu, setMenu] = useState(false),
    [user, setUser] = useState<Row | null>(null),
    [auth, setAuth] = useState(false),
    [register, setRegister] = useState(false);
  const [categories, setCategories] = useState<Row[]>([]),
    [content, setContent] = useState<Row[]>([]),
    [data, setData] = useState<Row[]>([]),
    [campaigns, setCampaigns] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [q, setQ] = useState(""),
    [category, setCategory] = useState(""),
    [sort, setSort] = useState("newest"),
    [refresh, setRefresh] = useState(0),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Row | null>(null),
    [lists, setLists] = useState<Row[]>([]),
    [selectedOffer, setSelectedOffer] = useState<Row | null>(null);
  const [suggestions, setSuggestions] = useState<Row[]>([]),
    [searchFocused, setSearchFocused] = useState(false);
  const [offerFilters, setOfferFilters] = useState<Row>({});
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    if (!locationOpen && !auth && !selectedOffer) return;
    const previous = document.activeElement as HTMLElement,
      modal = document.querySelector(".modal") as HTMLElement | null;
    if (!modal) return;
    const focusable = () =>
      Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]',
        ),
      );
    focusable()[0]?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLocationOpen(false);
        setAuth(false);
        setSelectedOffer(null);
      }
      if (e.key === "Tab") {
        const nodes = focusable(),
          first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [locationOpen, auth, selectedOffer]);
  const ml = language === "ml",
    t = (en: string, mal: string) => (ml ? mal : en);
  const section = path.split("/")[1] || "home",
    slug = path.split("/")[2];
  const params = new URLSearchParams({
    q,
    sort,
    page: String(page),
    ...(location ? { location: location.id } : {}),
    ...(category ? { category } : {}),
    ...offerFilters,
  }).toString();
  useEffect(() => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      api(
        `search?q=${encodeURIComponent(q)}${location ? `&location=${location.id}` : ""}`,
      )
        .then((d) => {
          if (active) setSuggestions(d.items);
        })
        .catch(() => {
          if (active) setSuggestions([]);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, location]);
  useEffect(() => {
    const initialParams = new URLSearchParams(window.location.search);
    setQ(initialParams.get("q") || "");
    setCategory(initialParams.get("category") || "");
    if (section === "products") setSort("name");
    const saved = localStorage.getItem("o4o-location");
    try {
      if (saved) setLocation(JSON.parse(saved));
    } catch {}
    setLanguage(localStorage.getItem("o4o-language") || "en");
    setDark(localStorage.getItem("o4o-theme") === "dark");
    api("me")
      .then(setUser)
      .catch(() => {});
    api("categories")
      .then(setCategories)
      .catch(() => {});
    api("content")
      .then((rows) => {
        setContent(rows);
        setContentReady(true);
      })
      .catch(() => {});
    setPreferencesReady(true);
  }, []);
  useEffect(() => {
    if (!preferencesReady) return;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.lang = language;
    localStorage.setItem("o4o-theme", dark ? "dark" : "light");
    localStorage.setItem("o4o-language", language);
  }, [dark, language, preferencesReady]);
  useEffect(() => {
    if (!locationOpen) return;
    let active = true;
    api(
      `locations?${locationQuery ? `q=${encodeURIComponent(locationQuery)}` : trail.length ? `parent=${trail[trail.length - 1].id}` : ""}`,
    )
      .then((d) => {
        if (active) setLocationRows(d);
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, [locationOpen, trail, locationQuery]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setDetail(null);
    let request: Promise<any>;
    if (section === "home")
      request = Promise.all([
        api(`retailers?${params}&limit=6`),
        api(`campaigns?${params}&limit=4`),
      ]).then(([r, c]) => {
        if (active) setCampaigns(c.items);
        return r;
      });
    else if (section === "retailers" && slug)
      request = Promise.all([
        api(`retailers/${slug}`),
        api(`campaigns?${params}`),
      ]).then(([r, c]) => {
        if (active) {
          setDetail(r);
          setCampaigns(c.items.filter((x: Row) => x.retailer.id === r.id));
        }
        return { items: [] };
      });
    else if (["recover", "verify-email"].includes(section))
      request = Promise.resolve([]);
    else if (section === "lists") request = api("lists");
    else if (section === "saved")
      request = api("me/saved").then((d) => d.map((x: Row) => x.offer));
    else if (section === "notifications") request = api("notifications");
    else if (section === "account")
      request = api("me").then((d) => {
        if (active) setUser(d);
        return [];
      });
    else if (section === "nearby") request = api(`branches?${params}`);
    else if (section === "catalogues" && slug)
      request = api(`catalogues/${slug}?${params}`).then((d) => {
        if (active) setDetail(d);
        return [];
      });
    else if (section === "admin")
      request = api("admin/overview").then((d) => {
        if (active) setDetail(d);
        return [];
      });
    else if (section === "retailer") request = api("retailer/overview");
    else
      request = api(
        `${["offers", "retailers", "products", "coupons", "campaigns"].includes(section) ? section : "offers"}?${params}`,
      );
    request
      .then((d) => {
        if (active) {
          setData(Array.isArray(d) ? d : d.items || []);
          setTotal(d.total || 0);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setData([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [section, slug, params, refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function action(fn: () => Promise<any>, success: string) {
    try {
      await fn();
      setNotice(success);
      setRefresh((x) => x + 1);
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Request failed");
      return false;
    }
  }
  function chooseLocation(row: Row) {
    setLocation(row);
    localStorage.setItem("o4o-location", JSON.stringify(row));
    setLocationOpen(false);
    setPage(1);
    if (user)
      api("me/preferences", "PATCH", { locationId: row.id }).catch(() => {});
  }
  async function signIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const result = await api(
        `auth/${register ? "register" : "login"}`,
        "POST",
        {
          email: f.get("email"),
          password: f.get("password"),
          ...(register ? { name: f.get("name") } : {}),
        },
      );
      sessionStorage.setItem("o4o-csrf", result.csrf);
      setUser(result.user);
      setAuth(false);
      setRefresh((x) => x + 1);
      setNotice("Welcome to O4O");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  function requireUser(fn: () => void) {
    if (!user) setAuth(true);
    else fn();
  }
  const hero = content.find((c) => c.key === "home-hero");
  const enabled = (key: string) =>
    !contentReady || content.some((c) => c.key === key);
  const title = (key: string, fallback: string) => {
    const c = content.find((c) => c.key === key);
    return c ? (ml && c.titleMl ? c.titleMl : c.title) : fallback;
  };
  const navigation = [
    ["/", t("Discover", "കണ്ടെത്തൂ")],
    ["/offers", t("Offers", "ഓഫറുകൾ")],
    ["/retailers", t("Stores", "കടകൾ")],
    ["/campaigns", t("Catalogues", "കാറ്റലോഗുകൾ")],
    ["/coupons", t("Coupons", "കൂപ്പണുകൾ")],
    ["/nearby", t("Nearby", "അടുത്ത്")],
  ];
  function empty(title: string, description: string) {
    return (
      <div className="empty">
        <div className="empty-icon">
          <ShoppingBag size={28} />
        </div>
        <h3>{title}</h3>
        <p>{description}</p>
        {!location && (
          <button className="button" onClick={() => setLocationOpen(true)}>
            Choose your location <MapPin size={16} />
          </button>
        )}
      </div>
    );
  }
  function retailerCard(r: Row) {
    return (
      <Link className="retailer-card" href={`/retailers/${r.slug}`} key={r.id}>
        <div className="retailer-art">
          <Store size={48} strokeWidth={1.3} />
          <span className="retailer-initial">{r.name.slice(0, 1)}</span>
        </div>
        <div className="retailer-info">
          <div>
            <h3>{r.name}</h3>
            <p>
              {r.categories?.map((c: Row) => c.category.name).join(" · ") ||
                "Local retailer"}
            </p>
          </div>
          <ArrowUpRight size={19} />
        </div>
        <div className="retailer-meta">
          <MapPin size={13} />
          {r._count?.branches || r.branches?.length || 0} participating branches
        </div>
      </Link>
    );
  }
  function offerCard(o: Row) {
    const p = o.variant?.product;
    return (
      <article className="offer-card" key={o.id}>
        <div className="offer-art">
          {p?.imageUrl ? (
            <img src={p.imageUrl} alt={p.name} />
          ) : (
            <ShoppingBag size={52} strokeWidth={1.2} />
          )}
          <button
            className="save"
            aria-label="Save offer"
            onClick={() =>
              requireUser(() =>
                action(() => api(`me/saved/${o.id}`, "POST"), "Offer saved"),
              )
            }
          >
            <Heart size={18} />
          </button>
          {o.originalPrice && Number(o.originalPrice) > Number(o.price) && (
            <span className="discount">
              {Math.round(
                (1 - Number(o.price) / Number(o.originalPrice)) * 100,
              )}
              % off
            </span>
          )}
        </div>
        <div className="offer-body">
          <span className="eyebrow">{o.retailer?.name}</span>
          <h3>{ml && p?.nameMl ? p.nameMl : p?.name}</h3>
          <p>
            {o.variant?.label} · {o.variant?.quantity}
            {o.variant?.unit}
          </p>
          <div className="price">
            {money(o.price)}{" "}
            {o.originalPrice && <del>{money(o.originalPrice)}</del>}
          </div>
          <p className="validity">
            <ShieldCheck size={13} />
            {new Date(o.endsAt) <= new Date() ||
            new Date(o.campaign?.endsAt) <= new Date()
              ? "Expired · Ended"
              : "Verified · Until"}{" "}
            {new Date(o.endsAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })}
          </p>
          <p className="scope">
            <MapPin size={12} />
            {o.branches?.length
              ? `${o.branches.length} selected branches`
              : o.regions?.map((r: Row) => r.location.name).join(", ")}
          </p>
          <button className="text-button" onClick={() => setSelectedOffer(o)}>
            View offer <ArrowRight size={15} />
          </button>
        </div>
      </article>
    );
  }
  function campaignCard(c: Row) {
    const flyer = c.flyers?.[0];
    return (
      <article className="campaign-card" key={c.id}>
        <div className="campaign-art">
          <BookOpen size={56} strokeWidth={1.1} />
          <span>{c.retailer.name}</span>
        </div>
        <div className="offer-body">
          <span className="eyebrow">{c.retailer.name}</span>
          <h3>{c.title}</h3>
          <p>
            {flyer ? `${flyer.pageCount} pages` : "Campaign details"} · Until{" "}
            {new Date(c.endsAt).toLocaleDateString("en-IN")}
          </p>
          <p className="scope">
            {c.branches?.length
              ? `${c.branches.length} selected branches`
              : c.regions?.map((r: Row) => r.location.name).join(", ")}
          </p>
          {flyer ? (
            <Link className="text-button" href={`/catalogues/${flyer.id}`}>
              Open catalogue <ArrowRight size={16} />
            </Link>
          ) : (
            <span className="muted">No published catalogue</span>
          )}
        </div>
      </article>
    );
  }
  return (
    <>
      <div className="announcement">
        <span>
          {t(
            "A little discovery. A lot of possibility.",
            "നിങ്ങളുടെ അടുത്തുള്ള മികച്ച കണ്ടെത്തലുകൾ.",
          )}
        </span>
        <span className="announcement-right">
          Made for local shopping <span className="little-dot" /> Kerala, India
        </span>
      </div>
      <header>
        <div className="header-main container">
          <Link className="logo" href="/" aria-label="O4O home">
            o<span>4</span>o<i />
          </Link>
          <button
            className="location-control"
            onClick={() => setLocationOpen(true)}
          >
            <MapPin size={19} />
            <span>
              <small>{t("DISCOVERING IN", "നിങ്ങളുടെ സ്ഥലം")}</small>
              <strong>
                {location
                  ? ml && location.nameMl
                    ? location.nameMl
                    : location.name
                  : t("Choose location", "സ്ഥലം തിരഞ്ഞെടുക്കുക")}
              </strong>
            </span>
            <ChevronDown size={14} />
          </button>
          <form
            className="header-search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/offers?q=${encodeURIComponent(q)}`);
            }}
          >
            <Search size={19} />
            <input
              aria-label="Search offers and stores"
              placeholder={t("Search for a good find…", "ഓഫറുകളും കടകളും തിരയൂ…")}
              value={q}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            <kbd>↵</kbd>
            {searchFocused && suggestions.length > 0 && (
              <div className="search-suggestions">
                {suggestions.map((s) => (
                  <Link
                    key={`${s.kind}-${s.id}`}
                    href={s.href}
                    onClick={() => setSearchFocused(false)}
                  >
                    <span>{s.name}</span>
                    <small>{s.kind}</small>
                  </Link>
                ))}
              </div>
            )}
          </form>
          <div className="header-actions">
            <button
              className="language"
              onClick={() => setLanguage(ml ? "en" : "ml")}
            >
              <Globe size={16} />
              {ml ? "EN" : "മലയാളം"}
            </button>
            <button
              className="icon-button theme-button"
              aria-label="Toggle theme"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <Link
              className="icon-button"
              href="/saved"
              aria-label="Saved offers"
            >
              <Heart size={20} />
            </Link>
            <button
              className="sign-in"
              onClick={() => (user ? router.push("/account") : setAuth(true))}
            >
              {user ? user.name.split(" ")[0] : t("Sign in", "സൈൻ ഇൻ")}
              <ArrowUpRight size={15} />
            </button>
            <button
              className="icon-button mobile-menu"
              aria-label="Menu"
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
          </div>
        </div>
        <div className="nav-border">
          <nav className={`container navigation ${menu ? "mobile-open" : ""}`}>
            {navigation.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenu(false)}
                className={path === href ? "active" : ""}
              >
                {label}
              </Link>
            ))}
            <Link className="shopping-list-link" href="/lists">
              <ListChecks size={17} />
              {t("My shopping lists", "ഷോപ്പിംഗ് ലിസ്റ്റുകൾ")}
            </Link>
            {menu && (
              <div className="mobile-tools">
                <button
                  className="outline-button"
                  onClick={() => setLanguage(ml ? "en" : "ml")}
                >
                  <Globe size={15} />
                  {ml ? "English" : "മലയാളം"}
                </button>
                <button
                  className="outline-button"
                  onClick={() => setDark(!dark)}
                >
                  {dark ? <Sun size={15} /> : <Moon size={15} />}{" "}
                  {dark ? "Light theme" : "Dark theme"}
                </button>
                <Link href="/account">My account</Link>
              </div>
            )}
          </nav>
        </div>
      </header>
      <main className="container">
        <AdPlacements location={location} api={api} />
        {section === "home" ? (
          <>
            <section className="hero" hidden={!enabled("home-hero")}>
              <div className="hero-copy">
                <span className="pill">
                  <span />
                  {t(
                    "YOUR NEIGHBOURHOOD. MORE POSSIBILITIES.",
                    "നിങ്ങളുടെ നാട്ടിലെ മികച്ച കണ്ടെത്തലുകൾ.",
                  )}
                </span>
                <h1>
                  {hero ? (
                    (ml && hero.titleMl ? hero.titleMl : hero.title)
                      .split("\n")
                      .map((s: string, i: number) => (
                        <span key={i}>
                          {s}
                          {i === 0 && <br />}
                        </span>
                      ))
                  ) : (
                    <>
                      Good finds.
                      <br />
                      <em>Closer to home.</em>
                    </>
                  )}
                </h1>
                <p>
                  {hero
                    ? ml && hero.descriptionMl
                      ? hero.descriptionMl
                      : hero.description
                    : t(
                        "Discover local stores, explore their catalogues, and plan a little smarter. Your next good find starts here.",
                        "അടുത്തുള്ള കടകളും കാറ്റലോഗുകളും കണ്ടെത്തൂ. നിങ്ങളുടെ ഷോപ്പിംഗ് എളുപ്പമാക്കൂ.",
                      )}
                </p>
                <div className="hero-ctas">
                  <Link className="button" href="/offers">
                    {t("Explore offers", "ഓഫറുകൾ കാണൂ")}
                    <ArrowUpRight size={18} />
                  </Link>
                  <Link className="hero-secondary" href="/retailers">
                    {t("Find your stores", "കടകൾ കണ്ടെത്തൂ")}
                    <ArrowRight size={16} />
                  </Link>
                </div>
                <div className="hero-note">
                  <ShieldCheck size={16} />
                  {t(
                    "Local discoveries. Clearly verified offers.",
                    "പ്രാദേശിക കടകൾ. സ്ഥിരീകരിച്ച ഓഫറുകൾ.",
                  )}
                </div>
              </div>
              <div
                className="hero-visual"
                aria-label="Illustration of a shopping bag with groceries"
              >
                <span className="orbit orbit-one" />
                <span className="orbit orbit-two" />
                <span className="visual-label">
                  THE EVERYDAY
                  <br />
                  DISCOVERY CLUB
                </span>
                <div className="grocery lemon lemon-one" />
                <div className="grocery lemon lemon-two" />
                <div className="grocery carton">
                  <span>
                    O4O
                    <br />
                    <b>fresh</b>
                  </span>
                </div>
                <div className="grocery baguette">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="grocery greens">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="shopping-bag">
                  <div className="bag-handle" />
                  <span>
                    o4o<small>GOOD FINDS INSIDE.</small>
                  </span>
                  <div className="bag-fold" />
                </div>
                <div className="floating-note note-top">
                  <Leaf size={17} />
                  <div>
                    A fresh perspective<small>on everyday shopping</small>
                  </div>
                </div>
                <div className="floating-note note-bottom">
                  <MapPin size={18} />
                  <div>
                    Great finds, nearby
                    <small>Start with your neighbourhood</small>
                  </div>
                  <ArrowUpRight size={18} />
                </div>
                <span className="asterisk">✳</span>
              </div>
            </section>
            <section
              className="category-section"
              hidden={!enabled("home-categories")}
            >
              <div className="section-heading">
                <div>
                  <span className="eyebrow">A LITTLE BIT OF EVERYTHING</span>
                  <h2>
                    {title(
                      "home-categories",
                      t("What’s on your list?", "നിങ്ങളുടെ ലിസ്റ്റിൽ എന്തുണ്ട്?"),
                    )}
                  </h2>
                </div>
                <Link className="subtle-link" href="/products">
                  {t("Explore all categories", "എല്ലാ വിഭാഗങ്ങളും")}
                  <ArrowRight size={17} />
                </Link>
              </div>
              <div className="category-grid">
                {categories.length ? (
                  categories
                    .filter((c) =>
                      [
                        "groceries",
                        "produce",
                        "dairy",
                        "beverages",
                        "electronics",
                        "fashion",
                        "furniture",
                        "personal-care",
                      ].includes(c.slug),
                    )
                    .slice(0, 8)
                    .map((c, i) => {
                      const Icon =
                        (
                          {
                            groceries: ShoppingBag,
                            produce: Leaf,
                            dairy: Milk,
                            beverages: Coffee,
                            electronics: Smartphone,
                            fashion: Shirt,
                            furniture: Sofa,
                            "personal-care": Sparkles,
                          } as Record<string, typeof Store>
                        )[c.slug] || ShoppingBag;
                      return (
                        <Link
                          key={c.id}
                          href={`/offers?category=${c.slug}`}
                          className={`category-card tone-${i}`}
                        >
                          <div>
                            <Icon size={29} strokeWidth={1.4} />
                          </div>
                          <span>{ml && c.nameMl ? c.nameMl : c.name}</span>
                        </Link>
                      );
                    })
                ) : (
                  <div className="reference-empty">
                    Categories will appear once the database is connected and
                    reference data is seeded.
                  </div>
                )}
              </div>
            </section>
            <section
              className="stores-section"
              hidden={!enabled("home-retailers")}
            >
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    FAMILIAR STORES. NEW DISCOVERIES.
                  </span>
                  <h2>
                    {title(
                      "home-retailers",
                      t(
                        "Explore your local favourites",
                        "നിങ്ങളുടെ പ്രിയപ്പെട്ട കടകൾ",
                      ),
                    )}
                  </h2>
                </div>
                <Link className="subtle-link" href="/retailers">
                  {t("All stores", "എല്ലാ കടകളും")}
                  <ArrowRight size={17} />
                </Link>
              </div>
              {loading ? (
                <div className="skeleton-grid">
                  {[1, 2, 3].map((n) => (
                    <div className="skeleton" key={n} />
                  ))}
                </div>
              ) : error ? (
                <ErrorBox message={error} />
              ) : data.length ? (
                <div className="retailer-grid">{data.map(retailerCard)}</div>
              ) : (
                empty(
                  t("Your neighbourhood is next", "നിങ്ങളുടെ നാട്ടിലെ കടകൾ ഉടൻ"),
                  t(
                    "Verified participating retailers will appear here as they join O4O.",
                    "സ്ഥിരീകരിച്ച കടകൾ O4Oയിൽ ചേരുമ്പോൾ ഇവിടെ കാണാം.",
                  ),
                )
              )}
            </section>
            <section
              className="catalogue-section"
              hidden={!enabled("home-catalogues")}
            >
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    FLIP THROUGH. FIND SOMETHING GOOD.
                  </span>
                  <h2>
                    {title(
                      "home-catalogues",
                      t("Fresh off the shelves", "പുതിയ കാറ്റലോഗുകൾ"),
                    )}
                  </h2>
                </div>
                <Link className="subtle-link" href="/campaigns">
                  View catalogues
                  <ArrowRight size={17} />
                </Link>
              </div>
              {campaigns.length ? (
                <div className="cards-grid">{campaigns.map(campaignCard)}</div>
              ) : (
                <div className="catalogue-empty">
                  <BookOpen size={34} strokeWidth={1.3} />
                  <div>
                    <h3>
                      {t(
                        "The next chapter starts locally",
                        "അടുത്ത കാറ്റലോഗിനായി കാത്തിരിക്കൂ",
                      )}
                    </h3>
                    <p>
                      {t(
                        "Published catalogues for your selected location will appear here.",
                        "തിരഞ്ഞെടുത്ത സ്ഥലത്തെ കാറ്റലോഗുകൾ ഇവിടെ കാണാം.",
                      )}
                    </p>
                  </div>
                  <button
                    className="outline-button"
                    onClick={() => setLocationOpen(true)}
                  >
                    Set your location <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </section>
            <section
              className="planning-banner"
              hidden={!enabled("home-lists")}
            >
              <div className="banner-icon">
                <ListChecks size={40} strokeWidth={1.3} />
              </div>
              <div>
                <span className="eyebrow">
                  LESS SCROLLING. SMARTER SHOPPING.
                </span>
                <h2>
                  {title(
                    "home-lists",
                    t(
                      "A good shop starts with a little list.",
                      "ഒരു നല്ല ഷോപ്പിംഗ് ലിസ്റ്റിൽ നിന്ന് തുടങ്ങാം.",
                    ),
                  )}
                </h2>
                <p>
                  Keep your everyday essentials together. Share a list with your
                  people.
                </p>
              </div>
              <Link href="/lists" className="button light">
                Make your list <Plus size={18} />
              </Link>
            </section>
          </>
        ) : (
          <>
            <div className="page-title">
              <span className="eyebrow">YOUR LOCAL SHOPPING COMPANION</span>
              <h1>
                {(
                  {
                    offers: t("Find your next good deal", "മികച്ച ഓഫറുകൾ കണ്ടെത്തൂ"),
                    retailers:
                      detail?.name ||
                      t("Meet your local stores", "പ്രാദേശിക കടകൾ"),
                    campaigns: t("A world of good finds", "കാറ്റലോഗുകൾ"),
                    products: t(
                      "Everyday essentials, discovered",
                      "ഉൽപ്പന്നങ്ങൾ കണ്ടെത്തൂ",
                    ),
                    coupons: t("A little extra saving", "കൂപ്പണുകൾ"),
                    nearby: t("Around your neighbourhood", "അടുത്തുള്ള കടകൾ"),
                    lists: t("Your shopping lists", "ഷോപ്പിംഗ് ലിസ്റ്റുകൾ"),
                    saved: t("Saved for a good shop", "സംരക്ഷിച്ച ഓഫറുകൾ"),
                    account: "Your O4O",
                    admin: "O4O control room",
                    retailer: "Your retail workspace",
                    notifications: "Your notifications",
                    catalogues: detail?.campaign?.title || "Digital catalogue",
                  } as Row
                )[section] || "Discover O4O"}
              </h1>
              <p>
                {location
                  ? `Discovering in ${location.name}`
                  : "Choose a location for relevant offers and catalogues."}
              </p>
            </div>
            {[
              "offers",
              "retailers",
              "campaigns",
              "products",
              "coupons",
            ].includes(section) &&
              !slug && (
                <div className="filters">
                  {section === "offers" && (
                    <AdvancedFilters
                      location={location}
                      onChange={setOfferFilters}
                    />
                  )}
                  <div className="filter-search">
                    <Search size={18} />
                    <input
                      placeholder={`Search ${section}…`}
                      value={q}
                      onChange={(e) => {
                        setQ(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <select
                    aria-label="Category"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Sort"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    {section !== "products" && (
                      <option value="newest">Recently added</option>
                    )}
                    {["offers", "campaigns", "coupons"].includes(section) && (
                      <option value="expiry">Ending soon</option>
                    )}
                    {section === "offers" && (
                      <option value="price">Lowest price</option>
                    )}
                    <option value="name">A–Z</option>
                    {section === "offers" && (
                      <option value="discount">Largest discount</option>
                    )}
                    {section === "retailers" && (
                      <option value="popular">Most followed</option>
                    )}
                  </select>
                  <button
                    className="outline-button"
                    onClick={() => setLocationOpen(true)}
                  >
                    <MapPin size={16} />
                    {location?.name || "Location"}
                  </button>
                </div>
              )}
            {error ? (
              <ErrorBox
                message={error}
                retry={() => setRefresh((x) => x + 1)}
                auth={() => setAuth(true)}
              />
            ) : loading ? (
              <div className="skeleton-grid">
                {[1, 2, 3].map((n) => (
                  <div className="skeleton" key={n} />
                ))}
              </div>
            ) : (
              <>
                {section === "retailers" && detail ? (
                  <>
                    <div className="profile-panel">
                      <Store size={45} />
                      <div>
                        <h2>{detail.name}</h2>
                        <p>{detail.description}</p>
                      </div>
                      <button
                        className="button"
                        onClick={() =>
                          requireUser(() =>
                            action(
                              () => api(`me/follows/${detail.id}`, "POST"),
                              "Following retailer",
                            ),
                          )
                        }
                      >
                        <Heart size={17} />
                        Follow store
                      </button>
                    </div>
                    <h2 className="spaced-heading">Participating branches</h2>
                    <div className="cards-grid">
                      {detail.branches.map((b: Row) => (
                        <Branch key={b.id} b={b} />
                      ))}
                    </div>
                    <h2 className="spaced-heading">Current campaigns</h2>
                    {campaigns.length ? (
                      <div className="cards-grid">
                        {campaigns.map(campaignCard)}
                      </div>
                    ) : (
                      empty(
                        "No active campaigns",
                        "Approved campaigns will appear here during their validity window.",
                      )
                    )}
                  </>
                ) : null}
                {["offers", "saved"].includes(section) &&
                  (data.length ? (
                    <div className="cards-grid">{data.map(offerCard)}</div>
                  ) : (
                    empty(
                      "No offers to show yet",
                      section === "saved"
                        ? "Save an offer to keep it here."
                        : "Verified active offers for your location will appear here once published.",
                    )
                  ))}
                {section === "retailers" &&
                  !slug &&
                  (data.length ? (
                    <div className="retailer-grid">
                      {data.map(retailerCard)}
                    </div>
                  ) : (
                    empty(
                      "No participating stores found",
                      "Try a different category or location.",
                    )
                  ))}
                {section === "campaigns" &&
                  (data.length ? (
                    <div className="cards-grid">{data.map(campaignCard)}</div>
                  ) : (
                    empty(
                      "No active catalogues here yet",
                      "Published campaigns are filtered to your location and participating branches.",
                    )
                  ))}
                {section === "products" &&
                  (data.length ? (
                    <div className="cards-grid">
                      {data.map((p) => (
                        <article className="panel" key={p.id}>
                          <ShoppingBag size={30} />
                          <span className="eyebrow">{p.brand?.name}</span>
                          <h3>{p.name}</h3>
                          {p.variants.map((v: Row) => (
                            <button
                              className="outline-button"
                              key={v.id}
                              onClick={() =>
                                action(async () => {
                                  const matches = await api(
                                    `compare/${v.id}?${params}`,
                                  );
                                  setSelectedOffer({
                                    comparison: matches,
                                    product: p,
                                    variant: v,
                                  });
                                }, "Comparison loaded")
                              }
                            >
                              Compare {v.label} · {v.quantity}
                              {v.unit}
                              <ArrowRight size={15} />
                            </button>
                          ))}
                        </article>
                      ))}
                    </div>
                  ) : (
                    empty(
                      "The product library is growing",
                      "Products will appear after an administrator creates and verifies them.",
                    )
                  ))}
                {section === "coupons" &&
                  (data.length ? (
                    <div className="cards-grid">
                      {data.map((c) => (
                        <article className="coupon panel" key={c.id}>
                          <Ticket size={30} />
                          <span className="eyebrow">{c.retailer.name}</span>
                          <h3>{c.title}</h3>
                          <p>{c.description}</p>
                          <p>{c.instructions}</p>
                          {c.code && (
                            <button
                              className="coupon-code"
                              onClick={() =>
                                action(
                                  () => navigator.clipboard.writeText(c.code),
                                  "Coupon code copied",
                                )
                              }
                            >
                              {c.code}
                            </button>
                          )}
                          <small>{c.terms}</small>
                          <p>
                            Valid until{" "}
                            {new Date(c.endsAt).toLocaleDateString("en-IN")}
                          </p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    empty(
                      "No redeemable coupons here yet",
                      "Promotional offers and redeemable coupons are shown separately.",
                    )
                  ))}
                {section === "nearby" && (
                  <>
                    <button
                      className="button"
                      onClick={() =>
                        navigator.geolocation
                          ? navigator.geolocation.getCurrentPosition(
                              (pos) =>
                                action(
                                  async () =>
                                    setData(
                                      await api(
                                        `nearby?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}`,
                                      ),
                                    ),
                                  "Nearby stores updated",
                                ),
                              () =>
                                setNotice(
                                  "Location permission was denied. Choose a location manually.",
                                ),
                            )
                          : setNotice("Geolocation is unavailable")
                      }
                    >
                      <LocateFixed size={17} />
                      Use my location
                    </button>
                    <NearbyMap branches={data} />
                    <div className="cards-grid spaced-heading">
                      {data.map((b) => (
                        <Branch key={b.id} b={b} />
                      ))}
                    </div>
                    {!data.length &&
                      empty(
                        "No participating branches found",
                        "Only branches with supplied, authorised location information will be shown.",
                      )}
                  </>
                )}
                {section === "lists" && (
                  <>
                    <form
                      className="inline-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        const name = new FormData(form).get("name");
                        action(
                          () => api("lists", "POST", { name }),
                          "Shopping list created",
                        ).then((ok) => {
                          if (ok) form.reset();
                        });
                      }}
                    >
                      <input
                        name="name"
                        placeholder="Name your new list"
                        required
                        maxLength={200}
                      />
                      <button className="button">
                        <Plus size={17} />
                        Create list
                      </button>
                    </form>
                    {data.length
                      ? data.map((list) => (
                          <div className="list-panel panel" key={list.id}>
                            <div className="section-heading">
                              <h2>{list.name}</h2>
                              <button
                                className="icon-button"
                                aria-label="Delete list"
                                onClick={() =>
                                  action(
                                    () => api(`lists/${list.id}`, "DELETE"),
                                    "List deleted",
                                  )
                                }
                              >
                                <Trash2 size={17} />
                              </button>
                            </div>
                            {list.items.map((item: Row) => (
                              <div className="list-item" key={item.id}>
                                <button
                                  className={`checkbox ${item.purchased ? "checked" : ""}`}
                                  aria-label="Toggle purchased"
                                  onClick={() =>
                                    action(
                                      () =>
                                        api(
                                          `lists/${list.id}/items/${item.id}`,
                                          "PATCH",
                                          {
                                            purchased: !item.purchased,
                                            version: list.version,
                                          },
                                        ),
                                      "Item updated",
                                    )
                                  }
                                >
                                  {item.purchased && <Check size={14} />}
                                </button>
                                <span
                                  className={item.purchased ? "struck" : ""}
                                >
                                  {item.name}
                                  <small>
                                    {item.quantity} · {item.note}
                                  </small>
                                  <ItemEdit
                                    item={item}
                                    list={list}
                                    api={api}
                                    action={action}
                                  />
                                </span>
                                <button
                                  className="icon-button"
                                  aria-label="Remove item"
                                  onClick={() =>
                                    action(
                                      () =>
                                        api(
                                          `lists/${list.id}/items/${item.id}`,
                                          "DELETE",
                                        ),
                                      "Item removed",
                                    )
                                  }
                                >
                                  <X size={15} />
                                </button>
                              </div>
                            ))}
                            <form
                              className="inline-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                const form = e.currentTarget,
                                  f = new FormData(form);
                                action(
                                  () =>
                                    api(`lists/${list.id}/items`, "POST", {
                                      name: f.get("name"),
                                      quantity: Number(f.get("quantity")),
                                      note: f.get("note"),
                                    }),
                                  "Item added",
                                ).then((ok) => {
                                  if (ok) form.reset();
                                });
                              }}
                            >
                              <input
                                name="name"
                                placeholder="Add an item"
                                required
                              />
                              <input
                                name="quantity"
                                aria-label="Quantity"
                                type="number"
                                min="0.001"
                                step="0.001"
                                defaultValue="1"
                                className="quantity"
                              />
                              <input
                                name="note"
                                placeholder="Note (optional)"
                              />
                              <button className="button">
                                <Plus size={17} />
                              </button>
                            </form>
                            <form
                              className="inline-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                const email = new FormData(e.currentTarget).get(
                                  "email",
                                );
                                action(
                                  () =>
                                    api(`lists/${list.id}/members`, "POST", {
                                      email,
                                    }),
                                  "List shared with this account",
                                );
                              }}
                            >
                              <input
                                type="email"
                                name="email"
                                placeholder="Share with a family member’s O4O email"
                                required
                              />
                              <button className="outline-button">
                                Share list
                              </button>
                            </form>
                          </div>
                        ))
                      : empty(
                          "A little planning goes a long way",
                          "Create your first shopping list and share it with your household.",
                        )}
                  </>
                )}
                {section === "notifications" &&
                  (data.length
                    ? data.map((n) => (
                        <article className="panel" key={n.id}>
                          <h3>{n.title}</h3>
                          <p>{n.body}</p>
                          <button
                            className="text-button"
                            onClick={() =>
                              action(
                                () => api(`notifications/${n.id}`, "PATCH"),
                                "Marked as read",
                              )
                            }
                          >
                            {n.readAt ? "Read" : "Mark as read"}
                          </button>
                        </article>
                      ))
                    : empty(
                        "You’re all caught up",
                        "Relevant updates will appear here when available.",
                      ))}
                {section === "account" && user && (
                  <div className="panel account-panel">
                    <h2>Hello, {user.name}.</h2>
                    <p>{user.email}</p>
                    <AccountPreferences user={user} api={api} action={action} />
                    <div className="account-links">
                      <Link href="/lists">
                        <ListChecks />
                        Shopping lists
                        <ArrowRight />
                      </Link>
                      <Link href="/saved">
                        <Heart />
                        Saved offers
                        <ArrowRight />
                      </Link>
                      <Link href="/notifications">
                        <Bell />
                        Notifications
                        <ArrowRight />
                      </Link>
                      <Link href="/retailer">
                        <Store />
                        Retailer workspace
                        <ArrowRight />
                      </Link>
                      {["ADMIN", "SUPER_ADMIN", "MODERATOR"].includes(
                        user.role,
                      ) && (
                        <Link href="/admin">
                          <ShieldCheck />
                          Administration
                          <ArrowRight />
                        </Link>
                      )}
                    </div>
                    <button
                      className="outline-button"
                      onClick={() =>
                        action(async () => {
                          await api("auth/logout", "POST");
                          setUser(null);
                          sessionStorage.removeItem("o4o-csrf");
                          router.push("/");
                        }, "Signed out")
                      }
                    >
                      <LogOut size={16} />
                      Sign out
                    </button>
                  </div>
                )}
                {section === "recover" && (
                  <RecoveryForm api={api} action={action} />
                )}
                {section === "verify-email" && (
                  <VerifyEmail api={api} action={action} />
                )}
                {section === "admin" && detail && (
                  <Admin
                    detail={detail}
                    action={action}
                    categories={categories}
                  />
                )}
                {section === "retailer" && (
                  <RetailerPortal
                    data={data}
                    action={action}
                    categories={categories}
                  />
                )}
                {section === "catalogues" && detail && (
                  <Viewer
                    catalogue={detail}
                    location={location}
                    onOffer={setSelectedOffer}
                  />
                )}
                {total > 24 && (
                  <div className="pagination">
                    <button
                      className="outline-button"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft size={16} />
                      Previous
                    </button>
                    <span>
                      Page {page} of {Math.ceil(total / 24)}
                    </span>
                    <button
                      className="outline-button"
                      disabled={page * 24 >= total}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
      <footer>
        <div className="container footer-main">
          <div>
            <Link className="logo" href="/">
              o<span>4</span>o<i />
            </Link>
            <p>
              A little closer. A little smarter.
              <br />A whole lot to discover.
            </p>
          </div>
          <div className="footer-links">
            <Link href="/retailers">Discover stores</Link>
            <Link href="/campaigns">Browse catalogues</Link>
            <Link href="/retailer">
              For retailers <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="footer-location">
            <MapPin size={17} />
            <span>
              Starting local. Growing together.
              <br />
              <strong>Made for Kerala.</strong>
            </span>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} O4O. All rights reserved.</span>
          <span>
            Availability and prices are subject to participating branch terms.
          </span>
          <span>English / മലയാളം</span>
        </div>
      </footer>
      {locationOpen && (
        <div className="modal-backdrop" onClick={() => setLocationOpen(false)}>
          <section
            className="modal location-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Choose your location"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              onClick={() => setLocationOpen(false)}
              aria-label="Close"
            >
              <X />
            </button>
            <MapPin className="modal-symbol" />
            <span className="eyebrow">KEEP IT LOCAL</span>
            <h2>Where are you shopping?</h2>
            <p>
              Choose a location to find relevant stores, offers and catalogues.
            </p>
            <div className="filter-search">
              <Search size={18} />
              <input
                placeholder="Search locations…"
                value={locationQuery}
                onChange={(e) => setLocationQuery(e.target.value)}
              />
            </div>
            <div className="breadcrumbs">
              <button
                onClick={() => {
                  setTrail([]);
                  setLocationQuery("");
                }}
              >
                Countries
              </button>
              {trail.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => setTrail(trail.slice(0, i + 1))}
                >
                  {" "}
                  / {r.name}
                </button>
              ))}
            </div>
            <div className="location-options">
              {locationRows.map((r) => (
                <div key={r.id}>
                  <button
                    onClick={() => {
                      if (r.kind === "LOCALITY" || r.kind === "DISTRICT")
                        chooseLocation(r);
                      else {
                        setTrail([...trail, r]);
                        setLocationQuery("");
                      }
                    }}
                  >
                    <MapPin size={16} />
                    <span>
                      {ml && r.nameMl ? r.nameMl : r.name}
                      <small>{r.kind.toLowerCase()}</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  {r.kind === "DISTRICT" && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setTrail([...trail, r]);
                        setLocationQuery("");
                      }}
                    >
                      Towns
                    </button>
                  )}
                </div>
              ))}
            </div>
            {trail.length > 0 && (
              <button
                className="outline-button"
                onClick={() => chooseLocation(trail[trail.length - 1])}
              >
                Use all of {trail[trail.length - 1].name}
              </button>
            )}
          </section>
        </div>
      )}
      {auth && (
        <div className="modal-backdrop" onClick={() => setAuth(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="O4O account"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close"
              onClick={() => setAuth(false)}
            >
              <X />
            </button>
            <span className="eyebrow">YOUR NEXT GOOD FIND</span>
            <h2>{register ? "Make yourself at home." : "Welcome back."}</h2>
            <p>
              {register
                ? "Create an account for saved offers and shared lists."
                : "Sign in to your O4O account."}
            </p>
            <form className="stack-form" onSubmit={signIn}>
              {register && (
                <label>
                  Your name
                  <input name="name" required autoComplete="name" />
                </label>
              )}
              <label>
                Email address
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  name="password"
                  required
                  minLength={register ? 12 : 1}
                  maxLength={128}
                  autoComplete={register ? "new-password" : "current-password"}
                />
              </label>
              {register && <small>Use at least 12 characters.</small>}
              <button className="button">
                {register ? "Create account" : "Sign in"}
                <ArrowRight size={17} />
              </button>
            </form>
            <button
              className="text-button auth-switch"
              onClick={() => setRegister(!register)}
            >
              {register
                ? "Already have an account? Sign in"
                : "New here? Create an account"}
            </button>
            {!register && (
              <Link
                className="text-button"
                href="/recover"
                onClick={() => setAuth(false)}
              >
                Forgot your password?
              </Link>
            )}
          </section>
        </div>
      )}
      {selectedOffer && (
        <div className="modal-backdrop" onClick={() => setSelectedOffer(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Product details"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close"
              onClick={() => setSelectedOffer(null)}
            >
              <X />
            </button>
            {selectedOffer.comparison ? (
              <>
                <h2>{selectedOffer.product.name}</h2>
                <p>
                  Exact variant: {selectedOffer.variant.label} ·{" "}
                  {selectedOffer.variant.quantity}
                  {selectedOffer.variant.unit}
                </p>
                {selectedOffer.comparison.length ? (
                  selectedOffer.comparison.map((o: Row) => (
                    <div className="comparison-row" key={o.id}>
                      <div>
                        <strong>{o.retailer.name}</strong>
                        <p>
                          {o.branches.length
                            ? `${o.branches.length} selected branches`
                            : o.regions
                                .map((r: Row) => r.location.name)
                                .join(", ")}
                        </p>
                      </div>
                      <div>
                        <strong>{money(o.price)}</strong>
                        <p>{unitPrice(o)}</p>
                        <p>
                          Verified{" "}
                          {o.verifiedAt
                            ? new Date(o.verifiedAt).toLocaleDateString("en-IN")
                            : "date unavailable"}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p>
                    No verified active prices for this exact variant in your
                    location.
                  </p>
                )}
              </>
            ) : (
              <>
                <span className="eyebrow">{selectedOffer.retailer.name}</span>
                <h2>{selectedOffer.variant.product.name}</h2>
                <p>
                  {selectedOffer.variant.label} ·{" "}
                  {selectedOffer.variant.quantity}
                  {selectedOffer.variant.unit}
                </p>
                <div className="price">{money(selectedOffer.price)}</div>
                <p>
                  Valid until{" "}
                  {new Date(selectedOffer.endsAt).toLocaleString("en-IN")}
                </p>
                <p>
                  Available at{" "}
                  {selectedOffer.branches?.length
                    ? selectedOffer.branches
                        .map((b: Row) => b.branch.name)
                        .join(", ")
                    : selectedOffer.regions
                        .map((r: Row) => r.location.name)
                        .join(", ")}
                  . Campaign restrictions also apply.
                </p>
                <button
                  className="button"
                  onClick={() =>
                    requireUser(() =>
                      action(async () => {
                        const found = await api("lists");
                        if (!found.length)
                          throw new Error("Create a shopping list first");
                        await api(`lists/${found[0].id}/items`, "POST", {
                          name: selectedOffer.variant.product.name,
                          variantId: selectedOffer.variantId,
                          quantity: 1,
                        });
                      }, "Added to your first shopping list"),
                    )
                  }
                >
                  <Plus size={17} />
                  Add to shopping list
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button aria-label="Dismiss" onClick={() => setNotice("")}>
            <X size={17} />
          </button>
        </div>
      )}
    </>
  );
}
function AdvancedFilters({
  location,
  onChange,
}: {
  location: Row | null;
  onChange: (v: Row) => void;
}) {
  const [retailers, setRetailers] = useState<Row[]>([]),
    [campaigns, setCampaigns] = useState<Row[]>([]),
    [query, setQuery] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      api(
        `retailers?limit=60&q=${encodeURIComponent(query)}${location ? `&location=${location.id}` : ""}`,
      ),
      api(`campaigns?limit=60${location ? `&location=${location.id}` : ""}`),
    ])
      .then(([r, c]) => {
        if (active) {
          setRetailers(r.items);
          setCampaigns(c.items);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [location, query]);
  return (
    <details className="advanced-filters">
      <summary>
        <SlidersHorizontal size={15} />
        More filters
      </summary>
      <form
        className="stack-form filter-panel"
        onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          onChange(
            Object.fromEntries(Object.entries(f).filter(([, v]) => v !== "")),
          );
        }}
      >
        <label>
          Find retailer
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Retailer name"
          />
        </label>
        <label>
          Retailer
          <select name="retailer">
            <option value="">All retailers</option>
            {retailers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Campaign
          <select name="campaign">
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Minimum price (INR)
          <input name="minPrice" type="number" min="0" step="0.01" />
        </label>
        <label>
          Maximum price (INR)
          <input name="maxPrice" type="number" min="0" step="0.01" />
        </label>
        <label>
          Minimum discount
          <select name="minDiscount">
            <option value="">Any discount</option>
            {[10, 20, 30, 40, 50, 60, 70].map((d) => (
              <option key={d} value={d}>
                {d}% or more
              </option>
            ))}
          </select>
        </label>
        <button className="button">Apply filters</button>
        <button
          type="reset"
          className="text-button"
          onClick={() => onChange({})}
        >
          Clear filters
        </button>
      </form>
    </details>
  );
}
function ErrorBox({
  message,
  retry,
  auth,
}: {
  message: string;
  retry?: () => void;
  auth?: () => void;
}) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={22} />
      <div>
        <h3>We couldn’t load this just yet.</h3>
        <p>{message}</p>
      </div>
      {retry && (
        <button className="outline-button" onClick={retry}>
          Try again
        </button>
      )}
      {auth && message.toLowerCase().includes("sign in") && (
        <button className="button" onClick={auth}>
          Sign in
        </button>
      )}
    </div>
  );
}
function Branch({ b }: { b: Row }) {
  return (
    <article className="panel branch">
      <MapPin size={26} />
      <h3>{b.name}</h3>
      <span className="eyebrow">{b.retailer?.name}</span>
      <p>{b.address}</p>
      <p>
        {b.location?.name}
        {b.distanceKm !== undefined
          ? ` · ${b.distanceKm.toFixed(1)} km away`
          : ""}
      </p>
      {b.phone && <a href={`tel:${b.phone}`}>{b.phone}</a>}
      {b.latitude != null && b.longitude != null && (
        <a
          className="text-button"
          target="_blank"
          rel="noreferrer"
          href={`https://www.openstreetmap.org/directions?to=${b.latitude},${b.longitude}`}
        >
          Get directions <ArrowUpRight size={15} />
        </a>
      )}
    </article>
  );
}
function Viewer({
  catalogue,
  location,
  onOffer,
}: {
  catalogue: Row;
  location: Row | null;
  onOffer: (o: Row) => void;
}) {
  const [page, setPage] = useState(0),
    [zoom, setZoom] = useState(1),
    [search, setSearch] = useState("");
  const [regions, setRegions] = useState<Row[]>([]),
    [matches, setMatches] = useState<number[] | null>(null),
    [message, setMessage] = useState(""),
    [expired, setExpired] = useState(false);
  const touch = useRef(0),
    cache = useRef(new Map<number, Row[]>());
  const p = catalogue.pages[page];
  const asset = (key: string) => `${API}/assets/${encodeURIComponent(key)}`;
  useEffect(() => {
    let active = true;
    setRegions([]);
    if (cache.current.has(page)) setRegions(cache.current.get(page)!);
    else
      api(
        `catalogues/${catalogue.id}/pages/${page + 1}?location=${location?.id || ""}`,
      )
        .then((data) => {
          cache.current.set(page, data.regions);
          if (active) setRegions(data.regions);
        })
        .catch((e) => {
          if (active) setMessage(e.message);
        });
    for (const index of [page - 1, page + 1]) {
      const adjacent = catalogue.pages[index];
      if (adjacent) {
        const image = new Image();
        image.src = asset(adjacent.imageKey);
      }
    }
    return () => {
      active = false;
    };
  }, [page, catalogue.id, location?.id]);
  useEffect(() => {
    const check = () =>
      setExpired(new Date(catalogue.campaign.endsAt) <= new Date());
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [catalogue]);
  useEffect(() => {
    if (search.length < 2) {
      setMatches(null);
      return;
    }
    let active = true;
    const timer = setTimeout(
      () =>
        api(
          `catalogues/${catalogue.id}/search?q=${encodeURIComponent(search)}&location=${location?.id || ""}`,
        )
          .then((rows) => {
            if (active) setMatches(rows.map((r: Row) => r.number));
          })
          .catch((e) => setMessage(e.message)),
      250,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, catalogue.id, location?.id]);
  useEffect(() => {
    const n =
      Number(new URLSearchParams(window.location.search).get("page") || "1") -
      1;
    if (n >= 0 && n < catalogue.pages.length) setPage(n);
  }, [catalogue]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowRight")
        setPage((p) => Math.min(p + 1, catalogue.pages.length - 1));
      if (e.key === "ArrowLeft") setPage((p) => Math.max(0, p - 1));
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [catalogue]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(page + 1));
    window.history.replaceState(null, "", url);
  }, [page]);
  if (!p) return <p>No published pages available.</p>;
  if (expired)
    return (
      <div className="panel">
        <h2>This catalogue has ended.</h2>
        <p>Browse current campaigns for the latest verified information.</p>
        <Link className="button" href="/campaigns">
          Browse catalogues
          <ArrowRight size={16} />
        </Link>
      </div>
    );
  return (
    <div className="viewer">
      <div className="viewer-toolbar">
        <button
          className="icon-button"
          disabled={!page}
          onClick={() => setPage((p) => p - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </button>
        <span>
          {page + 1} / {catalogue.pages.length}
        </span>
        <button
          className="icon-button"
          disabled={page === catalogue.pages.length - 1}
          onClick={() => setPage((p) => p + 1)}
          aria-label="Next page"
        >
          <ChevronRight />
        </button>
        <button
          className="icon-button"
          aria-label="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
        >
          <ZoomOut />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          className="icon-button"
          aria-label="Zoom in"
          onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
        >
          <ZoomIn />
        </button>
        <button
          className="icon-button"
          aria-label="Full screen"
          onClick={() => document.querySelector(".viewer")?.requestFullscreen()}
        >
          <Maximize />
        </button>
        <input
          placeholder="Search catalogue text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="outline-button"
          onClick={() =>
            navigator.clipboard
              .writeText(window.location.href)
              .then(() => setMessage("Page link copied"))
              .catch(() => setMessage("Could not copy the link"))
          }
        >
          Share page
        </button>
        {catalogue.downloadAllowed && (
          <a
            className="outline-button"
            href={`${API}/catalogues/${catalogue.id}/download?location=${location?.id || ""}`}
          >
            Download PDF
          </a>
        )}
      </div>
      {message && (
        <p className="viewer-message" role="status">
          {message}
        </p>
      )}
      <div className="viewer-body">
        <aside>
          {catalogue.pages
            .filter((p: Row) => matches === null || matches.includes(p.number))
            .map((p: Row) => (
              <button
                key={p.id}
                className={p.number === page + 1 ? "selected" : ""}
                onClick={() => setPage(p.number - 1)}
              >
                <img
                  loading="lazy"
                  src={asset(p.thumbnailKey)}
                  alt={`Page ${p.number}`}
                />
                <span>{p.number}</span>
              </button>
            ))}
        </aside>
        <div
          className="page-scroll"
          onTouchStart={(e) => {
            touch.current = e.changedTouches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const delta = e.changedTouches[0].clientX - touch.current;
            if (zoom === 1 && Math.abs(delta) > 70)
              setPage((p) =>
                Math.max(
                  0,
                  Math.min(
                    catalogue.pages.length - 1,
                    p + (delta < 0 ? 1 : -1),
                  ),
                ),
              );
          }}
        >
          <div className="flyer-page" style={{ width: `${zoom * 100}%` }}>
            <img
              src={asset(p.imageKey)}
              alt={`Catalogue page ${p.number}`}
              onError={(e) =>
                (e.currentTarget.alt =
                  "Page could not load. Check your connection and retry.")
              }
            />
            {regions.map((r: Row) => (
              <button
                key={r.id}
                className="hotspot"
                aria-label={`View ${r.offer?.variant?.product?.name || "product"}`}
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.width * 100}%`,
                  height: `${r.height * 100}%`,
                }}
                onClick={() => r.offer && onOffer(r.offer)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
function Fields({
  fields,
}: {
  fields: { name: string; label: string; type?: string; required?: boolean }[];
}) {
  return (
    <>
      {fields.map((f) => (
        <label key={f.name}>
          {f.label}
          <input
            name={f.name}
            type={f.type || "text"}
            step={f.type === "number" ? "any" : undefined}
            required={f.required !== false}
          />
        </label>
      ))}
    </>
  );
}
type Action = (fn: () => Promise<any>, success: string) => Promise<boolean>;
function Admin({
  detail,
  action,
  categories,
}: {
  detail: Row;
  action: Action;
  categories: Row[];
}) {
  const [tab, setTab] = useState("retailers"),
    [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [counter, setCounter] = useState(0);
  useEffect(() => {
    setError("");
    api(`admin/${tab}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [tab, counter]);
  function submit(
    e: FormEvent<HTMLFormElement>,
    endpoint: string,
    transform?: (d: Row) => Row,
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    let body: Row = Object.fromEntries(new FormData(form));
    if (transform) body = transform(body);
    action(() => api(endpoint, "POST", body), "Record created").then(() => {
      setCounter((c) => c + 1);
    });
  }
  return (
    <>
      <div className="stats-grid">
        {Object.entries(detail).map(([key, value]) => (
          <div className="stat" key={key}>
            <span>{key}</span>
            <strong>{String(value)}</strong>
          </div>
        ))}
      </div>
      <div className="tabs">
        {[
          "retailers",
          "campaigns",
          "products",
          "offers",
          "catalogues",
          "coupons",
          "categories",
          "locations",
          "branches",
          "users",
          "content",
          "advertisements",
          "audit",
        ].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {error && <ErrorBox message={error} />}
      <div className="admin-layout">
        <div className="panel">
          <h2>{tab === "audit" ? "Audit trail" : `Manage ${tab}`}</h2>
          {rows.length ? (
            rows.map((r) => (
              <div className="management-row" key={r.id}>
                <div>
                  <strong>
                    {r.name ||
                      r.title ||
                      r.filename ||
                      r.variant?.product?.name ||
                      r.action}
                  </strong>
                  <p>
                    {r.status ||
                      r.verification ||
                      r.entityType ||
                      r.kind ||
                      r.role}{" "}
                    {r.retailer?.name && `· ${r.retailer.name}`}
                  </p>
                  {r.branches && (
                    <small>{r.branches.length} selected branches</small>
                  )}
                  {tab === "content" && (
                    <ContentEditor row={r} api={api} action={action} />
                  )}
                  {tab === "campaigns" && (
                    <CampaignRevisions
                      campaign={r}
                      api={api}
                      action={action}
                      refresh={() => setCounter((c) => c + 1)}
                    />
                  )}
                  {tab === "catalogues" && (
                    <CatalogueReview row={r} api={api} action={action} />
                  )}
                </div>
                <div className="row-actions">
                  {tab === "retailers" && (
                    <>
                      <button
                        className="outline-button"
                        onClick={() =>
                          action(
                            () =>
                              api(`admin/retailers/${r.id}/status`, "PATCH", {
                                status: "ACTIVE",
                              }),
                            "Retailer activated",
                          ).then(() => setCounter((c) => c + 1))
                        }
                      >
                        Activate
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          action(
                            () =>
                              api(`admin/retailers/${r.id}/status`, "PATCH", {
                                status: "SUSPENDED",
                              }),
                            "Retailer suspended",
                          ).then(() => setCounter((c) => c + 1))
                        }
                      >
                        Suspend
                      </button>
                    </>
                  )}
                  {tab === "campaigns" && (
                    <>
                      {["SUBMITTED", "UNDER_REVIEW"].includes(r.status) && (
                        <button
                          className="outline-button"
                          onClick={() =>
                            action(
                              () =>
                                api(
                                  `admin/campaigns/${r.id}/moderate`,
                                  "POST",
                                  { decision: "APPROVED", version: r.version },
                                ),
                              "Campaign approved",
                            ).then(() => setCounter((c) => c + 1))
                          }
                        >
                          Approve
                        </button>
                      )}
                      {["APPROVED", "SCHEDULED"].includes(r.status) && (
                        <button
                          className="button"
                          onClick={() =>
                            action(
                              () =>
                                api(
                                  `admin/campaigns/${r.id}/moderate`,
                                  "POST",
                                  { decision: "PUBLISHED", version: r.version },
                                ),
                              "Publication updated",
                            ).then(() => setCounter((c) => c + 1))
                          }
                        >
                          Publish
                        </button>
                      )}
                    </>
                  )}
                  {tab === "catalogues" && r.status === "REVIEW" && (
                    <button
                      className="outline-button"
                      onClick={() =>
                        action(
                          () => api(`admin/catalogues/${r.id}/publish`, "POST"),
                          "Catalogue pages approved",
                        ).then(() => setCounter((c) => c + 1))
                      }
                    >
                      Approve pages
                    </button>
                  )}
                  {tab === "catalogues" && r.status === "FAILED" && (
                    <button
                      className="outline-button"
                      onClick={() =>
                        action(
                          () => api(`admin/catalogues/${r.id}/retry`, "POST"),
                          "Retry queued",
                        ).then(() => setCounter((c) => c + 1))
                      }
                    >
                      Retry processing
                    </button>
                  )}
                  {[
                    "categories",
                    "locations",
                    "coupons",
                    "advertisements",
                  ].includes(tab) && (
                    <button
                      className="outline-button"
                      onClick={() =>
                        action(
                          () =>
                            api(`admin/${tab}/${r.id}`, "PATCH", {
                              active: !r.active,
                            }),
                          "Status updated",
                        ).then(() => setCounter((c) => c + 1))
                      }
                    >
                      {r.active ? "Disable" : "Enable"}
                    </button>
                  )}
                  {tab === "offers" && r.verification !== "VERIFIED" && (
                    <button
                      className="outline-button"
                      onClick={() =>
                        action(
                          () => api(`admin/offers/${r.id}/verify`, "POST"),
                          "Offer verified",
                        ).then(() => setCounter((c) => c + 1))
                      }
                    >
                      Verify price
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p>No records yet.</p>
          )}
        </div>
        {tab === "retailers" && (
          <form
            className="panel stack-form"
            onSubmit={(e) => submit(e, "admin/retailers")}
          >
            <h3>Add a retailer</h3>
            <Fields
              fields={[
                { name: "name", label: "Business name" },
                { name: "slug", label: "URL slug" },
                { name: "description", label: "Description" },
              ]}
            />
            <button className="button">
              Create retailer
              <Plus size={16} />
            </button>
            <small>
              New retailers require activation before public discovery.
            </small>
          </form>
        )}
        {tab === "products" && (
          <form
            className="panel stack-form"
            onSubmit={(e) =>
              submit(e, "admin/products", (d) => ({
                ...d,
                quantity: Number(d.quantity),
              }))
            }
          >
            <h3>Create exact product variant</h3>
            <Fields
              fields={[
                { name: "name", label: "Product name" },
                { name: "slug", label: "URL slug" },
                { name: "brandName", label: "Brand", required: false },
                { name: "label", label: "Variant label" },
                { name: "quantity", label: "Quantity", type: "number" },
                { name: "packaging", label: "Packaging" },
              ]}
            />
            <label>
              Category
              <select name="categoryId">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Unit
              <select name="unit">
                {["g", "kg", "ml", "l", "each"].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
            <button className="button">
              Create product
              <Plus size={16} />
            </button>
          </form>
        )}
        {["coupons", "categories", "locations", "advertisements"].includes(
          tab,
        ) && (
          <AdminCreate
            tab={tab}
            action={action}
            refresh={() => setCounter((c) => c + 1)}
          />
        )}
      </div>
    </>
  );
}
function RetailerPortal({
  data,
  action,
  categories,
}: {
  data: Row[];
  action: Action;
  categories: Row[];
}) {
  const [rid, setRid] = useState("");
  const retailer = data.find((r) => r.id === rid) || data[0];
  const [locations, setLocations] = useState<Row[]>([]);
  useEffect(() => {
    api("locations?q=")
      .then(setLocations)
      .catch(() => {});
  }, []);
  function submit(
    e: FormEvent<HTMLFormElement>,
    endpoint: string,
    convert?: (d: Row) => Row,
  ) {
    e.preventDefault();
    let body: Row = Object.fromEntries(new FormData(e.currentTarget));
    if (endpoint === "retailer/campaigns")
      body.branchIds = new FormData(e.currentTarget).getAll("branchIds");
    if (convert) body = convert(body);
    action(() => api(endpoint, "POST", body), "Saved successfully");
  }
  return (
    <>
      {!data.length ? (
        <form
          className="panel stack-form narrow"
          onSubmit={(e) => submit(e, "retailer/register")}
        >
          <h2>Bring your business to O4O</h2>
          <p>Register your business for administrative review.</p>
          <Fields
            fields={[
              { name: "name", label: "Business name" },
              { name: "slug", label: "URL slug" },
              { name: "description", label: "Description" },
            ]}
          />
          <button className="button">
            Submit registration
            <ArrowRight size={17} />
          </button>
        </form>
      ) : (
        <>
          <label className="retailer-selector">
            Retailer
            <select
              value={retailer.id}
              onChange={(e) => setRid(e.target.value)}
            >
              {data.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <div className="stats-grid">
            <div className="stat">
              <span>Account status</span>
              <strong className="small-stat">{retailer.status}</strong>
            </div>
            <div className="stat">
              <span>Branches</span>
              <strong>{retailer.branches.length}</strong>
            </div>
            <div className="stat">
              <span>Campaigns</span>
              <strong>{retailer.campaigns.length}</strong>
            </div>
            <div className="stat">
              <span>Followers</span>
              <strong>{retailer._count.follows}</strong>
            </div>
          </div>
          <div className="admin-layout">
            <div>
              <h2>Campaigns</h2>
              {retailer.campaigns.map((c: Row) => (
                <article className="panel management-row" key={c.id}>
                  <div>
                    <h3>{c.title}</h3>
                    <p>
                      {c.status} ·{" "}
                      {new Date(c.endsAt).toLocaleDateString("en-IN")}
                    </p>
                    {["DRAFT", "REJECTED", "PUBLISHED", "SCHEDULED"].includes(
                      c.status,
                    ) && (
                      <CampaignEdit campaign={c} api={api} action={action} />
                    )}
                    {c.flyers.map((f: Row) => (
                      <p key={f.id}>
                        {f.filename} — {f.status}
                      </p>
                    ))}
                  </div>
                  {["DRAFT", "REJECTED"].includes(c.status) && (
                    <div className="row-actions">
                      <button
                        className="outline-button"
                        onClick={() =>
                          action(
                            () =>
                              api(`retailer/campaigns/${c.id}/submit`, "POST"),
                            "Campaign submitted for review",
                          )
                        }
                      >
                        Submit for review
                      </button>
                      <CatalogueUpload campaignId={c.id} action={action} />
                    </div>
                  )}
                </article>
              ))}
              <h2 className="spaced-heading">Branches</h2>
              {retailer.branches.map((b: Row) => (
                <Branch key={b.id} b={b} />
              ))}
            </div>
            <div>
              <form
                className="panel stack-form"
                onSubmit={(e) =>
                  submit(e, "retailer/campaigns", (d) => ({
                    ...d,
                    retailerId: retailer.id,
                    startsAt: new Date(d.startsAt).toISOString(),
                    endsAt: new Date(d.endsAt).toISOString(),
                    regionIds: [d.regionId],
                    regionId: undefined,
                    branchIds: d.branchIds || [],
                  }))
                }
              >
                <h3>New campaign</h3>
                <Fields
                  fields={[
                    { name: "title", label: "Campaign title" },
                    { name: "description", label: "Description" },
                    {
                      name: "startsAt",
                      label: "Starts",
                      type: "datetime-local",
                    },
                    { name: "endsAt", label: "Ends", type: "datetime-local" },
                  ]}
                />
                <LocationField name="regionId" />
                <label>
                  Participating branches (optional)
                  <select
                    name="branchIds"
                    multiple
                    size={Math.min(4, Math.max(2, retailer.branches.length))}
                  >
                    {retailer.branches.map((b: Row) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <small>
                    Choose branches to restrict this campaign. With none
                    selected, only the chosen region applies.
                  </small>
                </label>
                <button className="button">
                  Save draft
                  <Plus size={16} />
                </button>
              </form>
              <RetailerTeam retailer={retailer} api={api} action={action} />
              <RetailerOfferForm
                retailer={retailer}
                api={api}
                action={action}
              />
              <form
                className="panel stack-form"
                onSubmit={(e) => submit(e, `retailer/${retailer.id}/branches`)}
              >
                <h3>Add branch</h3>
                <Fields
                  fields={[
                    { name: "name", label: "Branch name" },
                    { name: "address", label: "Address" },
                    {
                      name: "postalCode",
                      label: "Postal code",
                      required: false,
                    },
                  ]}
                />
                <LocationField name="locationId" />
                <button className="button">
                  Add branch
                  <Plus size={16} />
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
function LocationField({ name }: { name: string }) {
  const [q, setQ] = useState(""),
    [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    api(`locations?q=${encodeURIComponent(q || "Kerala")}`)
      .then(setRows)
      .catch(() => {});
  }, [q]);
  return (
    <>
      <label>
        Search location
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="District or town"
        />
      </label>
      <label>
        Applicable location
        <select name={name} required>
          <option value="">Choose location</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.kind.toLowerCase()})
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
function CatalogueUpload({
  campaignId,
  action,
}: {
  campaignId: string;
  action: Action;
}) {
  return (
    <label className="outline-button upload-label">
      <Upload size={16} />
      Upload catalogue
      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          action(async () => {
            const result = await api("uploads", "POST", {
              campaignId,
              filename: file.name,
              mimeType: file.type,
              byteSize: file.size,
            });
            const uploaded = await fetch(result.uploadUrl, {
              method: "PUT",
              body: file,
              headers: { "Content-Type": file.type },
            });
            if (!uploaded.ok) throw new Error("File upload failed");
            await api(`uploads/${result.flyerId}/complete`, "POST");
          }, "Catalogue queued for processing");
        }}
      />
    </label>
  );
}
function AdminCreate({
  tab,
  action,
  refresh,
}: {
  tab: string;
  action: Action;
  refresh: () => void;
}) {
  const [retailers, setRetailers] = useState<Row[]>([]);
  useEffect(() => {
    if (tab === "coupons")
      api("admin/retailers")
        .then(setRetailers)
        .catch(() => {});
  }, [tab]);
  const fields: Record<
    string,
    { name: string; label: string; type?: string; required?: boolean }[]
  > = {
    categories: [
      { name: "name", label: "Category name" },
      { name: "slug", label: "URL slug" },
      { name: "nameMl", label: "Malayalam name", required: false },
    ],
    locations: [
      { name: "name", label: "Location name" },
      { name: "nameMl", label: "Malayalam name", required: false },
      { name: "code", label: "Unique location code" },
    ],
    coupons: [
      { name: "title", label: "Coupon title" },
      { name: "code", label: "Coupon code", required: false },
      { name: "description", label: "Description" },
      { name: "discountValue", label: "Discount value", type: "number" },
      {
        name: "minimumPurchase",
        label: "Minimum purchase",
        type: "number",
        required: false,
      },
      {
        name: "maximumDiscount",
        label: "Maximum discount",
        type: "number",
        required: false,
      },
      { name: "startsAt", label: "Starts", type: "datetime-local" },
      { name: "endsAt", label: "Ends", type: "datetime-local" },
      { name: "instructions", label: "Redemption instructions" },
      { name: "terms", label: "Terms and restrictions" },
    ],
    advertisements: [
      { name: "advertiser", label: "Advertiser" },
      { name: "title", label: "Placement title" },
      { name: "creativeUrl", label: "Creative image URL", type: "url" },
      { name: "targetUrl", label: "Destination URL", type: "url" },
      {
        name: "budget",
        label: "Budget (INR)",
        type: "number",
        required: false,
      },
      { name: "startsAt", label: "Starts", type: "datetime-local" },
      { name: "endsAt", label: "Ends", type: "datetime-local" },
    ],
  };
  return (
    <form
      className="panel stack-form"
      onSubmit={(e) => {
        e.preventDefault();
        const data: Row = Object.fromEntries(new FormData(e.currentTarget));
        for (const key of Object.keys(data))
          if (data[key] === "") delete data[key];
        for (const key of [
          "discountValue",
          "minimumPurchase",
          "maximumDiscount",
          "budget",
        ])
          if (data[key] !== undefined) data[key] = Number(data[key]);
        for (const key of ["startsAt", "endsAt"])
          if (data[key]) data[key] = new Date(data[key]).toISOString();
        if (["coupons", "advertisements"].includes(tab)) {
          data.regionIds = [data.regionId];
          delete data.regionId;
          data.active = false;
        }
        action(() => api(`admin/${tab}`, "POST", data), "Record created").then(
          refresh,
        );
      }}
    >
      <h3>
        Create{" "}
        {tab === "categories"
          ? "category"
          : tab === "locations"
            ? "location"
            : tab === "coupons"
              ? "coupon"
              : "advertisement"}
      </h3>
      <Fields fields={fields[tab] || []} />
      {tab === "locations" && (
        <>
          <label>
            Location level
            <select name="kind">
              <option value="LOCALITY">Town / locality</option>
              <option value="DISTRICT">District</option>
              <option value="STATE">State</option>
              <option value="COUNTRY">Country</option>
            </select>
          </label>
          <LocationField name="parentId" />
        </>
      )}
      {tab === "coupons" && (
        <>
          <label>
            Retailer
            <select name="retailerId" required>
              {retailers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Discount type
            <select name="discountType">
              <option value="PERCENT">Percentage</option>
              <option value="FIXED">Fixed amount</option>
            </select>
          </label>
        </>
      )}
      {tab === "advertisements" && (
        <label>
          Placement
          <select name="placement">
            {[
              "HOME_RETAILER",
              "HOME_BANNER",
              "PRODUCT",
              "CATEGORY",
              "DISTRICT",
              "SEARCH",
              "CATALOGUE",
            ].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      )}
      {["coupons", "advertisements"].includes(tab) && (
        <LocationField name="regionId" />
      )}
      <button className="button">
        Create
        <Plus size={16} />
      </button>
      {["coupons", "advertisements"].includes(tab) && (
        <small>Created inactive. Review the record before enabling it.</small>
      )}
    </form>
  );
}

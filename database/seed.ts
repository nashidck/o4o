import { createDb } from "../packages/database";
import * as argon2 from "argon2";
const db = createDb();
const districts = [
  ["kasaragod", "Kasaragod", "കാസർഗോഡ്"],
  ["kannur", "Kannur", "കണ്ണൂർ"],
  ["wayanad", "Wayanad", "വയനാട്"],
  ["kozhikode", "Kozhikode", "കോഴിക്കോട്"],
  ["malappuram", "Malappuram", "മലപ്പുറം"],
  ["palakkad", "Palakkad", "പാലക്കാട്"],
  ["thrissur", "Thrissur", "തൃശ്ശൂർ"],
  ["ernakulam", "Ernakulam", "എറണാകുളം"],
  ["idukki", "Idukki", "ഇടുക്കി"],
  ["kottayam", "Kottayam", "കോട്ടയം"],
  ["alappuzha", "Alappuzha", "ആലപ്പുഴ"],
  ["pathanamthitta", "Pathanamthitta", "പത്തനംതിട്ട"],
  ["kollam", "Kollam", "കൊല്ലം"],
  ["thiruvananthapuram", "Thiruvananthapuram", "തിരുവനന്തപുരം"],
];
const categories = [
  ["groceries", "Groceries", "പലചരക്ക്"],
  ["produce", "Fruits & vegetables", "പഴങ്ങളും പച്ചക്കറികളും"],
  ["dairy", "Dairy & eggs", "പാലും മുട്ടയും"],
  ["meat", "Meat & seafood", "മാംസവും കടൽവിഭവങ്ങളും"],
  ["frozen", "Frozen foods", "ശീതീകരിച്ച ഭക്ഷണം"],
  ["bakery", "Bakery", "ബേക്കറി"],
  ["rice", "Rice & cereals", "അരിയും ധാന്യങ്ങളും"],
  ["spices", "Spices & masalas", "മസാലകൾ"],
  ["beverages", "Beverages", "പാനീയങ്ങൾ"],
  ["snacks", "Snacks", "ലഘുഭക്ഷണം"],
  ["personal-care", "Personal care", "വ്യക്തിഗത പരിചരണം"],
  ["beauty", "Health & beauty", "ആരോഗ്യവും സൗന്ദര്യവും"],
  ["household", "Household products", "വീട്ടുപകരണങ്ങൾ"],
  ["cleaning", "Cleaning products", "ശുചീകരണം"],
  ["electronics", "Electronics", "ഇലക്ട്രോണിക്സ്"],
  ["mobiles", "Mobile phones", "മൊബൈൽ ഫോണുകൾ"],
  ["fashion", "Fashion", "ഫാഷൻ"],
  ["clothing", "Clothing", "വസ്ത്രങ്ങൾ"],
  ["footwear", "Footwear", "പാദരക്ഷകൾ"],
  ["furniture", "Home & furniture", "വീടും ഫർണിച്ചറും"],
  ["appliances", "Kitchen appliances", "അടുക്കള ഉപകരണങ്ങൾ"],
  ["baby", "Toys & baby products", "കളിപ്പാട്ടങ്ങളും ശിശു ഉൽപ്പന്നങ്ങളും"],
  ["onam", "Onam", "ഓണം"],
  ["vishu", "Vishu", "വിഷു"],
  ["ramadan", "Ramadan", "റമദാൻ"],
  ["eid", "Eid", "ഈദ്"],
  ["christmas", "Christmas", "ക്രിസ്മസ്"],
  ["new-year", "New Year", "പുതുവർഷം"],
  ["wedding", "Wedding season", "വിവാഹകാലം"],
  ["school", "Back to school", "സ്കൂൾ തുറക്കൽ"],
];
async function seed() {
  const india = await db.location.upsert({
    where: { code: "IN" },
    update: {},
    create: { code: "IN", name: "India", nameMl: "ഇന്ത്യ", kind: "COUNTRY" },
  });
  const kerala = await db.location.upsert({
    where: { code: "IN-KL" },
    update: {},
    create: {
      code: "IN-KL",
      name: "Kerala",
      nameMl: "കേരളം",
      kind: "STATE",
      parentId: india.id,
    },
  });
  for (const [code, name, nameMl] of districts)
    await db.location.upsert({
      where: { code: `IN-KL-${code}` },
      update: {},
      create: {
        code: `IN-KL-${code}`,
        name,
        nameMl,
        kind: "DISTRICT",
        parentId: kerala.id,
      },
    });
  for (const [position, [slug, name, nameMl]] of categories.entries())
    await db.category.upsert({
      where: { slug },
      update: {},
      create: { slug, name, nameMl, position },
    });
  await db.contentBlock.upsert({
    where: { key: "home-hero" },
    update: {},
    create: {
      key: "home-hero",
      title: "Good finds.\nCloser to home.",
      titleMl: "മികച്ച കണ്ടെത്തലുകൾ.\nനിങ്ങൾക്കരികിൽ.",
      description:
        "Discover local stores, explore their catalogues, and plan a little smarter. Your next good find starts here.",
      descriptionMl:
        "അടുത്തുള്ള കടകളും കാറ്റലോഗുകളും കണ്ടെത്തൂ. നിങ്ങളുടെ ഷോപ്പിംഗ് എളുപ്പമാക്കൂ.",
      config: { label: "YOUR NEIGHBOURHOOD. MORE POSSIBILITIES." },
    },
  });
  const sections = [
    [
      "home-categories",
      "What’s on your list?",
      "നിങ്ങളുടെ ലിസ്റ്റിൽ എന്തുണ്ട്?",
      "Browse everyday categories.",
    ],
    [
      "home-retailers",
      "Explore your local favourites",
      "നിങ്ങളുടെ പ്രിയപ്പെട്ട കടകൾ",
      "Discover participating local retailers.",
    ],
    [
      "home-catalogues",
      "Fresh off the shelves",
      "പുതിയ കാറ്റലോഗുകൾ",
      "Explore approved catalogues for your location.",
    ],
    [
      "home-lists",
      "A good shop starts with a little list.",
      "ഒരു നല്ല ഷോപ്പിംഗ് ലിസ്റ്റിൽ നിന്ന് തുടങ്ങാം.",
      "Keep your everyday essentials together. Share a list with your people.",
    ],
  ];
  for (const [
    position,
    [key, title, titleMl, description],
  ] of sections.entries())
    await db.contentBlock.upsert({
      where: { key },
      update: {},
      create: {
        key,
        title,
        titleMl,
        description,
        position: position + 1,
        config: {},
      },
    });
  if (
    process.env.BOOTSTRAP_ADMIN_EMAIL &&
    process.env.BOOTSTRAP_ADMIN_PASSWORD
  ) {
    if (process.env.BOOTSTRAP_ADMIN_PASSWORD.length < 14)
      throw new Error("Bootstrap password must contain at least 14 characters");
    await db.user.upsert({
      where: { email: process.env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase() },
      update: {},
      create: {
        email: process.env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase(),
        name: "O4O Administrator",
        passwordHash: await argon2.hash(process.env.BOOTSTRAP_ADMIN_PASSWORD),
        role: "SUPER_ADMIN",
      },
    });
  }
  console.log(
    "Reference geography, categories and editorial content seeded. No retail offers or partnerships created.",
  );
}
seed().finally(() => db.$disconnect());

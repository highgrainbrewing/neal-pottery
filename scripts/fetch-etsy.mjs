// Pulls active listings and shop sections from the Etsy Open API v3 and
// writes data/listings.json. Without ETSY_API_KEY it copies the seed file so
// local builds and previews still work.
//
// ETSY_API_KEY is the app's keystring, or "keystring:shared_secret" for apps
// created after Etsy's 2025 key change. Both forms are sent as-is.
import { readFile, writeFile } from "node:fs/promises";

const SHOP_NAME = process.env.ETSY_SHOP_NAME || "nealpottery";
const API_KEY = process.env.ETSY_API_KEY;
const API = "https://openapi.etsy.com/v3/application";
const OUT = new URL("../data/listings.json", import.meta.url);
const SEED = new URL("../data/listings.seed.json", import.meta.url);

async function etsy(path) {
  const res = await fetch(`${API}${path}`, { headers: { "x-api-key": API_KEY } });
  if (!res.ok) throw new Error(`Etsy ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

function money({ amount, divisor, currency_code }) {
  return { price: (amount / divisor).toFixed(2), currency: currency_code };
}

// Etsy titles are long keyword strings ("Bread Baker - Pottery Bread Baking
// Pot in Blue Glaze - 12 Recipes Included - ..."). Keep the product name plus
// its glaze so cards read like a catalog.
export function cleanTitle(raw) {
  const parts = raw.split(/\s*[-|–]\s+|\s+[-|–]\s*|,\s+/).map((p) => p.trim()).filter(Boolean);
  const name = parts[0];
  const glazePart = parts.find((p) => /glaze|speckled|white|blue|tri-color|green|brown/i.test(p));
  if (!glazePart) return name;
  const glaze = glazePart
    .replace(/.*\bin\s+/i, "")
    .replace(/\b(neal pottery|ceramic|jar|glaze)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return glaze && !name.toLowerCase().includes(glaze.toLowerCase()) ? `${name}, ${glaze}` : name;
}

async function main() {
  if (!API_KEY) {
    console.log("ETSY_API_KEY not set; using seed listings.");
    await writeFile(OUT, await readFile(SEED));
    return;
  }

  const found = await etsy(`/shops?shop_name=${encodeURIComponent(SHOP_NAME)}`);
  const shop = found.results?.find((s) => s.shop_name.toLowerCase() === SHOP_NAME.toLowerCase());
  if (!shop) throw new Error(`Shop ${SHOP_NAME} not found`);

  const [sections, active] = await Promise.all([
    etsy(`/shops/${shop.shop_id}/sections`),
    etsy(`/shops/${shop.shop_id}/listings/active?limit=100&includes=Images`),
  ]);

  // The hero photo (from the old nealpottery.com) is not part of the Etsy API, so keep the one in the seed.
  const seed = JSON.parse(await readFile(SEED, "utf8"));

  const data = {
    fetched_at: new Date().toISOString(),
    shop: {
      name: shop.shop_name,
      url: shop.url,
      sales: shop.transaction_sold_count,
      reviews: shop.review_count,
      rating: shop.review_average,
      banner: seed.shop.banner,
    },
    sections: sections.results
      .filter((s) => s.active_listing_count > 0)
      .map((s) => ({ id: s.shop_section_id, title: s.title })),
    listings: active.results.map((l) => ({
      title: cleanTitle(l.title),
      full_title: l.title,
      ...money(l.price),
      section_id: l.shop_section_id,
      url: l.url,
      image: l.images?.[0]?.url_570xN ?? null,
      image_alt: l.images?.[0]?.alt_text || l.title,
    })),
  };

  await writeFile(OUT, JSON.stringify(data, null, 2));
  console.log(`Fetched ${data.listings.length} listings from Etsy.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(async (err) => {
  // A failed fetch should never take the site down: keep the last good data.
  console.error(err.message);
  try {
    await readFile(OUT);
    console.log("Keeping existing data/listings.json.");
  } catch {
    await writeFile(OUT, await readFile(SEED));
    console.log("Falling back to seed listings.");
  }
});

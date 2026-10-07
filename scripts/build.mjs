// Tiny static site builder: stitches partials into pages and renders the Etsy
// listings and show dates into HTML, so the published site is plain static
// files with no client-side data fetching.
import { readFile, writeFile, readdir, mkdir, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const at = (p) => new URL(p, root);
const DIST = at("dist/");

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function json(path) {
  return JSON.parse(await readFile(at(path), "utf8"));
}

// Placeholder vessel art used when a listing has no Etsy photo (seed data / previews).
const GLAZES = {
  speckled: ["#efe9dc", "#d9cfbd"],
  blue: ["#4f6f99", "#34507a"],
  denim: ["#3f5478", "#2c3c5a"],
  default: ["#a86a45", "#7d4a2e"],
};
function guessGlaze(title) {
  const t = title.toLowerCase();
  if (t.includes("denim")) return "denim";
  if (t.includes("blue")) return "blue";
  if (t.includes("white") || t.includes("speckled")) return "speckled";
  return "default";
}
function vesselSvg(title, glaze) {
  const [fill, shade] = GLAZES[glaze || guessGlaze(title)] || GLAZES.default;
  const t = title.toLowerCase();
  let body;
  if (t.includes("bowl")) {
    body = `<path d="M70 150 Q70 230 160 232 Q250 230 250 150 Z" fill="${fill}"/><path d="M200 150 Q250 150 250 150 Q248 222 175 231 Q228 205 200 150Z" fill="${shade}" opacity=".55"/><ellipse cx="160" cy="150" rx="90" ry="14" fill="${shade}"/>`;
  } else if (t.includes("bread") || t.includes("baker")) {
    body = `<rect x="58" y="150" width="204" height="72" rx="20" fill="${fill}"/><rect x="200" y="150" width="62" height="72" rx="20" fill="${shade}" opacity=".5"/><ellipse cx="160" cy="150" rx="102" ry="13" fill="${shade}"/>`;
  } else if (t.includes("tissue")) {
    body = `<rect x="80" y="110" width="160" height="120" rx="14" fill="${fill}"/><rect x="190" y="110" width="50" height="120" rx="14" fill="${shade}" opacity=".45"/><ellipse cx="160" cy="112" rx="34" ry="8" fill="${shade}"/><path d="M146 112 q14 -34 30 -8" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round"/>`;
  } else if (t.includes("earring") || t.includes("jewel")) {
    body = `<ellipse cx="160" cy="226" rx="70" ry="10" fill="${shade}"/><path d="M150 226 L154 90 Q160 70 166 90 L170 226Z" fill="${fill}"/><path d="M110 120 Q160 96 210 120" stroke="${shade}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
  } else {
    body = `<path d="M130 92 L190 92 L186 116 Q246 150 228 200 Q214 234 160 234 Q106 234 92 200 Q74 150 134 116Z" fill="${fill}"/><path d="M186 116 Q246 150 228 200 Q214 234 168 234 Q214 196 186 116Z" fill="${shade}" opacity=".5"/>`;
  }
  return `<svg viewBox="0 0 320 300" role="img" aria-label="${esc(title)}" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="300" fill="var(--backdrop)"/><ellipse cx="160" cy="240" rx="110" ry="12" fill="#000" opacity=".08"/>${body}</svg>`;
}

function formatPrice(price, currency) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(price));
}

function productCard(l, sections) {
  const section = sections.find((s) => s.id === l.section_id);
  const media = l.image
    ? `<img src="${esc(l.image)}" alt="${esc(l.image_alt || l.title)}" loading="lazy" width="570" height="570">`
    : vesselSvg(l.title, l.glaze);
  return `<li class="product" data-section="${esc(l.section_id ?? "")}">
  <a href="${esc(l.url)}" target="_blank" rel="noopener">
    <div class="product__media">${media}</div>
    ${section ? `<p class="kicker">${esc(section.title)}</p>` : ""}
    <h3 class="product__title">${esc(l.title)}</h3>
    <p class="product__price">${formatPrice(l.price, l.currency)}</p>
  </a>
</li>`;
}

function showsList(shows, { upcomingOnly = true } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const list = shows.filter((s) => !upcomingOnly || s.end >= today).sort((a, b) => a.start.localeCompare(b.start));
  if (!list.length) return `<p class="muted">New show dates are coming soon. Follow along on Instagram.</p>`;
  const fmt = (d, opts) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", opts);
  return `<ol class="shows">${list
    .map((s) => {
      const sameDay = s.start === s.end;
      const range = sameDay
        ? fmt(s.start, { month: "long", day: "numeric" })
        : `${fmt(s.start, { month: "long", day: "numeric" })}–${fmt(s.end, { day: "numeric" })}`;
      return `<li class="show">
  <p class="show__date"><span class="show__month">${fmt(s.start, { month: "short" })}</span><span class="show__day">${fmt(s.start, { day: "numeric" })}</span></p>
  <div>
    <h3>${esc(s.name)}</h3>
    <p class="muted">${esc(range)}, ${fmt(s.start, { year: "numeric" })} · ${esc(s.location)}</p>
  </div>
  ${s.url ? `<a class="link-arrow" href="${esc(s.url)}" target="_blank" rel="noopener">Event details</a>` : ""}
</li>`;
    })
    .join("\n")}</ol>`;
}

async function main() {
  const etsyPath = existsSync(at("data/listings.json")) ? "data/listings.json" : "data/listings.seed.json";
  const etsy = await json(etsyPath);
  const shows = await json("data/shows.json");
  const partials = {
    header: await readFile(at("src/partials/header.html"), "utf8"),
    footer: await readFile(at("src/partials/footer.html"), "utf8"),
  };

  const sections = etsy.sections || [];
  const usedSections = sections.filter((s) => etsy.listings.some((l) => l.section_id === s.id));
  const vars = {
    year: String(new Date().getFullYear()),
    shop_url: etsy.shop.url,
    sales: etsy.shop.sales ? `${Math.floor(etsy.shop.sales / 1000)},000+` : "Thousands of",
    reviews: etsy.shop.reviews ? etsy.shop.reviews.toLocaleString("en-US") : "",
    rating: etsy.shop.rating ? Number(etsy.shop.rating).toFixed(1) : "5.0",
    featured_grid: `<ul class="grid grid--4">${etsy.listings.slice(0, 4).map((l) => productCard(l, sections)).join("\n")}</ul>`,
    shop_grid: `<ul class="grid grid--3" id="shop-grid">${etsy.listings.map((l) => productCard(l, sections)).join("\n")}</ul>`,
    shop_filters: [`<button class="chip is-active" data-filter="all">All</button>`]
      .concat(usedSections.map((s) => `<button class="chip" data-filter="${esc(s.id)}">${esc(s.title)}</button>`))
      .join(""),
    listing_count: String(etsy.listings.length),
    hero_image: existsSync(at("public/img/hero.jpg")) ? "img/hero.jpg" : etsy.shop.banner || "",
    art_bread: vesselSvg("Bread Baker", "speckled"),
    art_vase: vesselSvg("Vase", "default"),
    art_bowl: vesselSvg("Berry Bowl", "denim"),
    shows_preview: showsList(shows),
    shows_all: showsList(shows),
  };

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await cp(at("public/"), DIST, { recursive: true });

  for (const file of await readdir(at("src/pages/"))) {
    let html = await readFile(at(`src/pages/${file}`), "utf8");
    const page = file.replace(/\.html$/, "");
    html = html
      .replace("{{> header}}", partials.header)
      .replace("{{> footer}}", partials.footer)
      .replace(/{{(\w+)}}/g, (m, k) => (k in vars ? vars[k] : m))
      .replace(`data-nav="${page}"`, `data-nav="${page}" aria-current="page"`);
    await writeFile(new URL(file, DIST), html);
  }
  console.log(`Built ${etsy.listings.length} listings from ${etsyPath} into dist/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icons = {
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4Z"/>',
  book: '<path d="M12 6C8 3 5 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-6-1-10 2ZM12 6v15"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
  tv: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="m8 2 4 4 4-4M8 23h8"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  filter: '<path d="M3 6h18M3 12h18M3 18h18M8 3v6M16 9v6M10 15v6"/>',
  leaf: '<path d="M20 3C7 1 2 7 5 15c8 4 16-1 15-12ZM3 21 16 8"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  quote: '<path d="M9 6H3v7h6v5H5M21 6h-6v7h6v5h-4"/>',
};
const icon = (name) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.book}</svg>`;
const typeNames = {
  book: "Book",
  poem: "Poetry",
  movie: "Movie",
  series: "TV series",
  documentary: "Documentary",
  collection: "Collection",
};
const categoryIcons = {
  "Books & Literature": "book",
  Movies: "film",
  "TV Series": "tv",
  Documentaries: "globe",
};
const categoryShort = {
  "Books & Literature": "Books & literature",
  Movies: "Movies",
  "TV Series": "TV series",
  Documentaries: "Documentaries",
};
const main = $("#main"),
  modal = $("#modal");
let items = [],
  terms = [],
  session = { authenticated: false, configured: false },
  adminItems = [],
  adminTerms = [],
  adminPage = 1,
  adminQuery = "",
  adminStatus = "all",
  adminType = "all",
  editingItem = null;
let saved;
try {
  saved = new Set(JSON.parse(localStorage.getItem("aspirants-saved") || "[]"));
} catch {
  saved = new Set();
}
let view;
try {
  view = localStorage.getItem("aspirants-view") || "grid";
} catch {
  view = "grid";
}
let toastTimer,
  renderToken = 0;
function toast(text) {
  clearTimeout(toastTimer);
  $("#toast").textContent = text;
  $("#toast").classList.add("visible");
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3500);
}
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw Error("The server returned an unreadable response.");
  }
  if (!res.ok) throw Error(data.error || "Request failed.");
  return data;
}
const request = (path, method, data) =>
  api(path, { method, body: JSON.stringify(data || {}) });
function updateSaved() {
  const el = $(".saved-count");
  if (el) el.textContent = saved.size;
  try {
    localStorage.setItem("aspirants-saved", JSON.stringify([...saved]));
  } catch {
    toast("Your browser could not persist saved items.");
  }
}
function toggleSave(id) {
  if (saved.has(id)) {
    saved.delete(id);
    toast("Removed from your collection");
  } else {
    saved.add(id);
    toast("Saved to your collection");
  }
  updateSaved();
  $$(`[data-save="${CSS.escape(id)}"]`).forEach((b) => {
    b.classList.toggle("saved", saved.has(id));
    b.setAttribute("aria-pressed", saved.has(id));
    b.setAttribute(
      "aria-label",
      saved.has(id) ? "Remove from my collection" : "Save to my collection",
    );
    if (b.dataset.long)
      b.innerHTML =
        icon("bookmark") +
        (saved.has(id) ? "Saved to my collection" : "Save to my collection");
  });
  if (location.pathname === "/saved") render();
}
function go(url, { replace = false, scroll = true } = {}) {
  history[replace ? "replaceState" : "pushState"]({}, "", url);
  render();
  if (scroll) window.scrollTo({ top: 0, behavior: "instant" });
}
function cover(item) {
  return item.thumbnail || `/covers/${encodeURIComponent(item.id)}.svg`;
}
function card(item) {
  const creator =
    item.creators.join(", ") ||
    {
      movie: "From the original watchlist",
      series: "From the original watchlist",
      documentary: "From the original watchlist",
      collection: "A collection to explore",
    }[item.type] ||
    "Creator not supplied";
  return `<article class="content-card"><a class="cover-wrap" href="/content/${esc(item.id)}" aria-label="Explore ${esc(item.title)}"><img src="${esc(cover(item))}" alt="${esc(item.imageAlt || `Original typographic cover for ${item.title}`)}" loading="lazy" data-fallback="${esc(item.id)}"></a><button class="save-button ${saved.has(item.id) ? "saved" : ""}" data-save="${esc(item.id)}" aria-label="${saved.has(item.id) ? "Remove from my collection" : "Save to my collection"}" aria-pressed="${saved.has(item.id)}">${icon("bookmark")}</button><div class="card-copy"><span class="type-pill type-${esc(item.type)}">${esc(typeNames[item.type])}</span><h3><a href="/content/${esc(item.id)}" title="${esc(item.title)}">${esc(item.title)}</a></h3><p class="creator">${esc(creator)}</p><div class="card-meta"><span>${esc(item.subcategories[0] || item.categories[0])}</span>${item.year ? `<span>${item.year}</span>` : ""}</div><p class="card-desc">${esc(item.description)}</p></div></article>`;
}
function params() {
  return new URLSearchParams(location.search);
}
function selected(key) {
  return params().getAll(key);
}
function changeParam(key, value, { multi = false } = {}) {
  const p = params();
  if (multi) {
    const list = p.getAll(key);
    p.delete(key);
    for (const v of list.includes(value)
      ? list.filter((x) => x !== value)
      : [...list, value])
      p.append(key, v);
  } else {
    if (value) p.set(key, value);
    else p.delete(key);
  }
  p.delete("page");
  if (key === "category") p.delete("subcategory");
  const base = ["/saved", "/library", "/"].includes(location.pathname)
    ? location.pathname
    : "/library";
  go(base + (p.size ? "?" + p : ""), { scroll: false });
}
const filters = [
  ["subcategory", "Subcategory"],
  ["type", "Content type"],
  ["creator", "Writer / creator"],
  ["genre", "Genre"],
  ["language", "Language"],
  ["year", "Release / publication year"],
  ["tag", "Tags"],
];
const fieldMap = {
  category: "categories",
  subcategory: "subcategories",
  creator: "creators",
  genre: "genres",
  language: "language",
  type: "type",
  year: "year",
  tag: "tags",
};
function filterItems(source) {
  const p = params(),
    q = (p.get("q") || "").normalize("NFKC").toLowerCase().trim();
  let result = source.filter(
    (i) =>
      !q ||
      [
        i.title,
        ...i.creators,
        i.description,
        i.details,
        ...i.tags,
        ...i.genres,
        i.sourceLabel,
      ]
        .join(" ")
        .normalize("NFKC")
        .toLowerCase()
        .includes(q),
  );
  for (const key of ["category", ...filters.map((f) => f[0])]) {
    const values = p.getAll(key);
    if (values.length)
      result = result.filter((i) => {
        const value = i[fieldMap[key]];
        return Array.isArray(value)
          ? values.some((v) => value.includes(v))
          : values.includes(String(value));
      });
  }
  const sort = p.get("sort") || "curated";
  if (sort === "title")
    result.sort((a, b) => a.title.localeCompare(b.title, "bn"));
  if (sort === "year-desc")
    result.sort((a, b) => (b.year || 0) - (a.year || 0));
  if (sort === "year-asc")
    result.sort((a, b) => (a.year || 9999) - (b.year || 9999));
  if (sort === "newest")
    result.sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
  return result;
}
function filterGroup(key, label, source) {
  const categories = selected("category");
  let optionsSource =
    key === "subcategory" && categories.length
      ? source.filter((i) => i.categories.some((c) => categories.includes(c)))
      : source;
  const values = new Map();
  for (const i of optionsSource) {
    const value = i[fieldMap[key]];
    for (const v of Array.isArray(value) ? value : [value])
      if (v !== "" && v != null)
        values.set(String(v), (values.get(String(v)) || 0) + 1);
  }
  const chosen = selected(key);
  for (const v of chosen) if (!values.has(v)) values.set(v, 0);
  let options = [...values.keys()].sort((a, b) =>
    key === "year" ? Number(b) - Number(a) : a.localeCompare(b, "bn"),
  );
  const open =
    ["subcategory", "type", "creator"].includes(key) || chosen.length;
  return `<details class="filter-group" ${open ? "open" : ""}><summary>${label}${chosen.length ? ` (${chosen.length})` : ""}</summary>${key === "creator" ? '<input class="filter-search" placeholder="Find a writer…" aria-label="Find a writer" data-filter-search>' : ""}<div class="filter-options">${options.length ? options.map((v) => `<label class="filter-option" data-filter-name="${esc(v.toLowerCase())}"><input type="checkbox" data-filter="${key}" value="${esc(v)}" ${chosen.includes(v) ? "checked" : ""}>${esc(key === "type" ? typeNames[v] || v : v)}<span>${values.get(v)}</span></label>`).join("") : '<span class="filter-option">Not supplied in the source yet</span>'}</div></details>`;
}
function library() {
  const isHome = location.pathname === "/",
    isSaved = location.pathname === "/saved",
    p = params(),
    source = isSaved ? items.filter((i) => saved.has(i.id)) : items,
    result = filterItems(source),
    pageSize = 12,
    totalPages = Math.max(1, Math.ceil(result.length / pageSize)),
    page = Math.max(1, Math.min(totalPages, parseInt(p.get("page")) || 1)),
    slice = result.slice((page - 1) * pageSize, page * pageSize);
  const cats = [...new Set(items.flatMap((i) => i.categories))];
  const chips = [];
  if (p.get("q"))
    chips.push(
      `<button class="chip" data-remove="q" data-value="">Search: ${esc(p.get("q"))}${icon("close")}</button>`,
    );
  for (const [key, label] of [["category", "Category"], ...filters])
    for (const v of p.getAll(key))
      chips.push(
        `<button class="chip" data-remove="${key}" data-value="${esc(v)}">${esc(key === "type" ? typeNames[v] : v)}${icon("close")}</button>`,
      );
  main.innerHTML = `${isHome ? `<section class="hero" aria-labelledby="hero-title"><div class="hero-copy"><div class="eyebrow">FOR THE CURIOUS MINDS OF TOMORROW</div><h1 id="hero-title">A little reading.<br>A whole new <em>perspective.</em></h1><p>বই, সিনেমা আর নতুন ভাবনার এক যত্নে সাজানো সংগ্রহ।<br>আপনার পরবর্তী ভালো লাগার গল্পটি খুঁজে নিন এখানেই।</p><div class="hero-bottom"><a class="primary" href="#browse">Explore the collection ${icon("arrow")}</a><span class="hero-note">${icon("leaf")} Curated for a curious you</span></div></div><img class="hero-art" src="/hero.svg" alt="Illustrated books and a growing plant"></section><div class="intro-strip"><p>“পড়ার অভ্যাস গড়ে তুলুন। দেখার চোখ তৈরি করুন। ভাবতে শিখুন।”</p><span><strong>${items.length}</strong> recommendations <span aria-hidden="true"> &nbsp;·&nbsp; </span> One endless journey</span></div>` : `<section class="page-heading"><div class="eyebrow">${isSaved ? "YOUR OWN LITTLE LIBRARY" : "THE COMPLETE COLLECTION"}</div><h1>${isSaved ? "My collection" : "A world worth exploring."}</h1><p>${isSaved ? "Your saved discoveries, ready for your next quiet moment. Saved privately in this browser." : "বই থেকে বড় পর্দা — নতুন কিছু আবিষ্কার করুন, নিজের মতো করে।"}</p></section>`}
 <section id="browse" aria-labelledby="browse-title"><div class="browse-head"><div><h2 id="browse-title">${isSaved ? "Your next chapter" : isHome ? "Find your next inspiration" : "Browse the library"}</h2><p>Good stories. Fresh perspectives. A little something for everyone.</p></div><form class="search-box" id="library-search">${icon("search")}<input name="q" type="search" placeholder="Search books, movies, writers…" value="${esc(p.get("q") || "")}" aria-label="Search library"><kbd>/</kbd></form></div>
 <div class="category-tabs" role="group" aria-label="Main categories"><button class="category-tab ${!selected("category").length ? "active" : ""}" data-category="" aria-pressed="${!selected("category").length}">${icon("grid")} All content <span class="count">${source.length}</span></button>${cats.map((c) => `<button class="category-tab ${selected("category").includes(c) ? "active" : ""}" data-category="${esc(c)}" aria-pressed="${selected("category").includes(c)}">${icon(categoryIcons[c] || "book")} ${esc(categoryShort[c] || c)}<span class="count">${source.filter((i) => i.categories.includes(c)).length}</span></button>`).join("")}</div>
 <div class="library-layout"><aside class="filter-sidebar" aria-label="Content filters"><div class="filter-top"><span>${icon("filter")} Filter by</span><button class="text-button" data-action="clear">Reset all</button><button class="icon-button filter-close" data-action="close-filters" aria-label="Close filters">${icon("close")}</button></div>${filters.map(([k, l]) => filterGroup(k, l, source)).join("")}<div class="filter-tip">${icon("leaf")}<strong>A little every day.</strong>One chapter. One story.<br>Small discoveries add up to<br>a world of possibilities.</div></aside><div class="result-content"><div class="results-bar"><span class="result-count">Showing <strong>${result.length ? (page - 1) * pageSize + 1 + "–" + Math.min(page * pageSize, result.length) : "0"}</strong> of <strong>${result.length}</strong> discoveries</span><div class="results-tools"><button class="mobile-filter" data-action="open-filters">${icon("filter")} Filters</button><label class="sort-label"><span>Sort by:</span><select id="sort" aria-label="Sort content">${[
   ["curated", "Curated order"],
   ["title", "Title: A–Z"],
   ["newest", "Recently added"],
   ["year-desc", "Year: newest"],
   ["year-asc", "Year: oldest"],
 ]
   .map(
     ([v, l]) =>
       `<option value="${v}" ${p.get("sort") === v ? "selected" : ""}>${l}</option>`,
   )
   .join(
     "",
   )}</select></label><div class="view-toggle" role="group" aria-label="Display mode"><button data-view="grid" class="${view === "grid" ? "active" : ""}" aria-label="Grid view" aria-pressed="${view === "grid"}">${icon("grid")}</button><button data-view="list" class="${view === "list" ? "active" : ""}" aria-label="List view" aria-pressed="${view === "list"}">${icon("list")}</button></div></div></div>${chips.length ? `<div class="chips">${chips.join("")}<button class="text-button" data-action="clear">Clear all</button></div>` : ""}<div class="content-grid ${view === "list" ? "list" : ""}" aria-live="polite">${slice.length ? slice.map(card).join("") : `<div class="empty">${icon(isSaved ? "bookmark" : "search")}<h3>${isSaved && !source.length ? "Your collection starts with curiosity." : "No discoveries here, yet."}</h3><p>${isSaved && !source.length ? "Tap the bookmark on anything that catches your eye." : "Try a different search or loosen a filter to find something new."}</p>${isSaved && !source.length ? '<a class="primary" href="/library">Explore the library</a>' : '<button class="secondary" data-action="clear">Clear search & filters</button>'}</div>`}</div>
 <div class="pagination"><span>${result.length ? `A little closer to your next favorite. &nbsp; Page ${page} of ${totalPages}` : "Every discovery starts somewhere."}</span><div class="pages" aria-label="Pagination"><button data-page="${page - 1}" ${page <= 1 ? "disabled" : ""} aria-label="Previous page">${icon("left")}</button>${pageButtons(page, totalPages)}<button data-page="${page + 1}" ${page >= totalPages ? "disabled" : ""} aria-label="Next page">${icon("right")}</button></div></div></div></div></section>
 <section class="newsletter"><div><h3>More than a reading list. A way of seeing.</h3><p>A collection inspired by curiosity, culture, and the journey of becoming.</p></div><a class="secondary" href="/about">The story behind the collection ${icon("arrow")}</a></section>`;
  $("#library-search").addEventListener("submit", (e) => {
    e.preventDefault();
    changeParam("q", new FormData(e.target).get("q").trim());
  });
  $("#sort").addEventListener("change", (e) =>
    changeParam("sort", e.target.value),
  );
  $$("[data-filter]").forEach((el) =>
    el.addEventListener("change", () => {
      const open = $(".filter-sidebar")?.classList.contains("open");
      const top = $(".filter-sidebar")?.scrollTop;
      changeParam(el.dataset.filter, el.value, { multi: true });
      if (open) {
        setFilterOpen(true);
        $(".filter-sidebar").scrollTop = top;
      }
      const replacement = $$("[data-filter]").find(
        (x) => x.dataset.filter === el.dataset.filter && x.value === el.value,
      );
      replacement?.focus({ preventScroll: true });
    }),
  );
  $("[data-filter-search]")?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    $$("[data-filter-name]", e.target.parentElement).forEach(
      (el) => (el.hidden = !el.dataset.filterName.includes(q)),
    );
  });
}
function setFilterOpen(open) {
  const sidebar = $(".filter-sidebar");
  if (!sidebar) return;
  sidebar.classList.toggle("open", open);
  if (open) {
    sidebar.setAttribute("role", "dialog");
    sidebar.setAttribute("aria-modal", "true");
  } else {
    sidebar.removeAttribute("role");
    sidebar.removeAttribute("aria-modal");
  }
}
function pageButtons(page, total) {
  let numbers = [...new Set([1, page - 1, page, page + 1, total])]
    .filter((n) => n > 0 && n <= total)
    .sort((a, b) => a - b);
  let last = 0;
  return numbers
    .map((n) => {
      const s =
        (last && n - last > 1 ? "<span>…</span>" : "") +
        `<button data-page="${n}" class="${page === n ? "active" : ""}" ${page === n ? 'aria-current="page"' : ""}>${n}</button>`;
      last = n;
      return s;
    })
    .join("");
}
function detail(item, { preview = false } = {}) {
  if (!item) return notFound();
  const related = items
    .filter((i) => i.id !== item.id)
    .map((i) => ({
      item: i,
      score:
        i.creators.some((c) => item.creators.includes(c)) * 6 +
        i.subcategories.some((c) => item.subcategories.includes(c)) * 3 +
        i.genres.some((c) => item.genres.includes(c)) * 2 +
        i.categories.some((c) => item.categories.includes(c)),
    }))
    .filter((i) => i.score)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((i) => i.item);
  const children = (item.children || [])
    .map((id) => (preview ? adminItems : items).find((i) => i.id === id))
    .filter(Boolean);
  const parent = (preview ? adminItems : items).find(
    (i) => i.id === item.parentId,
  );
  const meta = [
    ["Main category", item.categories.join(" · ")],
    ["Subcategory", item.subcategories.join(" · ")],
    ["Language", item.language],
    ["Release / publication year", item.year],
    ...Object.entries(item.metadata || {}).filter(
      ([k]) => !["membershipSource", "expandedFromSource"].includes(k),
    ),
  ].filter(([, v]) => v);
  main.innerHTML = `${preview ? `<div class="preview-banner"><span>Admin preview · ${esc(item.status)} · visible only to you</span><button class="text-button" data-action="back-admin">Back to dashboard</button></div>` : ""}<div class="breadcrumb"><a href="/library">The library</a><span>/</span><span>${esc(typeNames[item.type])}</span><span>/</span><span>${esc(item.title)}</span></div><article class="detail"><div class="detail-art"><img src="${esc(cover(item))}" alt="${esc(item.imageAlt || "Original typographic cover for " + item.title)}" data-fallback="${esc(item.id)}"><p>${item.thumbnail ? "Cover supplied by the library editor." : "Original Aspirants cover illustration.<br>Publisher artwork is not reproduced."}</p></div><div><span class="eyebrow">A NEW PERSPECTIVE AWAITS</span><span class="type-pill type-${esc(item.type)}">${esc(typeNames[item.type])}</span><h1>${esc(item.title)}</h1><div class="byline">${item.creators.map((c) => `<a href="/library?creator=${encodeURIComponent(c)}">${esc(c)}</a>`).join(", ") || "A recommendation from the source collection"}</div><p class="detail-description">${esc(item.details || item.description || "A recommendation from the original collection. An expanded editorial overview has not been added yet.")}</p><dl class="detail-meta">${meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>${item.genres.length ? `<div class="tag-row">${item.genres.map((t) => `<a href="/library?genre=${encodeURIComponent(t)}" class="tag">${esc(t)}</a>`).join("")}</div>` : ""}<div class="tag-row" style="margin-top:10px">${item.tags.map((t) => `<a href="/library?tag=${encodeURIComponent(t)}" class="tag">${esc(t)}</a>`).join("")}</div><button class="primary ${saved.has(item.id) ? "saved" : ""}" data-save="${esc(item.id)}" data-long="true" aria-pressed="${saved.has(item.id)}">${icon("bookmark")}${saved.has(item.id) ? "Saved to my collection" : "Save to my collection"}</button>${item.reviewNote ? `<p class="notice">Editorial review: ${esc(item.reviewNote)}</p>` : ""}${parent ? `<p class="source-line">Part of <a class="reduced-link" href="/content/${esc(parent.id)}">${esc(parent.title)}</a></p>` : ""}${children.length ? `<div class="collection-members"><h3>Explore this collection</h3>${children.map((c) => `<a href="/content/${esc(c.id)}">${esc(c.title)} <span class="card-meta">${c.year || ""}</span></a>`).join("")}</div>` : ""}<p class="source-line">Recommended in the collection by আবদুল্লাহ আল নোমান অন্তর.<br>${item.sourceLabel ? "Original entry: " + esc(item.sourceLabel) : "Added by the library editor."}<br>Unverified publication details are intentionally left empty.</p></div></article>${related.length ? `<div class="browse-head"><div><h2>A little more to explore</h2><p>Connected by stories, creators, and ideas.</p></div><a href="/library" class="reduced-link">Browse all ${icon("arrow")}</a></div><div class="content-grid">${related.map(card).join("")}</div>` : ""}`;
}
async function about() {
  main.innerHTML =
    '<div class="initial-loading"><span class="spinner"></span>Opening our story…</div>';
  const token = renderToken;
  const essay = await api("/api/essay");
  if (token !== renderToken) return;
  main.innerHTML = `<section class="page-heading"><div class="eyebrow">THE STORY BEHIND ASPIRANTS</div><h1>A curious mind has no syllabus.</h1><p>শুধু পরীক্ষার প্রস্তুতি নয়। জীবনকে আরও গভীরভাবে জানার, বোঝার এবং উপভোগ করার একটি ছোট্ট প্রয়াস।</p></section><div class="about-layout"><article class="essay">${essay.introduction
    .split("\n")
    .map((p) => `<p>${esc(p)}</p>`)
    .join(
      "",
    )}<p>এখানে দেওয়া তালিকাটি মূল লেখকের ব্যক্তিগত পাঠ ও দেখার অভিজ্ঞতা থেকে নেওয়া। এটি কোনো পূর্ণাঙ্গ বা বাধ্যতামূলক পাঠ্যতালিকা নয়।</p><p>➡️ এখানে দেওয়া বই মুভি সিরিজ ${esc(essay.closing)}</p><div class="source-credit"><p>লেখা © ${esc(essay.credit)}<br>${esc(essay.qualification)}</p></div><p style="font-size:12px">সম্পাদনা নীতি: মূল সুপারিশ, শিরোনাম ও লেখকের নাম সংরক্ষণ করা হয়েছে। যাচাই না হওয়া তথ্য ফাঁকা রাখা হয়েছে। প্রচ্ছদগুলো Aspirants-এর নিজস্ব নকশা। “A Pale Blue Dot” মূল লেখায় কবিতা বিভাগে আছে; শ্রেণিবিন্যাসটি সম্পাদকীয় পর্যালোচনার জন্য চিহ্নিত।</p><a href="/api/essay" class="reduced-link">View the full preserved source (JSON) ${icon("arrow")}</a></article><aside class="about-aside">${icon("quote")}<h3>Read beyond the syllabus.<br>Think beyond the obvious.</h3><p>One book can open a door. One story can change a perspective. Let curiosity lead the way.</p><div class="source-credit"><strong>${items.length} discoveries</strong><p>Books, poems, films, series & documentaries. One growing collection.</p></div><a href="/library" class="primary">Find your next inspiration ${icon("arrow")}</a></aside></div>`;
}
function notFound() {
  main.innerHTML = `<div class="empty">${icon("book")}<h3>This chapter hasn’t been written.</h3><p>That page is unavailable or the content has not been published.</p><a class="primary" href="/library">Back to the library ${icon("arrow")}</a></div>`;
}
async function refresh() {
  [items, terms, session] = await Promise.all([
    api("/api/items"),
    api("/api/terms"),
    api("/api/session"),
  ]);
}
async function render() {
  const token = ++renderToken;
  modal.open && modal.close();
  $$("[data-nav]").forEach((a) =>
    a.classList.toggle(
      "active",
      a.dataset.nav ===
        (location.pathname === "/"
          ? "home"
          : location.pathname === "/about"
            ? "about"
            : "library"),
    ),
  );
  document.title =
    location.pathname === "/admin"
      ? "Manage library · Aspirants"
      : location.pathname === "/about"
        ? "Our story · Aspirants"
        : "Aspirants — Read. Watch. Grow.";
  try {
    if (["/", "/library", "/saved"].includes(location.pathname)) library();
    else if (location.pathname === "/about") await about();
    else if (location.pathname === "/admin") await admin();
    else if (location.pathname.startsWith("/content/")) {
      const item = items.find(
        (i) => i.id === decodeURIComponent(location.pathname.split("/")[2]),
      );
      document.title = (item?.title || "Not found") + " · Aspirants";
      detail(item);
    } else notFound();
  } catch (e) {
    if (token === renderToken)
      main.innerHTML = `<div class="empty">${icon("globe")}<h3>We couldn’t open this chapter.</h3><p>${esc(e.message)}</p><button class="primary" data-action="retry">Try again</button></div>`;
  }
}
async function admin() {
  session = await api("/api/session");
  if (!session.authenticated) {
    main.innerHTML = `<section class="login-card"><div class="eyebrow">FOR THE CURATORS</div><h1>A good collection keeps growing.</h1><p>Sign in to add discoveries, care for the collection, and help curious minds find their next inspiration.</p>${!session.configured ? '<p class="notice">Administrator access has not been configured. Run <code>npm run admin</code> in the server terminal to set your password securely. No default password is enabled.</p>' : ""}<form id="login-form"><label for="password">Administrator password</label><input id="password" type="password" name="password" autocomplete="current-password" required minlength="12" placeholder="Your password"><p class="form-error" role="alert"></p><button class="primary" ${!session.configured ? "disabled" : ""}>${icon("lock")} Sign in to manage</button></form><p>Visitor? <a class="reduced-link" href="/library">The library is always open →</a></p></section>`;
    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = $("button", e.target);
      b.disabled = true;
      try {
        await request("/api/login", "POST", {
          password: new FormData(e.target).get("password"),
        });
        await admin();
        toast("Welcome to your library");
      } catch (err) {
        $(".form-error", e.target).textContent = err.message;
        b.disabled = false;
      }
    });
    return;
  }
  [adminItems, adminTerms] = await Promise.all([
    api("/api/admin/items"),
    api("/api/admin/terms"),
  ]);
  drawAdmin();
}
function drawAdmin() {
  let list = adminItems.filter(
    (i) =>
      (adminStatus === "all" || i.status === adminStatus) &&
      (adminType === "all" || i.type === adminType) &&
      [i.title, ...i.creators, ...i.tags]
        .join(" ")
        .toLowerCase()
        .includes(adminQuery.toLowerCase()),
  );
  const pageSize = 20,
    totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  adminPage = Math.min(totalPages, adminPage);
  main.innerHTML = `<div class="admin-header"><div class="page-heading"><div class="eyebrow">THE CURATOR’S DESK</div><h1>A growing collection.</h1><p>A place for every story, and a story for every curious mind.</p></div><button class="secondary" data-action="logout">Sign out</button></div><div class="admin-stats">${[
    ["All discoveries", adminItems.length],
    ["Published", adminItems.filter((i) => i.status === "published").length],
    ["Drafts", adminItems.filter((i) => i.status === "draft").length],
    ["Needs review", adminItems.filter((i) => i.reviewNote).length],
  ]
    .map(
      ([l, n]) =>
        `<div class="stat-box"><strong>${n}</strong><span>${l}</span></div>`,
    )
    .join(
      "",
    )}</div><div class="admin-tools"><button class="primary" data-action="new-item">${icon("plus")} Add discovery</button><button class="secondary" data-action="terms">Manage taxonomy & creators</button><button class="secondary" data-action="import">${icon("upload")} Import</button><a class="secondary" href="/api/admin/export?format=json" download>${icon("download")} JSON</a><a class="secondary" href="/api/admin/export?format=csv" download>${icon("download")} CSV</a></div><div class="admin-filter"><input type="search" id="admin-search" placeholder="Search titles, creators, tags…" aria-label="Search admin content" value="${esc(adminQuery)}"><select id="admin-status" aria-label="Filter by publication status">${["all", "published", "draft", "archived"].map((v) => `<option value="${v}" ${adminStatus === v ? "selected" : ""}>${v === "all" ? "All statuses" : v[0].toUpperCase() + v.slice(1)}</option>`).join("")}</select><select id="admin-type" aria-label="Filter admin by type"><option value="all">All types</option>${Object.entries(
    typeNames,
  )
    .map(
      ([v, l]) =>
        `<option value="${v}" ${adminType === v ? "selected" : ""}>${l}</option>`,
    )
    .join(
      "",
    )}</select></div><div class="table-wrap"><table class="admin-table"><thead><tr><th>DISCOVERY</th><th>TYPE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${
    list
      .slice((adminPage - 1) * pageSize, adminPage * pageSize)
      .map(
        (i) =>
          `<tr><td><div class="title-cell"><img src="${esc(cover(i))}" alt=""><div>${esc(i.title)}<small>${esc(i.creators.join(", ") || i.categories.join(", "))}</small>${i.reviewNote ? '<span class="review-label">Editorial review needed</span>' : ""}</div></div></td><td>${esc(typeNames[i.type])}</td><td><span class="status ${esc(i.status)}">${esc(i.status)}</span></td><td><button data-edit="${esc(i.id)}">Edit</button><button data-preview="${esc(i.id)}">Preview</button><button data-archive="${esc(i.id)}">${i.status === "archived" ? "Restore draft" : "Archive"}</button><button class="danger" data-delete="${esc(i.id)}" aria-label="Delete ${esc(i.title)}">Delete</button></td></tr>`,
      )
      .join("") || '<tr><td colspan="4">No matching items.</td></tr>'
  }</tbody></table></div><div class="admin-pagination"><span>${list.length} items · page ${adminPage} of ${totalPages}</span><div class="pages"><button data-admin-page="${adminPage - 1}" ${adminPage === 1 ? "disabled" : ""}>${icon("left")}</button><button data-admin-page="${adminPage + 1}" ${adminPage === totalPages ? "disabled" : ""}>${icon("right")}</button></div></div>`;
  $("#admin-search").addEventListener("input", (e) => {
    const pos = e.target.selectionStart;
    adminQuery = e.target.value;
    adminPage = 1;
    drawAdmin();
    const input = $("#admin-search");
    input.focus();
    try {
      input.setSelectionRange(pos, pos);
    } catch {}
  });
  $("#admin-status").addEventListener("change", (e) => {
    adminStatus = e.target.value;
    adminPage = 1;
    drawAdmin();
  });
  $("#admin-type").addEventListener("change", (e) => {
    adminType = e.target.value;
    adminPage = 1;
    drawAdmin();
  });
}
function openModal(title, body) {
  modal.innerHTML = `<div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Close dialog">${icon("close")}</button></div>${body}`;
  if (!modal.open) modal.showModal();
}
const options = (values, chosen) =>
  values
    .map(
      (v) =>
        `<option value="${esc(v)}" ${chosen === v ? "selected" : ""}>${esc(v)}</option>`,
    )
    .join("");
function editor(item) {
  editingItem = item || {
    title: "",
    type: "book",
    status: "draft",
    categories: ["Books & Literature"],
    subcategories: [],
    creators: [],
    genres: [],
    tags: [],
    language: "",
    year: null,
    description: "",
    details: "",
    thumbnail: "",
    imageAlt: "",
    metadata: {},
    children: [],
  };
  const i = editingItem;
  const field = (name, label, full = false, hint = "") =>
    `<div class="form-field ${full ? "full" : ""}"><label for="edit-${name}">${label}</label><input id="edit-${name}" name="${name}" value="${esc(Array.isArray(i[name]) ? i[name].join(" | ") : (i[name] ?? ""))}" ${name === "title" ? 'required maxlength="300"' : ""} ${name === "year" ? 'type="number" min="1" max="2100"' : ""} ${["creators", "categories", "subcategories", "genres", "tags"].includes(name) ? `list="list-${name}"` : ""}>${hint ? `<small>${hint}</small>` : ""}</div>`;
  openModal(
    i.id ? "Edit discovery" : "A new discovery",
    `<form id="editor-form"><div class="form-grid">${field("title", "Title *", true)}<div class="form-field"><label for="edit-type">Content type</label><select name="type" id="edit-type">${Object.entries(
      typeNames,
    )
      .map(
        ([v, l]) =>
          `<option value="${v}" ${i.type === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select></div><div class="form-field"><label for="edit-status">Publication status</label><select name="status" id="edit-status">${options(["draft", "published", "archived"], i.status)}</select></div>${field("creators", "Writers / creators", true, "Separate multiple names with |. Creators are reusable library records.")}${field("categories", "Main categories *", false, "Separate multiple values with |")}${field("subcategories", "Subcategories", false, "Use the taxonomy manager to organize parent relationships.")}${field("genres", "Genres")}${field("tags", "Tags")}${field("language", "Language")}${field("year", "Publication / release year")}<div class="form-field full"><label for="edit-description">Short description</label><textarea id="edit-description" name="description">${esc(i.description)}</textarea></div><div class="form-field full"><label for="edit-details">Detailed overview</label><textarea id="edit-details" name="details" rows="5">${esc(i.details)}</textarea></div><div class="form-field"><label for="edit-image">Cover / thumbnail</label><input type="file" id="edit-image" accept="image/png,image/jpeg,image/webp,image/gif"><small>PNG, JPEG, WebP or GIF, up to 5 MB. Only upload images you are authorized to use.</small>${i.thumbnail ? `<img src="${esc(i.thumbnail)}" alt="Current thumbnail" style="height:70px;width:50px;object-fit:cover"><label><input type="checkbox" name="removeImage"> Remove current image</label>` : ""}</div>${field("imageAlt", "Accessible image description")}${field("reviewNote", "Editorial review note", true)}${field("sourceLabel", "Original source entry", true)}<div class="form-field full"><label for="edit-metadata">Additional verified metadata (JSON)</label><textarea name="metadata" id="edit-metadata" rows="3">${esc(JSON.stringify(i.metadata || {}, null, 2))}</textarea><small>Example: {"publisher":"…", "pages":240, "runtime":"120 minutes", "seasons":3}. Leave unverified details empty.</small></div>${field("parentId", "Parent collection ID", false, "Optional. The parent collection must exist.")}${field("children", "Collection member IDs", false, "Separate IDs with |. Members must already exist.")}</div>${[
      ["creators", "creator"],
      ["categories", "category"],
      ["subcategories", "subcategory"],
      ["genres", "genre"],
      ["tags", "tag"],
    ]
      .map(
        ([field, kind]) =>
          `<datalist id="list-${field}">${adminTerms
            .filter((t) => t.kind === kind)
            .map((t) => `<option value="${esc(t.name)}"></option>`)
            .join("")}</datalist>`,
      )
      .join(
        "",
      )}<p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-action="close-modal">Cancel</button><button type="button" class="secondary" id="save-draft">Save as draft</button><button type="submit" class="primary">Save discovery ${icon("check")}</button></div></form>`,
  );
  $("#save-draft").addEventListener("click", () => {
    $("#edit-status").value = "draft";
    $("#editor-form").requestSubmit();
  });
  $("#editor-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const error = $(".form-error", form);
    error.textContent = "";
    const buttons = $$("button", form);
    buttons.forEach((b) => (b.disabled = true));
    try {
      const data = Object.fromEntries(new FormData(form));
      for (const k of [
        "creators",
        "categories",
        "subcategories",
        "genres",
        "tags",
        "children",
      ])
        data[k] = (data[k] || "")
          .split("|")
          .map((x) => x.trim())
          .filter(Boolean);
      try {
        data.metadata = JSON.parse(data.metadata || "{}");
      } catch {
        throw Error("Additional metadata must be valid JSON.");
      }
      data.thumbnail = data.removeImage ? "" : i.thumbnail || "";
      const file = $("#edit-image").files[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024)
          throw Error("Images must be smaller than 5 MB.");
        const b64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const up = await request("/api/admin/upload", "POST", { data: b64 });
        data.thumbnail = up.url;
      }
      if (data.thumbnail && !data.imageAlt.trim())
        throw Error(
          "Please describe your uploaded image for screen reader users.",
        );
      const savedItem = await request(
        "/api/admin/items" + (i.id ? "/" + i.id : ""),
        i.id ? "PUT" : "POST",
        data,
      );
      modal.close();
      await refresh();
      await admin();
      toast(`“${savedItem.title}” saved as ${savedItem.status}.`);
    } catch (err) {
      error.textContent = err.message;
      error.scrollIntoView({ block: "nearest" });
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  });
}
async function taxonomy() {
  adminTerms = await api("/api/admin/terms");
  openModal(
    "The building blocks of discovery",
    `<p style="color:var(--muted);font-size:12px;line-height:1.8">Manage reusable creators, categories, genres and tags. Renaming updates all assigned items. Terms in use cannot be deleted.</p><form class="term-form" id="term-form"><select name="kind" aria-label="Term kind">${options(["category", "subcategory", "creator", "genre", "tag"], "category")}</select><input name="name" placeholder="Name" aria-label="Term name" required maxlength="300"><select name="parent" aria-label="Parent category"><option value="">Parent category (for subcategories)</option>${options(
      adminTerms.filter((t) => t.kind === "category").map((t) => t.name),
      "",
    )}</select><button class="primary">${icon("plus")} Add term</button></form><p class="form-error" role="alert"></p><label class="form-field" style="margin-bottom:15px"><span>Find a term</span><input type="search" id="term-search" placeholder="Search names or types…"></label><div class="term-list">${adminTerms.map((t) => `<div class="term-entry" data-term-text="${esc((t.name + " " + t.kind).toLowerCase())}"><small>${esc(t.kind)}${t.parent ? " / " + esc(t.parent) : ""}</small><span>${esc(t.name)}</span><button data-rename-term="${t.id}" aria-label="Rename ${esc(t.name)}">Edit</button><button data-delete-term="${t.id}" aria-label="Delete ${esc(t.name)}">×</button></div>`).join("")}</div>`,
  );
  $("#term-search").addEventListener("input", (e) =>
    $$("[data-term-text]").forEach(
      (el) =>
        (el.hidden = !el.dataset.termText.includes(
          e.target.value.toLowerCase(),
        )),
    ),
  );
  $("#term-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await request(
        "/api/admin/terms",
        "POST",
        Object.fromEntries(new FormData(e.target)),
      );
      await refresh();
      await taxonomy();
      toast("Library term added");
    } catch (err) {
      $(".form-error", modal).textContent = err.message;
    }
  });
}
function confirmDialog(title, message, action, label = "Confirm") {
  openModal(
    title,
    `<p style="line-height:1.9;color:var(--muted)">${esc(message)}</p><p class="form-error" role="alert"></p><div class="form-actions"><button class="secondary" data-action="close-modal">Cancel</button><button class="primary" id="confirm-action">${esc(label)}</button></div>`,
  );
  $("#confirm-action").addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await action();
      modal.close();
      await refresh();
      await admin();
    } catch (err) {
      $(".form-error", modal).textContent = err.message;
      e.target.disabled = false;
    }
  });
}
function importDialog() {
  let payload;
  openModal(
    "Make room for more stories",
    `<p style="line-height:1.8;font-size:12px;color:var(--muted)">Import a JSON array or CSV. Export the current collection for a template. Array fields in CSV use | separators. Imports create new items and skip matching title, creator and type combinations. Existing entries are never overwritten. All rows are validated before saving.</p><div class="form-field"><label for="import-file">Choose JSON or CSV (up to 7 MB)</label><input type="file" id="import-file" accept=".json,.csv"></div><p class="form-error" role="alert"></p><div id="import-result"></div><div class="form-actions"><button class="secondary" data-action="close-modal">Cancel</button><button class="primary" id="import-confirm" disabled>Import validated items</button></div>`,
  );
  $("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    $("#import-confirm").disabled = true;
    $(".form-error", modal).textContent = "";
    $("#import-result").innerHTML = "";
    payload = null;
    if (!file) return;
    try {
      if (file.size > 7 * 1024 * 1024)
        throw Error("Choose a file smaller than 7 MB.");
      let text = (await file.text()).replace(/^\uFEFF/, "");
      payload = file.name.endsWith(".csv")
        ? { format: "csv", content: text }
        : { format: "json", items: JSON.parse(text) };
      const result = await request("/api/admin/import", "POST", {
        ...payload,
        dryRun: true,
      });
      $("#import-result").innerHTML =
        `<div class="import-summary"><strong>${result.ready} valid new items ready to import.</strong><br>${result.duplicates.length} duplicates will be skipped.${result.duplicates.length ? "<br>" + result.duplicates.slice(0, 10).map(esc).join(", ") : ""}</div>`;
      $("#import-confirm").disabled = !result.ready;
    } catch (err) {
      $(".form-error", modal).textContent = err.message;
    }
  });
  $("#import-confirm").addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const result = await request("/api/admin/import", "POST", payload);
      modal.close();
      await refresh();
      await admin();
      toast(
        `${result.imported} discoveries imported; ${result.duplicates.length} duplicates skipped.`,
      );
    } catch (err) {
      $(".form-error", modal).textContent = err.message;
      e.target.disabled = false;
    }
  });
}
// Event delegation keeps cards, dialogs and URL-driven pages in sync.
document.addEventListener("click", async (e) => {
  const a = e.target.closest("a");
  if (
    a &&
    a.origin === location.origin &&
    !a.hasAttribute("download") &&
    !a.pathname.startsWith("/api/") &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.shiftKey &&
    e.button === 0
  ) {
    if (a.hash && a.pathname === location.pathname) {
      return;
    }
    e.preventDefault();
    go(a.pathname + a.search + a.hash);
    return;
  }
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  try {
    if (b.dataset.save) {
      toggleSave(b.dataset.save);
      return;
    }
    if ("category" in b.dataset) {
      if (!b.dataset.category) {
        const p = params();
        p.delete("category");
        p.delete("subcategory");
        p.delete("page");
        go(location.pathname + (p.size ? "?" + p : ""), { scroll: false });
      } else changeParam("category", b.dataset.category, { multi: true });
      return;
    }
    if (b.dataset.remove) {
      if (b.dataset.remove === "q") changeParam("q", "");
      else changeParam(b.dataset.remove, b.dataset.value, { multi: true });
      return;
    }
    if (b.dataset.view) {
      view = b.dataset.view;
      try {
        localStorage.setItem("aspirants-view", view);
      } catch {}
      library();
      return;
    }
    if (b.dataset.page) {
      const p = params();
      p.set("page", b.dataset.page);
      go(location.pathname + "?" + p, { scroll: false });
      $("#browse").scrollIntoView({ block: "start" });
      return;
    }
    if (b.dataset.adminPage) {
      adminPage = Number(b.dataset.adminPage);
      drawAdmin();
      return;
    }
    if (b.dataset.edit) {
      editor(adminItems.find((i) => i.id === b.dataset.edit));
      return;
    }
    if (b.dataset.preview) {
      detail(
        adminItems.find((i) => i.id === b.dataset.preview),
        { preview: true },
      );
      window.scrollTo({ top: 0 });
      return;
    }
    if (b.dataset.archive) {
      const i = adminItems.find((i) => i.id === b.dataset.archive);
      await request("/api/admin/items/" + i.id, "PUT", {
        ...i,
        status: i.status === "archived" ? "draft" : "archived",
      });
      await refresh();
      await admin();
      toast("Publication status updated");
      return;
    }
    if (b.dataset.delete) {
      const i = adminItems.find((i) => i.id === b.dataset.delete);
      confirmDialog(
        "Delete this discovery?",
        `“${i.title}” will be permanently removed. You can archive it instead to keep a private copy.`,
        async () => {
          await request("/api/admin/items/" + i.id, "DELETE");
          toast("Discovery deleted");
        },
        "Delete permanently",
      );
      return;
    }
    if (b.dataset.renameTerm) {
      const t = adminTerms.find((t) => t.id === Number(b.dataset.renameTerm));
      openModal(
        "Rename library term",
        `<form id="rename-form"><label class="form-field">New name<input name="name" value="${esc(t.name)}" required maxlength="300"></label>${
          t.kind === "subcategory"
            ? `<label class="form-field" style="margin-top:15px">Parent category<select name="parent">${options(
                adminTerms
                  .filter((term) => term.kind === "category")
                  .map((term) => term.name),
                t.parent,
              )}</select></label>`
            : ""
        }<p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" data-action="terms">Cancel</button><button class="primary">Save name</button></div></form>`,
      );
      $("#rename-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          await request(
            "/api/admin/terms/" + t.id,
            "PUT",
            Object.fromEntries(new FormData(e.target)),
          );
          await refresh();
          await taxonomy();
          toast("Term updated across the library");
        } catch (err) {
          $(".form-error", modal).textContent = err.message;
        }
      });
      return;
    }
    if (b.dataset.deleteTerm) {
      await request("/api/admin/terms/" + b.dataset.deleteTerm, "DELETE");
      await taxonomy();
      toast("Unused term removed");
      return;
    }
    const action = b.dataset.action;
    if (action === "clear") {
      go(location.pathname, { scroll: false });
    }
    if (action === "open-filters") {
      setFilterOpen(true);
      $(".filter-close").focus();
    }
    if (action === "close-filters") {
      setFilterOpen(false);
      $(".mobile-filter").focus();
    }
    if (action === "search") {
      if (!$("#library-search")) {
        go("/library");
      }
      $("#library-search input")?.focus();
      $("#library-search")?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
    if (action === "close-modal") modal.close();
    if (action === "retry") {
      await refresh();
      await render();
    }
    if (action === "logout") {
      await request("/api/logout", "POST");
      await admin();
      toast("Signed out");
    }
    if (action === "back-admin") await admin();
    if (action === "new-item") editor();
    if (action === "terms") await taxonomy();
    if (action === "import") importDialog();
  } catch (err) {
    if (modal.open && $(".form-error", modal))
      $(".form-error", modal).textContent = err.message;
    else toast(err.message);
  }
});
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    if (!$("#library-search")) go("/library");
    $("#library-search input")?.focus();
  }
  if (e.key === "Escape" && $(".filter-sidebar.open")) {
    setFilterOpen(false);
    $(".mobile-filter")?.focus();
  }
  if (e.key === "Tab" && $(".filter-sidebar.open")) {
    const controls = $$("button,input,summary", $(".filter-sidebar")).filter(
      (el) => el.getClientRects().length && !el.disabled,
    );
    const first = controls[0],
      last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
document.addEventListener(
  "error",
  (e) => {
    if (e.target.tagName === "IMG" && e.target.dataset.fallback) {
      const id = e.target.dataset.fallback;
      delete e.target.dataset.fallback;
      e.target.src = "/covers/" + encodeURIComponent(id) + ".svg";
    }
  },
  true,
);
window.addEventListener("popstate", render);
$("#saved-icon").innerHTML = icon("bookmark");
$(".header-search").innerHTML = icon("search");
updateSaved();
try {
  await refresh();
  await render();
} catch (e) {
  main.innerHTML = `<div class="empty">${icon("globe")}<h3>The library is taking a moment.</h3><p>${esc(e.message)}</p><button class="primary" data-action="retry">Try again</button></div>`;
}

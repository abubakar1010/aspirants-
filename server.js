import http from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { db, dataDir, allItems, saveItem, checkPassword } from "./db.js";
const publicDir = resolve("public");
const essay = JSON.parse(
  readFileSync(new URL("./seed/essay.json", import.meta.url), "utf8"),
);
const types = ["book", "poem", "movie", "series", "documentary", "collection"];
const limits = new Map();
function fail(status, message) {
  throw Object.assign(Error(message), { status });
}
function send(res, status, value, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(value));
}
async function body(req) {
  let size = 0,
    parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > 8 * 1024 * 1024)
      fail(413, "Request is too large (maximum 8 MB).");
    parts.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString() || "{}");
  } catch {
    fail(400, "Invalid JSON.");
  }
}
function admin(req) {
  const token = /\baspirants_session=([^;]+)/.exec(
    req.headers.cookie || "",
  )?.[1];
  if (!token) return false;
  return !!db
    .prepare("SELECT token FROM sessions WHERE token=? AND expires>?")
    .get(createHash("sha256").update(token).digest("hex"), Date.now());
}
function validate(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    fail(400, "Each item must be an object.");
  const out = {};
  for (const key of [
    "title",
    "description",
    "details",
    "language",
    "reviewNote",
    "sourceLabel",
    "imageAlt",
  ]) {
    if (raw[key] != null && typeof raw[key] !== "string")
      fail(400, `${key} must be text.`);
    out[key] = (raw[key] || "").trim();
    if (out[key].length > 30000) fail(400, `${key} is too long.`);
  }
  if (!out.title || out.title.length > 300)
    fail(400, "A title of 1–300 characters is required.");
  out.type = raw.type || "book";
  if (!types.includes(out.type)) fail(400, "Unknown content type.");
  out.status = raw.status || "draft";
  if (!["draft", "published", "archived"].includes(out.status))
    fail(400, "Unknown status.");
  for (const key of [
    "creators",
    "categories",
    "subcategories",
    "genres",
    "tags",
    "children",
  ]) {
    if (
      raw[key] != null &&
      (!Array.isArray(raw[key]) ||
        raw[key].some((v) => typeof v !== "string" || v.length > 300) ||
        raw[key].length > 100)
    )
      fail(400, `${key} must be a list of names.`);
    out[key] = [
      ...new Set((raw[key] || []).map((s) => s.trim()).filter(Boolean)),
    ];
  }
  if (!out.categories.length)
    fail(400, "At least one main category is required.");
  out.year = raw.year === "" || raw.year == null ? null : Number(raw.year);
  if (
    out.year !== null &&
    (!Number.isInteger(out.year) || out.year < 1 || out.year > 2100)
  )
    fail(400, "Year must be between 1 and 2100.");
  out.thumbnail = raw.thumbnail || "";
  if (
    typeof out.thumbnail !== "string" ||
    (out.thumbnail &&
      !/^\/uploads\/[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(out.thumbnail))
  )
    fail(400, "Use the image upload control for thumbnails.");
  out.metadata = {};
  if (
    raw.metadata &&
    typeof raw.metadata === "object" &&
    !Array.isArray(raw.metadata)
  )
    for (const [k, v] of Object.entries(raw.metadata)) {
      if (typeof v !== "string" && typeof v !== "number")
        fail(400, "Metadata values must be text or numbers.");
      if (k.length > 100 || String(v).length > 3000)
        fail(400, "Metadata is too long.");
      out.metadata[k] = v;
    }
  if (out.thumbnail && !out.imageAlt.trim())
    fail(
      400,
      "An accessible image description is required for uploaded images.",
    );
  if (raw.parentId) out.parentId = String(raw.parentId).slice(0, 100);
  return out;
}
function saveLinked(item) {
  const records = allItems();
  if (item.parentId === item.id || item.children.includes(item.id))
    fail(400, "A collection cannot contain itself.");
  if (item.parentId) {
    const parent = records.find((i) => i.id === item.parentId);
    if (!parent || parent.type !== "collection")
      fail(400, "Parent must be an existing collection.");
    if (item.type === "collection")
      fail(400, "Nested collections are not supported.");
  }
  if (item.children.length && item.type !== "collection")
    fail(400, "Only collections can have member entries.");
  for (const id of item.children) {
    const child = records.find((i) => i.id === id);
    if (!child || child.type === "collection")
      fail(400, "Every member must be an existing non-collection entry.");
  }
  db.exec("BEGIN");
  try {
    for (const record of records) {
      let changed = false;
      if (record.type === "collection" && record.id !== item.id) {
        const has = (record.children || []).includes(item.id);
        const should = item.parentId === record.id;
        if (has !== should) {
          record.children = should
            ? [...(record.children || []), item.id]
            : (record.children || []).filter((id) => id !== item.id);
          changed = true;
        }
      }
      if (item.type === "collection" && record.id !== item.id) {
        if (item.children.includes(record.id) && record.parentId !== item.id) {
          if (record.parentId) {
            const oldParent = records.find((i) => i.id === record.parentId);
            if (oldParent) {
              oldParent.children = (oldParent.children || []).filter(
                (id) => id !== record.id,
              );
              saveItem(oldParent);
            }
          }
          record.parentId = item.id;
          changed = true;
        } else if (
          record.parentId === item.id &&
          !item.children.includes(record.id)
        ) {
          delete record.parentId;
          changed = true;
        }
      }
      if (changed) saveItem(record);
    }
    saveItem(item);
    db.exec("COMMIT");
    return item;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
const duplicate = (item, except, existing = allItems()) =>
  existing.some(
    (i) =>
      i.id !== except &&
      i.title.normalize("NFKC").toLowerCase() ===
        item.title.normalize("NFKC").toLowerCase() &&
      i.type === item.type &&
      i.creators.join("|") === item.creators.join("|"),
  );
const xml = (s) =>
  String(s).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
function cover(item) {
  let n = 0;
  for (const c of item.title) n = (n + c.codePointAt(0)) % 7;
  const colors = [
    ["#e7ad61", "#472c20"],
    ["#194f47", "#f5e6b9"],
    ["#ca6246", "#fff1cd"],
    ["#ddd0ad", "#373e30"],
    ["#283b55", "#e3cca2"],
    ["#afbbc0", "#253b42"],
    ["#6a534e", "#f4dec0"],
  ];
  const [bg, fg] = colors[n];
  const words = item.title.split(" ");
  let lines = [""];
  for (const w of words) {
    if ((lines.at(-1) + " " + w).length > 17 && lines.at(-1)) lines.push(w);
    else lines[lines.length - 1] += (lines.at(-1) ? " " : "") + w;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560" viewBox="0 0 400 560"><rect width="400" height="560" fill="${bg}"/><rect x="18" y="18" width="364" height="524" fill="none" stroke="${fg}" opacity=".35"/><path d="M28 0v560" stroke="${fg}" opacity=".15" stroke-width="6"/><text x="200" y="62" text-anchor="middle" fill="${fg}" font-family="serif" font-size="11" letter-spacing="4">ASPIRANTS COLLECTION</text><circle cx="200" cy="340" r="102" fill="none" stroke="${fg}" stroke-width="1" opacity=".5"/><circle cx="200" cy="340" r="78" fill="${fg}" opacity=".13"/><path d="M100 378q100-170 200 0M120 400q80-110 160 0M150 430V260M250 430V260M170 440V240M230 440V240M200 445V225" fill="none" stroke="${fg}" opacity=".45"/><text text-anchor="middle" fill="${fg}" font-family="Noto Serif Bengali,serif" font-size="${lines.length > 3 ? 24 : 30}" font-weight="600">${lines
    .slice(0, 5)
    .map((l, i) => `<tspan x="200" y="${115 + i * 42}">${xml(l)}</tspan>`)
    .join(
      "",
    )}</text><text x="200" y="501" text-anchor="middle" fill="${fg}" font-family="Noto Sans Bengali,serif" font-size="15">${xml((item.creators[0] || item.type.toUpperCase()).slice(0, 38))}</text><text x="200" y="524" text-anchor="middle" fill="${fg}" font-family="sans-serif" font-size="9" letter-spacing="3">READ · WATCH · GROW</text></svg>`;
}
function parseCSV(text) {
  if (typeof text !== "string") fail(400, "CSV content must be text.");
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (!quoted && field) fail(400, "Malformed CSV quote.");
      else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if (c === "\n" && !quoted) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) fail(400, "Unclosed CSV quote.");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const headers = rows.shift() || [];
  if (!headers.includes("title")) fail(400, "CSV requires a title column.");
  return rows
    .filter((r) => r.some(Boolean))
    .map((r) =>
      Object.fromEntries(
        headers.map((h, i) => {
          let v = r[i] || "";
          if (
            [
              "creators",
              "categories",
              "subcategories",
              "genres",
              "tags",
              "children",
            ].includes(h)
          )
            v = v ? v.split("|") : [];
          if (h === "metadata") {
            try {
              v = JSON.parse(v || "{}");
            } catch {
              fail(400, "Invalid metadata JSON in CSV.");
            }
          }
          return [h, v];
        }),
      ),
    );
}
const server = http.createServer(async (req, res) => {
  try {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    const url = new URL(req.url, "http://local");
    const p = url.pathname;
    if (p.startsWith("/api/")) {
      if (!["GET", "HEAD"].includes(req.method)) {
        if (
          req.headers.origin &&
          new URL(req.headers.origin).host !== req.headers.host
        )
          fail(403, "Cross-origin requests are not allowed.");
        if (req.headers["content-type"]?.split(";")[0] !== "application/json")
          fail(415, "Use application/json.");
      }
      if (p === "/api/session" && req.method === "GET")
        return send(res, 200, {
          authenticated: admin(req),
          configured: !!db
            .prepare("SELECT value FROM settings WHERE key='admin_password'")
            .get(),
        });
      if (p === "/api/login" && req.method === "POST") {
        const key = req.socket.remoteAddress;
        const now = Date.now();
        if (limits.size > 10000)
          for (const [k, v] of limits) if (v.until < now) limits.delete(k);
        let lim = limits.get(key);
        if (lim?.until > now && lim.count >= 8)
          fail(429, "Too many attempts. Try again in 15 minutes.");
        if (!lim || lim.until < now) {
          lim = { count: 0, until: now + 900000 };
          limits.set(key, lim);
        }
        const b = await body(req);
        const stored = db
          .prepare("SELECT value FROM settings WHERE key='admin_password'")
          .get();
        if (!stored)
          fail(
            503,
            "Administrator setup is required. Run npm run admin in the server terminal.",
          );
        if (
          typeof b.password !== "string" ||
          !checkPassword(b.password, stored.value)
        ) {
          lim.count++;
          fail(401, "Incorrect password.");
        }
        limits.delete(key);
        const token = randomBytes(32).toString("hex");
        db.prepare("DELETE FROM sessions WHERE expires<?").run(now);
        db.prepare("INSERT INTO sessions VALUES (?,?)").run(
          createHash("sha256").update(token).digest("hex"),
          now + 86400000,
        );
        return send(
          res,
          200,
          { ok: true },
          {
            "Set-Cookie": `aspirants_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`,
          },
        );
      }
      if (p === "/api/logout" && req.method === "POST") {
        const token = /\baspirants_session=([^;]+)/.exec(
          req.headers.cookie || "",
        )?.[1];
        if (token)
          db.prepare("DELETE FROM sessions WHERE token=?").run(
            createHash("sha256").update(token).digest("hex"),
          );
        return send(
          res,
          200,
          { ok: true },
          {
            "Set-Cookie":
              "aspirants_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          },
        );
      }
      if (p === "/api/essay" && req.method === "GET")
        return send(res, 200, essay);
      if (p === "/api/items" && req.method === "GET")
        return send(
          res,
          200,
          allItems().filter((i) => i.status === "published"),
        );
      if (p === "/api/terms" && req.method === "GET") {
        const used = new Set();
        for (const i of allItems().filter((i) => i.status === "published"))
          for (const k of [
            "categories",
            "subcategories",
            "creators",
            "genres",
            "tags",
          ])
            for (const v of i[k]) used.add(v);
        return send(
          res,
          200,
          db
            .prepare("SELECT * FROM terms ORDER BY name")
            .all()
            .filter((t) => used.has(t.name)),
        );
      }
      if (p.startsWith("/api/admin/")) {
        if (!admin(req)) fail(401, "Sign in to manage the library.");
        if (p === "/api/admin/items" && req.method === "GET")
          return send(res, 200, allItems());
        if (p === "/api/admin/items" && req.method === "POST") {
          const item = validate(await body(req));
          if (duplicate(item))
            fail(
              409,
              "This title, type, and creator combination already exists.",
            );
          item.id = randomUUID();
          saveLinked(item);
          return send(res, 201, item);
        }
        const m = p.match(/^\/api\/admin\/items\/([^/]+)$/);
        if (m) {
          const current = allItems().find((i) => i.id === m[1]);
          if (!current) fail(404, "Item not found.");
          if (req.method === "PUT") {
            const item = { ...validate(await body(req)), id: current.id };
            if (duplicate(item, current.id))
              fail(409, "A matching item already exists.");
            return send(res, 200, saveLinked(item));
          }
          if (req.method === "DELETE") {
            const linked = allItems().filter(
              (i) =>
                i.parentId === current.id ||
                (i.children || []).includes(current.id),
            );
            if (linked.length)
              fail(
                409,
                "Remove this item from its collection, or remove its members, before deleting.",
              );
            db.prepare("DELETE FROM items WHERE id=?").run(current.id);
            return send(res, 200, { ok: true });
          }
        }
        if (p === "/api/admin/terms" && req.method === "GET")
          return send(
            res,
            200,
            db.prepare("SELECT * FROM terms ORDER BY kind,name").all(),
          );
        if (p === "/api/admin/terms" && req.method === "POST") {
          const b = await body(req);
          if (
            !["category", "subcategory", "creator", "genre", "tag"].includes(
              b.kind,
            ) ||
            typeof b.name !== "string" ||
            !b.name.trim() ||
            b.name.length > 300
          )
            fail(400, "A valid kind and name are required.");
          if (
            b.kind === "subcategory" &&
            !db
              .prepare("SELECT id FROM terms WHERE kind='category' AND name=?")
              .get(b.parent || "")
          )
            fail(400, "Choose an existing main category.");
          try {
            db.prepare(
              "INSERT INTO terms(kind,name,parent) VALUES (?,?,?)",
            ).run(
              b.kind,
              b.name.trim(),
              b.kind === "subcategory" ? b.parent : "",
            );
          } catch {
            fail(409, "This term already exists.");
          }
          return send(res, 201, { ok: true });
        }
        const tm = p.match(/^\/api\/admin\/terms\/(\d+)$/);
        if (tm) {
          const t = db.prepare("SELECT * FROM terms WHERE id=?").get(tm[1]);
          if (!t) fail(404, "Term not found.");
          const field = {
            category: "categories",
            subcategory: "subcategories",
            creator: "creators",
            genre: "genres",
            tag: "tags",
          }[t.kind];
          if (req.method === "DELETE") {
            if (
              allItems().some((i) => i[field].includes(t.name)) ||
              (t.kind === "category" &&
                db.prepare("SELECT id FROM terms WHERE parent=?").get(t.name))
            )
              fail(409, "This term is in use. Remove its assignments first.");
            db.prepare("DELETE FROM terms WHERE id=?").run(t.id);
            return send(res, 200, { ok: true });
          }
          if (req.method === "PUT") {
            const b = await body(req);
            if (
              typeof b.name !== "string" ||
              !b.name.trim() ||
              b.name.length > 300
            )
              fail(400, "A name is required.");
            const name = b.name.trim();
            const parent =
              t.kind === "subcategory" ? (b.parent ?? t.parent) : "";
            if (
              t.kind === "subcategory" &&
              !db
                .prepare(
                  "SELECT id FROM terms WHERE kind='category' AND name=?",
                )
                .get(parent)
            )
              fail(400, "Choose an existing main category.");
            if (
              db
                .prepare(
                  "SELECT id FROM terms WHERE kind=? AND name=? AND id!=?",
                )
                .get(t.kind, name, t.id)
            )
              fail(409, "That name already exists.");
            db.exec("BEGIN");
            try {
              db.prepare("UPDATE terms SET name=?,parent=? WHERE id=?").run(
                name,
                parent,
                t.id,
              );
              if (t.kind === "category")
                db.prepare("UPDATE terms SET parent=? WHERE parent=?").run(
                  name,
                  t.name,
                );
              for (const i of allItems()) {
                if (i[field].includes(t.name)) {
                  i[field] = i[field].map((x) => (x === t.name ? name : x));
                  saveItem(i);
                }
              }
              db.exec("COMMIT");
            } catch (e) {
              db.exec("ROLLBACK");
              throw e;
            }
            return send(res, 200, { ok: true });
          }
        }
        if (p === "/api/admin/upload" && req.method === "POST") {
          const b = await body(req);
          if (typeof b.data !== "string") fail(400, "An image is required.");
          const buf = Buffer.from(b.data, "base64");
          if (buf.length > 5 * 1024 * 1024)
            fail(413, "Images must be smaller than 5 MB.");
          let ext;
          if (
            buf
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          )
            ext = "png";
          else if (buf[0] === 255 && buf[1] === 216 && buf[2] === 255)
            ext = "jpg";
          else if (
            buf
              .subarray(0, 6)
              .toString()
              .match(/^GIF8[79]a$/)
          )
            ext = "gif";
          else if (
            buf.subarray(0, 4).toString() === "RIFF" &&
            buf.subarray(8, 12).toString() === "WEBP"
          )
            ext = "webp";
          else fail(400, "Use a PNG, JPEG, GIF, or WebP image.");
          const filename = randomUUID() + "." + ext;
          writeFileSync(join(dataDir, "uploads", filename), buf);
          return send(res, 201, { url: "/uploads/" + filename });
        }
        if (p === "/api/admin/import" && req.method === "POST") {
          const b = await body(req);
          const raw = b.format === "csv" ? parseCSV(b.content) : b.items;
          if (!Array.isArray(raw) || raw.length > 2000)
            fail(
              400,
              "Import a JSON array or CSV containing at most 2,000 items.",
            );
          const existing = allItems(),
            pending = [],
            duplicates = [],
            idMap = new Map();
          for (let n = 0; n < raw.length; n++) {
            let item;
            try {
              item = validate(raw[n]);
            } catch (e) {
              fail(400, `Row ${n + 1}: ${e.message}`);
            }
            const match = [...existing, ...pending].find((i) =>
              duplicate(item, null, [i]),
            );
            if (match) {
              duplicates.push(item.title);
              if (raw[n].id) idMap.set(raw[n].id, match.id);
              continue;
            }
            item.id = randomUUID();
            if (raw[n].id) {
              if (idMap.has(raw[n].id))
                fail(400, `Row ${n + 1}: duplicate record ID.`);
              idMap.set(raw[n].id, item.id);
            }
            pending.push(item);
          }
          const known = [...existing, ...pending];
          for (const item of pending) {
            if (item.parentId)
              item.parentId = idMap.get(item.parentId) || item.parentId;
            item.children = item.children.map((id) => idMap.get(id) || id);
            if (item.parentId === item.id || item.children.includes(item.id))
              fail(400, "A collection cannot contain itself.");
            if (
              item.parentId &&
              (!known.some(
                (i) => i.id === item.parentId && i.type === "collection",
              ) ||
                item.type === "collection")
            )
              fail(400, "Import has an invalid parent collection.");
            if (item.children.length && item.type !== "collection")
              fail(400, "Only collections can have member entries.");
            if (
              item.children.some(
                (id) =>
                  !known.some((i) => i.id === id && i.type !== "collection"),
              )
            )
              fail(400, "Import has a missing collection member.");
          }
          if (b.dryRun)
            return send(res, 200, { ready: pending.length, duplicates });
          db.exec("BEGIN");
          try {
            for (const i of pending) saveItem(i);
            db.exec("COMMIT");
          } catch (e) {
            db.exec("ROLLBACK");
            throw e;
          }
          return send(res, 200, { imported: pending.length, duplicates });
        }
        if (p === "/api/admin/export" && req.method === "GET") {
          const items = allItems();
          if (url.searchParams.get("format") === "csv") {
            const keys = [
              "id",
              "title",
              "type",
              "creators",
              "categories",
              "subcategories",
              "genres",
              "tags",
              "language",
              "year",
              "description",
              "details",
              "status",
              "thumbnail",
              "imageAlt",
              "reviewNote",
              "sourceLabel",
              "parentId",
              "children",
              "metadata",
            ];
            const quote = (v) =>
              '"' + String(v ?? "").replace(/"/g, '""') + '"';
            const csv = [
              keys.join(","),
              ...items.map((i) =>
                keys
                  .map((k) =>
                    quote(
                      Array.isArray(i[k])
                        ? i[k].join("|")
                        : typeof i[k] === "object" && i[k] !== null
                          ? JSON.stringify(i[k])
                          : i[k],
                    ),
                  )
                  .join(","),
              ),
            ].join("\r\n");
            res.writeHead(200, {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": 'attachment; filename="aspirants.csv"',
            });
            return res.end("\uFEFF" + csv);
          }
          return send(res, 200, items, {
            "Content-Disposition": 'attachment; filename="aspirants.json"',
          });
        }
      }
      fail(404, "Endpoint not found.");
    }
    if (req.method !== "GET" && req.method !== "HEAD")
      fail(405, "Method not allowed.");
    if (p.startsWith("/covers/")) {
      const id = decodeURIComponent(p.slice(8).replace(/\.svg$/, ""));
      const item = allItems().find(
        (i) => i.id === id && (i.status === "published" || admin(req)),
      );
      if (!item) fail(404, "Cover not found.");
      res.writeHead(200, {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "private, max-age=300",
      });
      return res.end(cover(item));
    }
    let file;
    if (/^\/uploads\/[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(p))
      file = join(dataDir, p);
    else {
      file = resolve(publicDir, "." + decodeURIComponent(p));
      if (!file.startsWith(publicDir + "/"))
        file = join(publicDir, "index.html");
      if (!existsSync(file) || !statSync(file).isFile())
        file = join(publicDir, "index.html");
    }
    const mime = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css",
      ".js": "application/javascript",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
    };
    if (!existsSync(file)) fail(404, "File not found.");
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(req.method === "HEAD" ? "" : readFileSync(file));
  } catch (e) {
    if (!res.headersSent)
      send(res, e.status || 500, {
        error: e.status ? e.message : "Something went wrong. Please try again.",
      });
    else res.end();
    if (!e.status) console.error(e);
  }
});
server.listen(
  Number(process.env.PORT ?? 3000),
  process.env.HOST || "0.0.0.0",
  () => console.log(`Aspirants listening on port ${server.address().port}`),
);

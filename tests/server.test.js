import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
const dir = mkdtempSync(join(tmpdir(), "aspirants-api-"));
const password = randomBytes(20).toString("hex");
let server,
  base,
  cookie = "",
  createdId,
  upload;
async function start() {
  server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: "0", DATA_DIR: dir, ADMIN_PASSWORD: password },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    let output = "";
    server.stdout.on("data", (d) => {
      output += d;
      const port = output.match(/port (\d+)/);
      if (port) {
        base = "http://127.0.0.1:" + port[1];
        resolve();
      }
    });
    server.once("exit", (c) => reject(Error("Server exited " + c)));
    setTimeout(() => reject(Error("Startup timeout")), 10000).unref();
  });
}
async function stop() {
  const exited = new Promise((r) => server.once("exit", r));
  server.kill();
  await exited;
}
async function call(path, method = "GET", data, auth = true, extra = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(auth && cookie ? { Cookie: cookie } : {}),
      ...extra,
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, data: body, res };
}
const sample = {
  title: "Persistence test — বাংলা",
  type: "book",
  categories: ["Books & Literature"],
  subcategories: ["Bengali Literature"],
  creators: ["Test writer"],
  genres: ["Test genre"],
  tags: ["Test tag"],
  description: "A test discovery.",
  details: "A longer test overview.",
  language: "বাংলা",
  status: "published",
};
before(start);
after(async () => {
  if (server?.exitCode === null) await stop();
  rmSync(dir, { recursive: true, force: true });
});
test("imports all source recommendations and expanded film collections", async () => {
  const r = await call("/api/items");
  assert.equal(r.status, 200);
  assert.equal(r.data.length, 193);
  assert.equal(r.data.filter((i) => i.parentId).length, 14);
  assert.ok(
    r.data.find(
      (i) => i.title === "লালসালু" && i.creators[0] === "সৈয়দ ওয়ালীউল্লাহ",
    ),
  );
  assert.ok(r.data.find((i) => i.title === "A Pale Blue Dot").reviewNote);
  assert.ok(r.data.find((i) => i.title === "Panchayet").reviewNote);
  const source = readFileSync("seed/source.txt", "utf8");
  assert.equal(
    source.split(/\r?\n/).filter((s) => /^\s*(▫️|🔹)/.test(s)).length,
    179,
  );
});
test("public visitors cannot access administrative reads or writes", async () => {
  for (const [path, method, data] of [
    ["/api/admin/items", "GET"],
    ["/api/admin/items", "POST", sample],
    ["/api/admin/terms", "POST", { kind: "tag", name: "No" }],
    ["/api/admin/upload", "POST", { data: "bad" }],
    ["/api/admin/export", "GET"],
    ["/api/admin/import", "POST", { items: [sample] }],
  ]) {
    const r = await call(path, method, data, false);
    assert.equal(r.status, 401, path);
  }
});
test("login rejects bad credentials and establishes a protected session", async () => {
  assert.equal(
    (await call("/api/login", "POST", { password: "bad" }, false)).status,
    401,
  );
  const r = await call("/api/login", "POST", { password }, false);
  assert.equal(r.status, 200);
  cookie = r.res.headers.get("set-cookie").split(";")[0];
  assert.match(r.res.headers.get("set-cookie"), /HttpOnly/);
  assert.match(r.res.headers.get("set-cookie"), /SameSite=Strict/);
  assert.equal((await call("/api/session")).data.authenticated, true);
});
test("cross-origin modifications are rejected", async () => {
  const r = await call("/api/admin/items", "POST", sample, true, {
    Origin: "https://evil.example",
  });
  assert.equal(r.status, 403);
});
test("create, edit and public discovery use persisted records", async () => {
  const r = await call("/api/admin/items", "POST", sample);
  assert.equal(r.status, 201);
  createdId = r.data.id;
  assert.ok((await call("/api/items")).data.find((i) => i.id === createdId));
  const update = await call("/api/admin/items/" + createdId, "PUT", {
    ...sample,
    title: "Persisted edit — বাংলা",
    metadata: { pages: 240 },
  });
  assert.equal(update.status, 200);
  assert.equal(update.data.metadata.pages, 240);
  assert.equal(
    (
      await call("/api/admin/items", "POST", {
        ...sample,
        title: "Persisted edit — বাংলা",
      })
    ).status,
    409,
  );
});
test("drafts and archived content remain private, including generated covers", async () => {
  const r = await call("/api/admin/items", "POST", {
    ...sample,
    title: "A private draft",
    status: "draft",
  });
  assert.equal(r.status, 201);
  assert.ok(
    !(await call("/api/items", undefined, undefined, false)).data.find(
      (i) => i.id === r.data.id,
    ),
  );
  assert.equal(
    (await fetch(base + "/covers/" + r.data.id + ".svg")).status,
    404,
  );
  const archived = await call("/api/admin/items/" + r.data.id, "PUT", {
    ...r.data,
    status: "archived",
  });
  assert.equal(archived.status, 200);
  assert.ok(!(await call("/api/items")).data.find((i) => i.id === r.data.id));
});
test("uploaded images are validated, stored and served", async () => {
  assert.equal(
    (
      await call("/api/admin/upload", "POST", {
        data: Buffer.from("<svg/>").toString("base64"),
      })
    ).status,
    400,
  );
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  const r = await call("/api/admin/upload", "POST", { data: png });
  assert.equal(r.status, 201);
  upload = r.data.url;
  assert.equal(
    (await fetch(base + upload)).headers.get("content-type"),
    "image/png",
  );
  assert.equal(
    (
      await call("/api/admin/items", "POST", {
        ...sample,
        title: "No image description",
        thumbnail: upload,
      })
    ).status,
    400,
  );
});
test("taxonomy rename propagates and in-use terms cannot be deleted", async () => {
  const terms = (await call("/api/admin/terms")).data;
  const term = terms.find(
    (t) => t.kind === "creator" && t.name === "Test writer",
  );
  assert.ok(term);
  assert.equal(
    (
      await call("/api/admin/terms/" + term.id, "PUT", {
        name: "Renamed test writer",
      })
    ).status,
    200,
  );
  assert.ok(
    (await call("/api/items")).data
      .find((i) => i.id === createdId)
      .creators.includes("Renamed test writer"),
  );
  assert.equal(
    (await call("/api/admin/terms/" + term.id, "DELETE", {})).status,
    409,
  );
  assert.equal(
    (
      await call("/api/admin/terms", "POST", {
        kind: "subcategory",
        name: "Invalid parent",
        parent: "missing",
      })
    ).status,
    400,
  );
});
test("imports validate the whole batch, preview duplicates and persist CSV", async () => {
  const before = (await call("/api/admin/items")).data.length;
  const invalid = await call("/api/admin/import", "POST", {
    items: [
      { ...sample, title: "Atomic import" },
      { ...sample, title: "" },
    ],
  });
  assert.equal(invalid.status, 400);
  assert.equal((await call("/api/admin/items")).data.length, before);
  const original = (await call("/api/admin/items")).data.find(
    (i) => i.id === createdId,
  );
  const preview = await call("/api/admin/import", "POST", {
    dryRun: true,
    items: [original, { ...sample, title: "Imported JSON" }],
  });
  assert.equal(preview.data.ready, 1);
  assert.equal(preview.data.duplicates.length, 1);
  assert.equal((await call("/api/admin/items")).data.length, before);
  const csv =
    'title,type,categories,creators,status,description\r\n"Imported, CSV",book,Books & Literature,Test writer,published,"A description, with commas"';
  const imported = await call("/api/admin/import", "POST", {
    format: "csv",
    content: csv,
  });
  assert.equal(imported.status, 200);
  assert.equal(imported.data.imported, 1);
  assert.ok(
    (await call("/api/items")).data.some((i) => i.title === "Imported, CSV"),
  );
});
test("collection imports remap IDs and validate missing references", async () => {
  const batch = [
    {
      ...sample,
      id: "collection-old",
      title: "Imported collection",
      type: "collection",
      children: ["child-old"],
    },
    {
      ...sample,
      id: "child-old",
      title: "Imported collection member",
      parentId: "collection-old",
    },
  ];
  const r = await call("/api/admin/import", "POST", { items: batch });
  assert.equal(r.status, 200);
  const records = (await call("/api/items")).data;
  const parent = records.find((i) => i.title === "Imported collection"),
    child = records.find((i) => i.title === "Imported collection member");
  assert.equal(child.parentId, parent.id);
  assert.deepEqual(parent.children, [child.id]);
  const invalid = await call("/api/admin/import", "POST", {
    items: [
      { ...sample, title: "Missing collection", parentId: "does-not-exist" },
    ],
  });
  assert.equal(invalid.status, 400);
});
test("export is reusable and supports JSON and CSV", async () => {
  const json = await call("/api/admin/export");
  assert.equal(json.status, 200);
  assert.ok(json.data.find((i) => i.id === createdId));
  const csv = await fetch(base + "/api/admin/export?format=csv", {
    headers: { Cookie: cookie },
  });
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  const text = await csv.text();
  assert.match(text, /"Imported, CSV"/);
  const check = await call("/api/admin/import", "POST", {
    format: "csv",
    content: text,
    dryRun: true,
  });
  assert.equal(check.status, 200);
  assert.equal(check.data.ready, 0);
  assert.equal(check.data.duplicates.length, json.data.length);
});
test("edits, uploads and administrator sessions survive server restart", async () => {
  await stop();
  await start();
  const list = await call("/api/items");
  assert.equal(
    list.data.find((i) => i.id === createdId).title,
    "Persisted edit — বাংলা",
  );
  assert.equal((await fetch(base + upload)).status, 200);
  assert.equal((await call("/api/session")).data.authenticated, true);
});
test("deletion removes entries and logout revokes session", async () => {
  assert.equal(
    (await call("/api/admin/items/" + createdId, "DELETE", {})).status,
    200,
  );
  assert.ok(!(await call("/api/items")).data.some((i) => i.id === createdId));
  assert.equal((await call("/api/logout", "POST", {})).status, 200);
  assert.equal((await call("/api/admin/items")).status, 401);
});

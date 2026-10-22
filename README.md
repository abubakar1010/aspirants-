# Aspirants

A Bengali-first library for university students and BCS aspirants. Built with Node.js 24, SQLite, and a responsive, accessible browser interface. The production application has no third-party runtime dependencies.

## Start locally

```sh
cd /workspace/aspirants-
npm ci --cache /tmp/aspirants-npm
npm start
```

The server listens on port **3000**. `npm run dev` restarts the server when files change. All commands run from the repository root. Use the existing checkout; a separate worktree is unnecessary.

On the first start, the application creates `data/aspirants.sqlite`, imports the collection once, and creates `data/uploads/`. Subsequent starts retain all edits; they do not reimport or overwrite the library. No external API, image provider, database service, or API key is required.

## Configure administrator access

In a private server terminal, run:

```sh
npm run admin
```

Enter and confirm a password of at least 12 characters. Interactive input is hidden. Then open **Manage library** (`/admin`) and sign in. There is no default password or public registration. Running this command again rotates the password and revokes existing sessions. A deployment can optionally provide `ADMIN_PASSWORD` through its secret manager for first initialization only. Do not commit passwords or place them in command-line arguments. Once configured, changing this environment variable does not rotate the stored password; use `npm run admin`.

Administration supports creating/editing entries, drafts, private previews, publishing, archiving, permanent deletion, reusable creators/taxonomy, image uploads with alt text, and JSON/CSV imports and exports. Mutating API routes require an authenticated session. Passwords are scrypt-hashed; session tokens are hashed at rest. Sessions expire after 24 hours. Cookies use HttpOnly and SameSite=Strict. Login attempts are rate-limited per connection address.

## Browse and curate

- Browse `/library`, combine categories and filters, select grid/list view, and sort or paginate. Search, filters, sorting, and pagination are encoded in the URL.
- Selections within one filter are combined with **OR**; different filters use **AND**. Main categories also allow multiple selections. Subcategory choices follow selected main categories.
- Search matches titles, creators, summaries, details, genres, tags, and original source labels in Bengali and English. Unicode is normalized; transliteration is not implemented.
- Bookmarks at `/saved` persist in the visitor's own browser, without an account. They do not sync between devices. Use the header bookmark icon on mobile.
- Each entry has a shareable `/content/<id>` page with metadata, related discoveries, and collection links.
- Unknown bibliographic details remain blank. Editors can add verified publisher, pages, runtime, seasons, or reference links using the metadata JSON field.
- Multiple field values in the editor use a `|` separator. Subcategories have a main category parent; use the taxonomy manager to create and rename terms. Renaming propagates to all entries. A term cannot be deleted while in use.
- To build a film collection, first save its individual entries. Create a `Collection` entry and paste member IDs from their detail URLs into **Collection member IDs**. The server maintains parent/member links. Nested collections are not supported. Detach members before deleting a collection.
- Upload only images you are authorized to use. Accepted formats: PNG, JPEG, GIF, WebP; maximum 5 MB. SVG uploads are not accepted. Uploaded images require accessible descriptions. Original typographic covers are provided for every seeded entry; no publisher artwork has been copied.

## Import and export

Use the admin JSON/CSV export as a template. JSON is an array of entry objects. CSV uses a header row, quoted cells for commas/newlines, and `|` separators for list fields (`creators`, `categories`, `subcategories`, `genres`, `tags`, `children`). `metadata` contains a JSON object. Required fields: `title`, `categories`; type defaults to `book`, status defaults to `draft`.

The import dialog validates all records and previews new and duplicate counts before import. No rows are saved if validation fails. Duplicate title/type/creator combinations are skipped; existing entries are not overwritten. Collection references from exported IDs are remapped to new IDs. Maximum 2,000 records / 7 MB per browser import. CSV/JSON exports contain metadata and image paths, **not image files, passwords, or sessions**. Use a filesystem backup for a complete migration, including images.

## Storage, backups, and deployment

| Variable         | Default             | Purpose                                   |
| ---------------- | ------------------- | ----------------------------------------- |
| `PORT`           | `3000`              | HTTP listening port                       |
| `HOST`           | `0.0.0.0`           | Listening interface                       |
| `DATA_DIR`       | `./data`            | Persistent SQLite database and uploads    |
| `COOKIE_SECURE`  | unset               | Set to `true` behind production HTTPS     |
| `ADMIN_PASSWORD` | unset               | Optional first-run administrator password |
| `CHROMIUM_PATH`  | `/usr/bin/chromium` | Executable used by browser tests          |

The entire `DATA_DIR` must be mounted on durable storage across releases. Do not deploy it on an ephemeral serverless filesystem. This application is intended for a single Node instance with a local persistent disk; multiple replicas require a different database/storage architecture. Serve it through an HTTPS reverse proxy that preserves the public Host and Origin. Set `COOKIE_SECURE=true` in production.

A Dockerfile and Compose configuration provide a named data volume:

```sh
docker compose up --build -d
docker compose exec aspirants npm run admin
```

Configure TLS through your hosting platform or reverse proxy. `docker compose down` retains the named volume; `docker compose down -v` deletes the collection and images. The Docker configuration is supplied as a deployment option; the application was validated using Node directly in this environment, not by publishing a deployment.

For a consistent SQLite backup plus uploaded images:

```sh
npm run backup -- /absolute/path/to/backup-directory
```

The destination must not already exist. Store backups outside the public web directory and treat them as private: the database includes password hashes and session hashes. To restore, stop the server, replace `DATA_DIR` with the backup directory contents, remove stale `-wal`/`-shm` files if present, and restart. The backup includes a standalone consistent database, uploads, and a manifest. Keep the original data until restoration is verified.

## Validation

```sh
npm run check
npm test
npm run test:browser
```

`npm test` runs isolated HTTP integration tests against temporary databases. It checks all 179 source recommendations plus 14 collection members, authorization, CSRF origin checks, CRUD, draft isolation, image storage, taxonomy updates, atomic imports, CSV/JSON export, collection reference remapping, restart persistence, deletion, and logout.

Browser tests use the system Chromium executable and temporary data. They exercise Bengali search, combined filters, URL restoration, pagination, bookmarks, detail pages, mobile layouts/drawers, accessibility, and actual admin draft/edit/publish forms. If Chromium is elsewhere, set `CHROMIUM_PATH`. Tests never modify the live library or require a production admin password.

## Source and editorial policy

The initial **179 recommendations** come from the supplied Bengali text, preserved verbatim in `seed/source.txt`. Attribution: **আবদুল্লাহ আল নোমান অন্তর**, ৪৫তম বিসিএস (শুল্ক ও আবগারি) সুপারিশপ্রাপ্ত. The introductory essay and closing note appear on `/about`; the full source is available from `/api/essay`.

The five grouped film recommendations are retained as collection records and expanded into **14 individual films**, producing **193 seeded records**. Expansion is marked in member metadata. Source-provided movie years and creator spellings are preserved. Additional broad genres, thematic tags, and short editorial summaries are maintained in `seed/editorial.json`; these are editorial classifications, not source quotations. Supplemental metadata such as directors, runtimes, publishers, and page counts has not been invented. Many entries intentionally have only a short source-context description until an editor adds an overview.

Two entries are flagged for review: **A Pale Blue Dot** (listed as a poem by the source) and **Panchayet** (source spelling retained). All cover illustrations and hero art are original to this application. Self-hosted Noto Bengali fonts are licensed under the SIL Open Font License; see `public/fonts/LICENSE.txt`.

`scripts/seed.py` rebuilds the committed seed JSON from the original text and editorial supplement. It is only for seed maintenance; restarting the application never resets existing data.

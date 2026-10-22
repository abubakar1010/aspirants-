import { backup } from "node:sqlite";
import { mkdirSync, existsSync, cpSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { db, dataDir } from "../db.js";
const destination = process.argv[2];
if (!destination) {
  console.error("Usage: npm run backup -- /absolute/backup/path");
  process.exit(1);
}
const target = resolve(destination);
if (
  target === dataDir ||
  target.startsWith(dataDir + "/") ||
  target.includes("/public/") ||
  existsSync(target)
) {
  console.error(
    "Use a new backup directory outside DATA_DIR and the public web directory.",
  );
  process.exit(1);
}
try {
  mkdirSync(target, { recursive: true, mode: 0o700 });
  await backup(db, join(target, "aspirants.sqlite"));
  cpSync(join(dataDir, "uploads"), join(target, "uploads"), {
    recursive: true,
  });
  writeFileSync(
    join(target, "backup-manifest.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        format: 1,
        includes: ["aspirants.sqlite", "uploads"],
      },
      null,
      2,
    ),
  );
  console.log("Backup created at " + target);
} catch (e) {
  console.error("Backup failed: " + e.message);
  process.exitCode = 1;
} finally {
  db.close();
}

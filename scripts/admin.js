import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { setPassword, db } from "../db.js";
const silent = new Writable({
  write(chunk, encoding, done) {
    done();
  },
});
console.log("Set an administrator password (at least 12 characters).");
try {
  let password, confirm;
  if (process.stdin.isTTY) {
    const rl = createInterface({
      input: process.stdin,
      output: silent,
      terminal: true,
    });
    try {
      process.stdout.write("New password (hidden): ");
      password = await rl.question("");
      process.stdout.write("\nConfirm password (hidden): ");
      confirm = await rl.question("");
      process.stdout.write("\n");
    } finally {
      rl.close();
    }
  } else {
    let input = "";
    for await (const part of process.stdin) input += part.toString();
    [password, confirm] = input.split(/\r?\n/);
  }
  if (!password || password !== confirm) throw Error("Passwords do not match.");
  setPassword(password);
  console.log("Administrator configured. Existing sessions have been revoked.");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  db.close();
}

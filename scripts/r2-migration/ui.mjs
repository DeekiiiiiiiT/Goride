/** Tiny console helpers shared by the M4/M5 scripts (no dependencies). */
import { shortenLink } from "./references.mjs";

/** One-line display of a stored address, with the signature/token part cut short. */
export function shortenLine(text, max = 120) {
  return shortenLink(String(text ?? ""), max);
}

export function fmtBytes(bytes) {
  const n = Number(bytes ?? 0);
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[i]}`;
}

export function section(title) {
  console.log(`\n${title}`);
  console.log("-".repeat(Math.min(78, title.length + 8)));
}

export function padRight(value, width) {
  const s = String(value ?? "");
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split("=", 2);
    if (inline !== undefined) {
      out[name] = inline;
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[name] = next;
      i += 1;
    } else {
      out[name] = true;
    }
  }
  return out;
}

/** Exit 2 for a missing-secret stop: the run did nothing. */
export function stopForMissingSecrets(error) {
  console.error(`\nSTOP: ${error.message}`);
  console.error("Nothing was read or written. Add the missing names to .env.local, then re-run.");
  process.exitCode = 2;
}

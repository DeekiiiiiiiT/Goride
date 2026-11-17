/**
 * deno test --no-check --allow-env --allow-read vehicle_document_read.test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { DOCUMENT_FIELD_WHITELIST } from "../_shared/vehiclePictures/documentFields.ts";
import {
  type DocumentReadDeps,
  MAX_CERTIFICATE_BYTES,
  processReaderRaw,
  readVehicleCertificate,
} from "./vehicle_document_read.ts";
import { ProviderBlockedError } from "./api_usage_logger.ts";

const USER = "user-1";
const ORG = "org-1";

function jpegHead(): Uint8Array {
  const bytes = new Uint8Array(100);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return bytes;
}

function makeDeps(overrides: Partial<DocumentReadDeps> & {
  reader?: (() => Promise<Record<string, unknown>>) | Record<string, unknown>;
  userReads?: number;
  orgReadsToday?: number;
}): DocumentReadDeps {
  let userCount = overrides.userReads ?? 0;
  const orgDay = new Map<string, number>();
  orgDay.set(`${ORG}:2026-11-16`, overrides.orgReadsToday ?? 0);

  const readerFn =
    typeof overrides.reader === "function"
      ? overrides.reader
      : async () => (overrides.reader ?? {}) as Record<string, unknown>;

  return {
    now: overrides.now ?? (() => new Date("2026-11-16T18:00:00Z")),
    loadSettings: overrides.loadSettings ?? (async () => ({})),
    assertUserRateLimit: overrides.assertUserRateLimit ?? (async (uid) => {
      if (userCount >= 20) {
        return {
          ok: false,
          httpStatus: 429,
          code: "READ_LIMIT_USER",
          error: "limit",
        };
      }
      return null;
    }),
    assertOrgRateLimit: overrides.assertOrgRateLimit ?? (async (orgId, now) => {
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Jamaica",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      const key = `${orgId}:${day}`;
      const n = orgDay.get(key) ?? 0;
      if (n >= 200) {
        return {
          ok: false,
          httpStatus: 429,
          code: "READ_LIMIT_ORG",
          error: "limit",
        };
      }
      return null;
    }),
    recordRead: overrides.recordRead ?? (async (_u, _o, now) => {
      userCount += 1;
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Jamaica",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      const key = `${ORG}:${day}`;
      orgDay.set(key, (orgDay.get(key) ?? 0) + 1);
    }),
    callReader: overrides.callReader ?? (async () => readerFn()),
  };
}

Deno.test("T13: 9 MB refused before reader", async () => {
  let called = false;
  const deps = makeDeps({
    callReader: async () => {
      called = true;
      return {};
    },
  });
  const big = new Uint8Array(MAX_CERTIFICATE_BYTES + 1);
  big[0] = 0xff;
  big[1] = 0xd8;
  big[2] = 0xff;
  const r = await readVehicleCertificate(deps, {
    docType: "fitness",
    fileBytes: big,
    userId: USER,
    orgId: ORG,
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.code, "FILE_TOO_LARGE");
  assertEquals(called, false);
});

Deno.test("T13: exe renamed jpg and PDF → 415", async () => {
  let called = false;
  const deps = makeDeps({
    callReader: async () => {
      called = true;
      return {};
    },
  });
  const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0]);

  const r1 = await readVehicleCertificate(deps, {
    docType: "fitness",
    fileBytes: exe,
    userId: USER,
    orgId: ORG,
  });
  assertEquals(r1.ok, false);
  if (!r1.ok) assertEquals(r1.code, "FILE_TYPE_NOT_ALLOWED");

  const r2 = await readVehicleCertificate(deps, {
    docType: "registration",
    fileBytes: pdf,
    userId: USER,
    orgId: ORG,
  });
  assertEquals(r2.ok, false);
  if (!r2.ok) assertEquals(r2.code, "FILE_TYPE_NOT_ALLOWED");
  assertEquals(called, false);
});

Deno.test("T13: ProviderBlockedError → READ_PAUSED 503", async () => {
  const deps = makeDeps({
    callReader: async () => {
      throw new ProviderBlockedError("openai", "killswitch", "paused");
    },
  });
  const r = await readVehicleCertificate(deps, {
    docType: "fitness",
    fileBytes: jpegHead(),
    userId: USER,
    orgId: ORG,
  });
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals(r.code, "READ_PAUSED");
    assertEquals(r.httpStatus, 503);
  }
});

Deno.test("T13: 21st read in an hour → READ_LIMIT_USER", async () => {
  const deps = makeDeps({ userReads: 20 });
  const r = await readVehicleCertificate(deps, {
    docType: "fitness",
    fileBytes: jpegHead(),
    userId: USER,
    orgId: ORG,
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.code, "READ_LIMIT_USER");
});

Deno.test("T13: date normalization shapes", () => {
  const fit = processReaderRaw("fitness", {
    expiryDate: "2028 / 08 / 24",
    issueDate: "2026 / 01 / 01",
    year: 2028,
  });
  assertEquals(fit.fields.expiryDate, "2028-08-24");

  const reg = processReaderRaw("registration", {
    expiryDate: "2027/Sep",
    issueDate: "2026-10-01",
    year: 2026,
  });
  assertEquals(reg.fields.expiryDate, "2027-09-30");
  assertEquals(reg.fields.issueDate, "2026-10-01");

  const bad = processReaderRaw("registration", {
    issueDate: "2026-10-01",
    expiryDate: "2026/Sep",
    year: 2026,
  });
  assertEquals(bad.fields.expiryDate, null);
  assert(bad.flags.includes("expiryDate"));
});

Deno.test("T27: reader PII stripped from reply", async () => {
  const deps = makeDeps({
    reader: {
      plate: "5179KZ",
      ownerName: "Secret Person",
      ownerAddress: "1 Main St",
      trn: "123456789",
      make: "Toyota",
    },
  });
  const r = await readVehicleCertificate(deps, {
    docType: "registration",
    fileBytes: jpegHead(),
    userId: USER,
    orgId: ORG,
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    const keys = Object.keys(r.fields).sort();
    for (const k of ["ownerName", "ownerAddress", "trn"]) {
      assertEquals((r.fields as Record<string, unknown>)[k], undefined);
    }
    for (const k of keys) {
      assert((DOCUMENT_FIELD_WHITELIST as readonly string[]).includes(k));
    }
  }
});

Deno.test("T14: parse does not log field values or file bytes", async () => {
  const logged: string[] = [];
  const orig = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };
  for (const level of Object.keys(orig) as (keyof typeof orig)[]) {
    console[level] = (...args: unknown[]) => {
      logged.push(args.map((a) => String(a)).join(" "));
    };
  }
  try {
    const secretPlate = "5179KZ-SECRET"; // gitleaks:allow (fake test plate)
    const deps = makeDeps({
      reader: { plate: secretPlate, colorAsWritten: "WHITE", make: "Honda" },
    });
    const bytes = jpegHead();
    await readVehicleCertificate(deps, {
      docType: "fitness",
      fileBytes: bytes,
      userId: USER,
      orgId: ORG,
    });
    const joined = logged.join("\n");
    assert(!joined.includes(secretPlate));
    assert(!joined.includes("WHITE"));
    assert(!joined.includes("base64"));
  } finally {
    Object.assign(console, orig);
  }
});
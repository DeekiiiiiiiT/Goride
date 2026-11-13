/** Map PostgREST / toll_v2_command refusals to HTTP responses. */

export type TollCommandErrorBody = {
  code: string;
  current_state: Record<string, unknown>;
};

export type TollCommandErrorResult = {
  status: number;
  body: TollCommandErrorBody;
};

const STATUS_409 = new Set([
  "VERSION_CHANGED",
  "WEEK_SEALED",
  "WEEK_NOT_SEALED",
  "PENDING_NOT_RESOLVED",
  "DRIVERS_ALREADY_PAID",
  "WEEK_NOT_ENDED",
  "REOPEN_INSTEAD",
  "COMMAND_ID_REUSED",
  "TOLLS_V2_OFF",
  // P2-R4a decisions
  "WRONG_STATE",
  "AFTER_SEAL",
  "AMOUNT_TOO_LARGE",
  "ALLOCATIONS_EXCEED_AMOUNT",
  "PARTIAL_TAKE_BACK",
]);

const STATUS_404 = new Set(["NOT_FOUND"]);
const STATUS_403 = new Set(["FORBIDDEN"]);
const STATUS_401 = new Set(["NO_COMPANY"]);
const STATUS_400 = new Set(["BAD_REQUEST", "COMPANY_NOT_ACCEPTED", "UNKNOWN_INTENT"]);
const STATUS_501 = new Set(["INTENT_NOT_BUILT"]);

function parsePostgrestErr(err: unknown): {
  code: string;
  details: string;
  message: string;
  rawMessage: string;
} {
  if (!err || typeof err !== "object") {
    return { code: "", details: "", message: "", rawMessage: String(err ?? "") };
  }
  const o = err as { code?: string; details?: string; message?: string };
  return {
    code: String(o.code ?? ""),
    details: String(o.details ?? ""),
    message: String(o.message ?? ""),
    rawMessage: String(o.message ?? o.details ?? err),
  };
}

function parseCurrentState(details: string): Record<string, unknown> {
  const t = details.trim();
  if (!t) return {};
  try {
    const parsed = JSON.parse(t) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* invalid JSON */
  }
  return {};
}

function statusForCode(businessCode: string): number {
  if (STATUS_409.has(businessCode)) return 409;
  if (STATUS_404.has(businessCode)) return 404;
  if (STATUS_403.has(businessCode)) return 403;
  if (STATUS_401.has(businessCode)) return 401;
  if (STATUS_400.has(businessCode)) return 400;
  if (STATUS_501.has(businessCode)) return 501;
  return 500;
}

/**
 * Postgres refusals return as PostgREST `{ code: "P0001", message: <code>, details: <json> }`.
 * Other errors become a generic 500 without leaking SQL text.
 */
export function mapTollCommandError(err: unknown): TollCommandErrorResult {
  const { code, details, message, rawMessage } = parsePostgrestErr(err);

  if (code === "P0001" && message) {
    const status = statusForCode(message);
    if (status === 500) {
      return {
        status: 500,
        body: { code: "INTERNAL_ERROR", current_state: parseCurrentState(details) },
      };
    }
    return {
      status,
      body: { code: message, current_state: parseCurrentState(details) },
    };
  }

  const generic =
    "An unexpected error occurred while running the toll command.";
  if (
    rawMessage.toLowerCase().includes("select") ||
    rawMessage.toLowerCase().includes("insert") ||
    rawMessage.toLowerCase().includes("violates")
  ) {
    return {
      status: 500,
      body: { code: "INTERNAL_ERROR", current_state: {} },
    };
  }

  return {
    status: 500,
    body: { code: "INTERNAL_ERROR", current_state: {} },
  };
}

/** Non-RPC guard when tolls v2 is off for the company. */
export function tollsV2OffResponse(): TollCommandErrorResult {
  return {
    status: 409,
    body: { code: "TOLLS_V2_OFF", current_state: {} },
  };
}

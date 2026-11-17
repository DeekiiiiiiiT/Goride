const URL_RE = /https?:\/\/[^\s]+/gi;
const KEYLIKE_RE = /(key=|Bearer\s)[^\s]*/gi;
const LONG_TOKEN_RE = /\b[A-Za-z0-9_\-]{20,}\b/g;

/** §13: trim and redact sensitive fragments before storing on vehicle_picture.last_error. */
export function cleanLastError(msg: string): string {
  let s = msg.slice(0, 300);
  s = s.replace(URL_RE, "[hidden]").replace(KEYLIKE_RE, "[hidden]").replace(LONG_TOKEN_RE, "[hidden]");
  return s;
}
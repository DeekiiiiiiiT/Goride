/**
 * The Gemini text model every server feature uses (owner 20 Nov 2026: Google retired gemini-2.5-flash for new users —
 * "Please update your code to use models/gemini-3.8-flash"). Change it here when Google retires this one; the
 * vehicle document reader already ran on it (vehicle_document_read.ts DEFAULT_READER_MODEL).
 */
export const GEMINI_TEXT_MODEL = "gemini-3.8-flash";

import { DOCUMENT_FIELD_WHITELIST } from "./documentFields.ts";

const KEYS = DOCUMENT_FIELD_WHITELIST.join(", ");

/** §3.5 "The reader prompt says" (Rev 7). */
export function buildCertificateReaderPrompt(docType: "fitness" | "registration"): string {
  const docLabel =
    docType === "fitness"
      ? "Certificate of Fitness (Form A1, Island Traffic Authority)"
      : "Motor Vehicle Registration Certificate (Form S3)";

  return `You are reading a Jamaican ${docLabel}.

Read each date using the labels printed on the document:
- On a fitness certificate, dates are printed as year / month / day (YYYY MM DD) under their labels.
- On a registration certificate, the issue date is printed as year-month-day (YYYY-MM-DD).
- On a registration certificate, the expiry is printed as year and month only (e.g. 2027/Sep); return that expiry as raw printed text in expiryDate (the server will store it as the last day of that month).

For every date field, return the raw printed date text exactly as shown on the document in issueDate or expiryDate. Do not guess day/month order from digits alone.

The year field is the "YEAR" box on the document.

Read the colour from both documents into colorAsWritten.

Return ONLY a JSON object with these keys and no others: ${KEYS}.

Never return the owner's name, address, TRN, fee paid, receipt numbers, transaction numbers, odometer, unladen/laden weight, or any key not in the list above.`;
}
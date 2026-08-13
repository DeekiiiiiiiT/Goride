/**
 * Map legacy KV PostgREST paths (value->>field) onto fleet.* columns.
 * Unmapped JSON paths become payload_json paths — never silently dropped.
 */

const COLUMN_ALIASES: Record<string, string> = {
  organizationId: "organization_id",
  organization_id: "organization_id",
  "value->>organizationId": "organization_id",
  driverId: "driver_id",
  driver_id: "driver_id",
  "value->>driverId": "driver_id",
  vehicleId: "vehicle_id",
  vehicle_id: "vehicle_id",
  "value->>vehicleId": "vehicle_id",
  batchId: "batch_id",
  batch_id: "batch_id",
  "value->>batchId": "batch_id",
  tripId: "trip_id",
  trip_id: "trip_id",
  "value->>tripId": "trip_id",
  date: "date",
  "value->>date": "date",
  status: "status",
  "value->>status": "status",
  platform: "platform",
  "value->>platform": "platform",
  type: "type",
  "value->>type": "type",
  category: "category",
  "value->>category": "category",
  uploadDate: "upload_date",
  "value->>uploadDate": "upload_date",
  cardId: "card_id",
  "value->>cardId": "card_id",
  tollTagId: "toll_tag_id",
  "value->>tollTagId": "toll_tag_id",
  plazaId: "plaza_id",
  "value->>plazaId": "plaza_id",
  idempotencyKey: "idempotency_key",
  "value->>idempotencyKey": "idempotency_key",
  reportingAt: "reporting_at",
  "value->>reportingAt": "reporting_at",
  incurredDate: "incurred_date",
  "value->>incurredDate": "incurred_date",
  paymentDate: "payment_date",
  "value->>paymentDate": "payment_date",
  readingDate: "reading_date",
  reading_date: "reading_date",
  "value->>readingDate": "reading_date",
  "value->>reading_date": "reading_date",
  recordedAt: "recorded_at",
  recorded_at: "recorded_at",
  "value->>recordedAt": "recorded_at",
  referenceId: "reference_id",
  reference_id: "reference_id",
  "value->>referenceId": "reference_id",
  referenceType: "reference_type",
  isHard: "is_hard",
  isVerified: "is_verified",
  isVoided: "is_voided",
  isAnomaly: "is_anomaly",
  documentId: "document_id",
  "value->>documentId": "document_id",
  vendorId: "vendor_id",
  "value->>vendorId": "vendor_id",
  licensePlate: "license_plate",
  "value->>licensePlate": "license_plate",
  legacy_kv_id: "legacy_kv_id",
  key: "legacy_kv_id",
  transactionId: "transaction_id",
  transaction_id: "transaction_id",
  "value->>transactionId": "transaction_id",
};

/** `value->>foo` / `value->meta->>bar` → payload_json JSON path. */
function jsonPayloadPath(col: string): string | null {
  const top = col.match(/^value->>([A-Za-z0-9_]+)$/);
  if (top) return `payload_json->>${top[1]}`;
  const nested = col.match(/^value((?:->[A-Za-z0-9_]+)+)(->>[A-Za-z0-9_]+)$/);
  if (nested) return `payload_json${nested[1]}${nested[2]}`;
  return null;
}

export function resolveFleetColumn(col: string): string | null {
  if (COLUMN_ALIASES[col]) return COLUMN_ALIASES[col];
  if (/^[a-z][a-z0-9_]*$/.test(col)) return col;
  return jsonPayloadPath(col);
}

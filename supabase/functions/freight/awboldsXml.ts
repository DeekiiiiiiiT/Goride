/** Minimal AWBOLDS-style XML export for Jamaica degroupage / breakdown manifests. */

export type AwboldsPackageLine = {
  lineNumber: number;
  hawb: string;
  suiteCode: string;
  consigneeName: string;
  trn: string;
  description: string;
  weightKg: number;
  declaredValueUsd: number;
  invoiceFileName?: string | null;
};

export type AwboldsManifestInput = {
  mawb: string;
  carrierName: string;
  shipmentType: "air" | "sea";
  originCode?: string | null;
  destinationCode?: string | null;
  estimatedArrival?: string | null;
  packages: AwboldsPackageLine[];
};

function esc(v: string | number | null | undefined): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildAwboldsXml(input: AwboldsManifestInput): string {
  const lines = input.packages
    .map(
      (p) => `    <HouseBill>
      <LineNumber>${p.lineNumber}</LineNumber>
      <HAWB>${esc(p.hawb)}</HAWB>
      <MailboxID>${esc(p.suiteCode)}</MailboxID>
      <ConsigneeName>${esc(p.consigneeName)}</ConsigneeName>
      <TRN>${esc(p.trn)}</TRN>
      <Description>${esc(p.description)}</Description>
      <WeightKg>${esc(p.weightKg.toFixed(3))}</WeightKg>
      <DeclaredValueUSD>${esc(p.declaredValueUsd.toFixed(2))}</DeclaredValueUSD>
      <InvoiceFile>${esc(p.invoiceFileName || "")}</InvoiceFile>
    </HouseBill>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<AWBOLDS version="1.0">
  <MasterBill>
    <MAWB>${esc(input.mawb)}</MAWB>
    <CarrierName>${esc(input.carrierName)}</CarrierName>
    <ShipmentType>${esc(input.shipmentType.toUpperCase())}</ShipmentType>
    <Origin>${esc(input.originCode || "")}</Origin>
    <Destination>${esc(input.destinationCode || "JM")}</Destination>
    <EstimatedArrival>${esc(input.estimatedArrival || "")}</EstimatedArrival>
    <PackageCount>${input.packages.length}</PackageCount>
  </MasterBill>
  <HouseBills>
${lines}
  </HouseBills>
</AWBOLDS>
`;
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

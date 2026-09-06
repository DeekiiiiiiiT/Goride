import { describe, expect, it } from "vitest";
import {
  buildBankFile,
  buildRemittanceAdvice,
  remittanceAdvicePlainText,
  requiresApproval,
} from "./settlementEnterprise";

describe("settlementEnterprise (Phase 6)", () => {
  it("builds remittance advice with net", () => {
    const a = buildRemittanceAdvice({
      driverId: "d1",
      driverName: "Kenny",
      organizationName: "GoRide",
      lines: [
        { periodAnchor: "2026-08-31", periodEnd: "2026-09-06", description: "Payout", amountMinor: 150000 },
        { periodAnchor: "2026-08-31", periodEnd: "2026-09-06", description: "Toll wash", amountMinor: -5000 },
      ],
    });
    expect(a.netMinor).toBe(145000);
    expect(remittanceAdvicePlainText(a)).toContain("Kenny");
    expect(remittanceAdvicePlainText(a)).toContain("1450.00");
  });

  it("builds bank file rows", () => {
    const file = buildBankFile([
      {
        accountNumber: "123",
        accountName: "Kenny G",
        amountMinor: 10000,
        currency: "JMD",
        reference: "PAY-1",
        valueDate: "2026-09-05",
      },
    ]);
    expect(file.split("\n")).toHaveLength(2);
    expect(file).toContain("100.00");
  });

  it("approval threshold", () => {
    expect(requiresApproval(50000, 10000)).toBe(true);
    expect(requiresApproval(50, 10000)).toBe(false);
    expect(requiresApproval(50000, 0)).toBe(false);
  });
});

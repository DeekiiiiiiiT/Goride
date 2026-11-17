/**
 * @vitest-environment jsdom
 *
 * Documents tab cards (Stitch F15, T19): dates + status + who checked, Update, no "View file".
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { getVehicleDocumentChecks } = vi.hoisted(() => ({ getVehicleDocumentChecks: vi.fn() }));
vi.mock("../../../services/api", () => ({ api: { getVehicleDocumentChecks } }));
vi.mock("../find-parts/everyday/EverydayShared", () => ({ MakerLogo: () => null }));

import { VehicleCertificateCards, expiryStatus, plainDate } from "./VehicleCertificateCards";

afterEach(cleanup);

describe("plainDate / expiryStatus", () => {
  it("writes dates in plain words", () => {
    expect(plainDate("2026-03-12")).toBe("12 Mar 2026");
    expect(plainDate(null)).toBe("");
  });
  it("Valid, Expires soon with days left, Expired", () => {
    const today = new Date(Date.UTC(2026, 10, 16));
    expect(expiryStatus("2027-09-30", today)).toEqual({ tone: "green", label: "Valid" });
    expect(expiryStatus("2026-12-09", today)).toEqual({ tone: "amber", label: "Expires soon · 23 days" });
    expect(expiryStatus("2026-11-01", today).label).toBe("Expired");
  });
});

describe("VehicleCertificateCards", () => {
  it("shows both cards with who checked, Update opens the right document, and no View file", async () => {
    getVehicleDocumentChecks.mockResolvedValueOnce([
      { docType: "fitness", issueDate: "2025-08-25", expiryDate: "2028-08-24", readAt: "2026-11-16T10:00:00Z", readByName: "Deeki T" },
    ]);
    const onUpdate = vi.fn();
    const vehicle = {
      id: "5179KZ",
      registrationIssueDate: "2026-10-01",
      registrationExpiry: "2027-09-30",
    } as never;
    render(<VehicleCertificateCards vehicle={vehicle} onUpdate={onUpdate} />);
    expect(screen.getByText("Certificate of Fitness")).toBeTruthy();
    expect(screen.getByText("Motor Vehicle Registration")).toBeTruthy();
    expect(await screen.findByText("Checked by Deeki T on 16 Nov 2026")).toBeTruthy();
    expect(screen.getByText(/Expires: 24 Aug 2028/)).toBeTruthy();
    expect(screen.getByText(/Expires: 30 Sep 2027/)).toBeTruthy();
    expect(screen.queryByText(/View file|Open the document/i)).toBeNull();
    fireEvent.click(screen.getByTestId("certificate-update-registration"));
    expect(onUpdate).toHaveBeenCalledWith("registration");
  });
});

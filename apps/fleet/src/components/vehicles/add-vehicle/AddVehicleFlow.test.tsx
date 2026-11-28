/**
 * @vitest-environment jsdom
 *
 * Add a vehicle flow (audit F1–F13): T29 colour required, plate required, chassis rule (T36 UI half),
 * read limits (F11), no storage upload on save (VP-07), cancel confirm, picture states after save.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { parseDocument, saveVehicle, uploadFile, getVehiclePicture, addOdometerReading, patchVehicleSevereDuty } = vi.hoisted(() => ({
  parseDocument: vi.fn(),
  saveVehicle: vi.fn(),
  uploadFile: vi.fn(),
  getVehiclePicture: vi.fn(),
  addOdometerReading: vi.fn(async () => ({ success: true })),
  patchVehicleSevereDuty: vi.fn(async () => ({ success: true })),
}));

vi.mock("../../../services/api", () => ({
  api: { parseDocument, saveVehicle, uploadFile, getVehiclePicture, addOdometerReading, patchVehicleSevereDuty },
}));
vi.mock("../../../utils/pdf-helper", () => ({ convertPdfToImage: vi.fn(async (f: File) => f) }));
vi.mock("../../../hooks/useCatalogCandidates", () => ({
  useCatalogCandidates: () => ({ facets: { chassis_code: [], drivetrain: [], transmission: [] }, loading: false }),
}));
vi.mock("../../../hooks/useVehicleCatalogAnchorFacets", () => ({
  useVehicleCatalogAnchorFacets: () => ({
    makes: [], models: [], years: [], loadingMakes: false, loadingModels: false, loadingYears: false,
  }),
}));
vi.mock("../CatalogVariantPicker", () => ({ CatalogVariantPicker: () => <div data-testid="picker" /> }));
vi.mock("../CatalogFacetSelect", () => ({ CatalogFacetSelect: ({ label }: { label: string }) => <div>{label}</div> }));
vi.mock("../TollClassPicker", () => ({
  TollClassPicker: () => <div>Toll class</div>,
  useTollClasses: () => ({ classes: [{ id: "class1", label: "Class 1", examples: "Cars, SUVs, Pickup trucks" }], loading: false }),
}));
vi.mock("../find-parts/everyday/EverydayShared", () => ({ MakerLogo: () => <span data-testid="logo" /> }));
vi.mock("@roam/roam-shared", () => ({
  vehiclePictureSrc: (url: string | null) => (url ? { src: url, srcSet: "" } : null),
  pictureStateLabel: (s: string) => (s === "limited" ? "Picture will be added tomorrow" : ""),
}));

import { AddVehicleFlow, inferVehicleUse, snapModelToCatalog } from "./AddVehicleFlow";

const jpg = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "fitness.jpg", { type: "image/jpeg" });

function chooseFile(file = jpg()) {
  const input = screen.getAllByLabelText("Choose file")[0] as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

const fitnessReply = (over: Record<string, unknown> = {}) => ({
  success: true,
  fileSha256: "f".repeat(64),
  colorStandard: "white",
  flags: [],
  fields: {
    make: "Toyota", model: "Roomy", year: 2019, colorAsWritten: "WHITE", bodyAsWritten: "Stn/Waggon",
    engineNumber: "1KR2423957", cc: 990, chassis: "M900A0344862", plate: "TMP4862",
    issueDate: "2025-08-25", expiryDate: "2028-08-24",
  },
  ...over,
});

const registrationReply = (over: Record<string, unknown> = {}) => ({
  success: true,
  fileSha256: "r".repeat(64),
  colorStandard: "white",
  flags: [],
  fields: {
    plate: "5179KZ", chassis: "M900A0344862", make: "Toyota", model: "Roomy", colorAsWritten: "WHITE",
    mvid: "12174877", laNumber: "2141070747", controlNumber: "1141062812",
    issueDate: "2026-10-01", expiryDate: "2027-09-30",
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("AddVehicleFlow", () => {
  it("F1 shows the privacy line and both file buttons", () => {
    render(<AddVehicleFlow onClose={vi.fn()} onVehicleAdded={vi.fn()} />);
    expect(screen.getByText("We read your certificate and keep the details — not the file.")).toBeTruthy();
    expect(screen.getAllByText("Take photo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Choose file").length).toBeGreaterThan(0);
  });

  it("T29: an unknown certificate colour blocks Next until a colour is picked", async () => {
    parseDocument.mockResolvedValueOnce(
      fitnessReply({ colorStandard: null, fields: { ...fitnessReply().fields, colorAsWritten: "MAGENTA" } }),
    );
    render(<AddVehicleFlow onClose={vi.fn()} onVehicleAdded={vi.fn()} />);
    chooseFile();
    await screen.findByText("Check the fitness details");
    expect(screen.getByText("Pick a colour")).toBeTruthy();
    const next = screen.getByTestId("fitness-next") as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("colour-chip"));
    fireEvent.click(screen.getByRole("option", { name: /Beige/ }));
    expect((screen.getByTestId("fitness-next") as HTMLButtonElement).disabled).toBe(false);
  });

  it("registration Next needs a plate; a temporary fitness plate never blocks", async () => {
    parseDocument.mockResolvedValueOnce(fitnessReply()).mockResolvedValueOnce(registrationReply({ fields: { ...registrationReply().fields, plate: "" } }));
    render(<AddVehicleFlow onClose={vi.fn()} onVehicleAdded={vi.fn()} />);
    chooseFile();
    fireEvent.click(await screen.findByTestId("fitness-next"));
    chooseFile();
    await screen.findByText("Check the registration details");
    expect((screen.getByTestId("registration-next") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("plate-input"), { target: { value: "5179kz" } });
    expect((screen.getByTestId("plate-input") as HTMLInputElement).value).toBe("5179KZ");
    expect((screen.getByTestId("registration-next") as HTMLButtonElement).disabled).toBe(false);
  });

  it("T36 UI: different chassis numbers show the notice and block Next", async () => {
    parseDocument
      .mockResolvedValueOnce(fitnessReply())
      .mockResolvedValueOnce(registrationReply({ fields: { ...registrationReply().fields, chassis: "GP5-1234567" } }));
    render(<AddVehicleFlow onClose={vi.fn()} onVehicleAdded={vi.fn()} />);
    chooseFile();
    fireEvent.click(await screen.findByTestId("fitness-next"));
    chooseFile();
    await screen.findByText("These documents are for different vehicles");
    expect((screen.getByTestId("registration-next") as HTMLButtonElement).disabled).toBe(true);
  });

  it("F11: the fleet's daily read limit shows the break screen with the daily wording", async () => {
    parseDocument.mockRejectedValueOnce(Object.assign(new Error("limit"), { code: "READ_LIMIT_ORG" }));
    render(<AddVehicleFlow onClose={vi.fn()} onVehicleAdded={vi.fn()} />);
    chooseFile();
    await screen.findByText("Let's take a short break");
    expect(screen.getByText(/Your fleet has scanned a lot of documents today/)).toBeTruthy();
  });

  it("F10: an unreadable file offers Type the details, which opens empty fields", async () => {
    parseDocument.mockRejectedValueOnce(Object.assign(new Error("bad"), { code: "FILE_TYPE_NOT_ALLOWED" }));
    render(<AddVehicleFlow onClose={vi.fn()} onVehicleAdded={vi.fn()} />);
    chooseFile();
    await screen.findByText("We couldn't read this file");
    fireEvent.click(screen.getByText("Type the details"));
    await screen.findByText("Check the fitness details");
    expect(screen.queryByText("Read by Roam")).toBeNull();
  });

  it("VP-07: saving sends document checks and never uploads a file; limited picture shows its wording", async () => {
    parseDocument.mockResolvedValueOnce(fitnessReply()).mockResolvedValueOnce(registrationReply());
    saveVehicle.mockResolvedValueOnce({ success: true, catalogStatus: "matched", picture: { status: "limited", url: null } });
    const added = vi.fn();
    render(<AddVehicleFlow onClose={vi.fn()} onVehicleAdded={added} />);
    chooseFile();
    fireEvent.click(await screen.findByTestId("fitness-next"));
    chooseFile();
    fireEvent.click(await screen.findByTestId("registration-next"));
    // Owner, 17 Nov: vehicle use is its own step, filled in from the documents (5179KZ = private, white plate).
    await screen.findByText("How you use this vehicle");
    expect(screen.getByTestId("use-usage").textContent).toContain("Private");
    expect(screen.getByTestId("use-plate").textContent).toContain("White");
    expect(screen.getAllByText("Filled by Roam").length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByTestId("use-next"));
    await screen.findByText("Is this your car?");
    // Owner, 17 Nov: fleets never pick a catalogue car; no picker, and saving is never blocked by it.
    expect(screen.queryByText("Pick a different car")).toBeNull();
    expect(screen.queryByText(/Not right\?/)).toBeNull();
    expect((screen.getByTestId("confirm-save") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("confirm-save"));
    // Maintenance step 8: the odometer is required before the car can be saved.
    await screen.findByText("Odometer and use");
    expect((screen.getByTestId("odometer-save") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("use-hard").getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByTestId("odo-km"), { target: { value: "143,220" } });
    expect((screen.getByTestId("odometer-save") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("odometer-save"));
    await screen.findByText("Vehicle added");
    expect(uploadFile).not.toHaveBeenCalled();
    const body = saveVehicle.mock.calls[0][0];
    expect(body.documentChecks).toHaveLength(2);
    expect(body.colorStandard).toBe("white");
    expect(body.id).toBe("5179KZ");
    expect(JSON.stringify(body)).not.toMatch(/CertificateUrl|"image"/);
    expect(added).toHaveBeenCalled();
    expect(screen.getByText("Picture will be added tomorrow")).toBeTruthy();
    expect(addOdometerReading).toHaveBeenCalledWith(expect.objectContaining({ vehicleId: "5179KZ", odometer: 143220, source: "manual" }));
    expect(patchVehicleSevereDuty).toHaveBeenCalledWith("5179KZ", expect.objectContaining({ severe_duty: true }));
  });

  it("a parked vehicle shows the waiting-for-check card", async () => {
    parseDocument.mockResolvedValueOnce(fitnessReply()).mockResolvedValueOnce(registrationReply());
    saveVehicle.mockResolvedValueOnce({ success: true, catalogStatus: "pending_catalog", picture: { status: "none", url: null } });
    render(<AddVehicleFlow onClose={vi.fn()} onVehicleAdded={vi.fn()} />);
    chooseFile();
    fireEvent.click(await screen.findByTestId("fitness-next"));
    chooseFile();
    fireEvent.click(await screen.findByTestId("registration-next"));
    fireEvent.click(await screen.findByTestId("use-next"));
    fireEvent.click(await screen.findByTestId("confirm-save"));
    fireEvent.change(await screen.findByTestId("odo-km"), { target: { value: "90000" } });
    fireEvent.click(screen.getByTestId("use-normal"));
    fireEvent.click(screen.getByTestId("odometer-save"));
    await waitFor(() => expect(screen.getAllByText("Waiting for Roam to check this car").length).toBeGreaterThan(0));
    expect(patchVehicleSevereDuty).toHaveBeenCalledWith("5179KZ", expect.objectContaining({ severe_duty: false }));
  });

  it("Cancel asks first; Stop closes", () => {
    const onClose = vi.fn();
    render(<AddVehicleFlow onClose={onClose} onVehicleAdded={vi.fn()} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Stop adding this vehicle?")).toBeTruthy();
    fireEvent.click(screen.getByText("Stop"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("AddVehicleFlow update mode (Documents → Update)", () => {
  it("rescans the registration and saves only its new dates with updateDocumentsOnly", async () => {
    parseDocument.mockResolvedValueOnce(registrationReply());
    saveVehicle.mockResolvedValueOnce({ success: true });
    const onClose = vi.fn();
    const vehicle = { id: "5179KZ", licensePlate: "5179KZ", registrationExpiry: "2026-12-01" } as never;
    render(<AddVehicleFlow update={{ vehicle, doc: "registration" }} onClose={onClose} onVehicleAdded={vi.fn()} />);
    expect(screen.getByText("Update the registration")).toBeTruthy();
    expect(screen.queryByText("Fitness")).toBeNull(); // no step bar
    chooseFile();
    await screen.findByText("Check the registration details");
    expect(screen.queryByText("How you use this vehicle")).toBeNull();
    fireEvent.click(screen.getByTestId("update-save"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const body = saveVehicle.mock.calls[0][0];
    expect(body.updateDocumentsOnly).toBe(true);
    expect(body.registrationExpiry).toBe("2027-09-30");
    expect(body.documentChecks).toHaveLength(1);
    expect(body.documentChecks[0].docType).toBe("registration");
  });
});

describe("snapModelToCatalog", () => {
  const toyota = ["Aqua", "C-HR", "Corolla", "Prius", "Roomy", "Vitz"];
  it("matches the catalogue's name when the document spells it another way", () => {
    expect(snapModelToCatalog("CHR HYBRID", toyota)).toBe("C-HR");
    expect(snapModelToCatalog("C-HR", toyota)).toBe("C-HR");
    expect(snapModelToCatalog("ROOMY", toyota)).toBe("Roomy");
    expect(snapModelToCatalog("PRIUS HV", toyota)).toBe("Prius");
  });
  it("leaves it alone when nothing or more than one car is the same", () => {
    expect(snapModelToCatalog("SIENTA", toyota)).toBeNull();
    expect(snapModelToCatalog("HYBRID", toyota)).toBeNull();
    expect(snapModelToCatalog("CHR", ["C-HR", "CHR"])).toBe("CHR");
    expect(snapModelToCatalog("C HR", ["C-HR", "CHR"])).toBeNull();
  });
});

describe("inferVehicleUse", () => {
  it("fills usage and plate class from the plate and body type", () => {
    expect(inferVehicleUse("5404LK", "Stn/Waggon")).toEqual({ usageCategory: "Private", plateClass: "White" });
    expect(inferVehicleUse("PP 1234", "Sedan")).toEqual({ usageCategory: "PPV", plateClass: "Red" });
    expect(inferVehicleUse("CB-1234", "Pick-up")).toEqual({ usageCategory: "Commercial", plateClass: "Green" });
    expect(inferVehicleUse("1234AB", "Motor Cycle")).toEqual({ usageCategory: "Motorcycle", plateClass: "White" });
  });
  it("leaves both empty when unsure", () => {
    expect(inferVehicleUse("", "")).toEqual({ usageCategory: "", plateClass: "" });
    expect(inferVehicleUse("TMP4862", "Stn/Waggon")).toEqual({ usageCategory: "", plateClass: "" });
  });
});

/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import {
  buildDocumentChecksPayload,
  certificateScanErrorToast,
  isAddVehicleSaveDisabled,
  isPdfFile,
  prepareCertificateFile,
} from './addVehicleCertificateFlow';

describe('prepareCertificateFile', () => {
  it('calls convertPdfToImage before parse for PDFs', async () => {
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'cert.pdf', {
      type: 'application/pdf',
    });
    const image = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'cert.jpg', {
      type: 'image/jpeg',
    });
    const convert = vi.fn().mockResolvedValue(image);
    const out = await prepareCertificateFile(pdf, convert);
    expect(convert).toHaveBeenCalledWith(pdf);
    expect(out).toBe(image);
  });

  it('passes through non-PDF files', async () => {
    const jpg = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'a.jpg', { type: 'image/jpeg' });
    const convert = vi.fn();
    const out = await prepareCertificateFile(jpg, convert);
    expect(convert).not.toHaveBeenCalled();
    expect(out).toBe(jpg);
  });
});

describe('isPdfFile', () => {
  it('detects pdf by type and extension', () => {
    expect(isPdfFile(new File([], 'x.pdf', { type: 'application/pdf' }))).toBe(true);
    expect(isPdfFile(new File([], 'x.PDF', { type: 'text/plain' }))).toBe(true);
    expect(isPdfFile(new File([], 'x.jpg', { type: 'image/jpeg' }))).toBe(false);
  });
});

describe('save payload', () => {
  it('builds documentChecks without upload URLs', () => {
    const checks = buildDocumentChecksPayload(
      { fileSha256: 'f'.repeat(64), fields: { plate: 'TMP1' } },
      { fileSha256: 'r'.repeat(64), fields: { plate: '5179KZ' } },
    );
    expect(checks).toHaveLength(2);
    expect(checks[0].docType).toBe('fitness');
    expect(checks[1].docType).toBe('registration');
    expect(JSON.stringify(checks)).not.toContain('upload');
  });
});

describe('certificateScanErrorToast', () => {
  it('maps READ_PAUSED to user message', () => {
    expect(certificateScanErrorToast('READ_PAUSED', 'fallback')).toBe(
      'Scanning is paused right now — type the details instead.',
    );
  });
});

describe('isAddVehicleSaveDisabled', () => {
  it('is disabled without a plate', () => {
    expect(
      isAddVehicleSaveDisabled({ licensePlate: '', catalogSaveBlocked: false, isLoading: false }),
    ).toBe(true);
    expect(
      isAddVehicleSaveDisabled({ licensePlate: '5179KZ', catalogSaveBlocked: false, isLoading: false }),
    ).toBe(false);
  });
});
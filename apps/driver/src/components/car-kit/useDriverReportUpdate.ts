import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOffline } from '../providers/OfflineProvider';
import { driverInventoryApi, type DriverReportRow } from '../../services/driverInventoryApi';
import { uploadEvidenceFile } from '../../services/uploadEvidence';
import { offlineBlobStore } from '../../services/offlineBlobStore';

export type ReportUpdateKind = 'found_it' | 'got_replacement' | 'still_missing';

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function useDriverReportUpdate(report: DriverReportRow, onSent?: () => void) {
  const { isOnline, addToQueue } = useOffline();
  const [kind, setKind] = useState<ReportUpdateKind>('still_missing');
  const [note, setNote] = useState('');
  const [source, setSource] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const needsPhoto = kind === 'got_replacement';
  const canSubmit = useMemo(() => {
    if (needsPhoto && !photoFile) return false;
    return true;
  }, [needsPhoto, photoFile]);

  const pickPhoto = () => fileInputRef.current?.click();

  const onPhotoSelected = (file: File | null) => {
    if (!file) return;
    setPhotoFile(file);
    setError(null);
  };

  const clearPhoto = () => {
    setPhotoFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = useCallback(async () => {
    const reportId = report.id;
    if (!reportId) {
      setError('Report is missing an id');
      return;
    }
    if (!canSubmit) {
      setError('Add a photo of the replacement item');
      return;
    }
    setSending(true);
    setError(null);
    const bodyNote =
      [note.trim(), kind === 'got_replacement' && source.trim() ? `Source: ${source.trim()}` : '']
        .filter(Boolean)
        .join(' · ') || undefined;

    try {
      if (!isOnline) {
        let photoBlobKey: string | undefined;
        if (photoFile) {
          photoBlobKey = `report-update-photo-${crypto.randomUUID()}`;
          await offlineBlobStore.put(photoBlobKey, photoFile);
        }
        addToQueue({
          type: 'SUBMIT_DRIVER_REPORT_UPDATE',
          payload: {
            reportId,
            kind,
            note: bodyNote,
            vehicleId: null,
            label: report.itemLabel ?? report.displayName ?? 'Report update',
            photoBlobKey,
            photoFileName: photoFile?.name,
            photoMimeType: photoFile?.type,
          },
        });
        setSent(true);
        onSent?.();
        return;
      }

      let photoPaths: string[] | undefined;
      if (photoFile) {
        setPhotoUploading(true);
        const uploadRes = await uploadEvidenceFile(photoFile, {
          evidenceType: 'driver_report_update',
          sourceType: 'driver_report',
          sourceId: reportId,
          retentionClass: 'ephemeral',
          parentStatus: 'Pending',
        });
        photoPaths = [uploadRes.url];
        setPhotoUploading(false);
      }

      await driverInventoryApi.submitReportUpdate(
        reportId,
        { kind, note: bodyNote, photoPaths },
        newIdempotencyKey('driver-report-update'),
      );
      setSent(true);
      onSent?.();
    } catch (e) {
      setPhotoUploading(false);
      setError(e instanceof Error ? e.message : 'Could not send update');
    } finally {
      setSending(false);
    }
  }, [addToQueue, canSubmit, isOnline, kind, note, onSent, photoFile, report, source]);

  return {
    kind,
    setKind,
    note,
    setNote,
    source,
    setSource,
    photoFile,
    photoPreview,
    photoUploading,
    fileInputRef,
    pickPhoto,
    onPhotoSelected,
    clearPhoto,
    needsPhoto,
    canSubmit,
    sending,
    error,
    sent,
    submit,
  };
}

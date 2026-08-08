/**
 * Sample of the customs broker / ASYCUDA-oriented CSV produced after a manifesto is sealed.
 * Columns must stay in sync with GET /manifests/:id/customs-export in freight/pipeline.ts.
 */

export const CUSTOMS_MANIFEST_CSV_HEADERS = [
  'line_number',
  'suite_code',
  'contact_name',
  'trn',
  'courier_tracking_number',
  'description',
  'weight_lbs',
  'length_in',
  'width_in',
  'height_in',
  'declared_value_usd',
  'invoice_file_name',
  'invoice_storage_path',
] as const;

/** Example lines — matches export column order for ops review. */
export const CUSTOMS_MANIFEST_CSV_SAMPLE = `${CUSTOMS_MANIFEST_CSV_HEADERS.join(',')}
1,BSHPD10859,Sadiki Thomas,123456789,1Z999AA10123456784,Nike shoes size 10,4.5,14,10,6,89.99,invoice-bshpd10859.pdf,invoices/org/bshpd10859.pdf
2,BSHPD10860,Keisha Brown,,9400111899562537875981,"Electronics (phone case, charger)",2.1,10,8,4,45.00,invoice-bshpd10860.pdf,invoices/org/bshpd10860.pdf
3,BSHPD10861,Andre Clarke,987654321,TBA123456789012,Household goods - bedding,12.0,20,16,12,150.00,,
`;

export function downloadCustomsManifestSampleCsv() {
  const blob = new Blob([CUSTOMS_MANIFEST_CSV_SAMPLE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'roam-customs-manifest-sample.csv';
  a.click();
  URL.revokeObjectURL(url);
}

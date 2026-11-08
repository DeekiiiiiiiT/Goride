-- Vehicle document overlay e2e — mm_f01_5179kz (four doc types, expired + soon + duplicate insurance).
DO $$
DECLARE
  v_org text := 'cccccccc-cccc-4ccc-8ccc-0000000000f1';
  v_5179 text := 'mm_f01_5179kz';
  v_docs jsonb;
  v_patch jsonb;
BEGIN
  v_docs := jsonb_build_array(
    jsonb_build_object(
      'id', 'reg-cert',
      'name', 'Vehicle Registration',
      'type', 'Registration',
      'status', 'Verified',
      'expiryDate', '2026-10-15',
      'uploadDate', '2026-01-10T12:00:00.000Z',
      'url', 'https://example.com/e2e/reg-cert.pdf',
      'metadata', jsonb_build_object(
        'plateNumber', '5179KZ',
        'laNumber', 'LA-5179-TEST',
        'mvid', 'MVID-E2E-5179',
        'controlNumber', 'CTRL-E2E-99',
        'chassisNumber', 'CHASSIS-E2E-5179',
        'issueDate', '2024-10-15'
      )
    ),
    jsonb_build_object(
      'id', 'fitness-cert',
      'name', 'Certificate of Fitness',
      'type', 'Fitness',
      'status', 'Verified',
      'expiryDate', '2026-11-17',
      'uploadDate', '2026-02-01T12:00:00.000Z',
      'metadata', jsonb_build_object(
        'make', 'Toyota',
        'model', 'Roomy',
        'year', '2018',
        'bodyType', 'Motor Car',
        'engineNumber', 'ENG-E2E-5179',
        'ccRating', '1500',
        'issueDate', '2025-11-17'
      )
    ),
    jsonb_build_object(
      'id', 'valuation-report',
      'name', 'Valuation Report',
      'type', 'Valuation',
      'status', 'Verified',
      'expiryDate', '2027-06-01',
      'uploadDate', '2026-03-15T12:00:00.000Z',
      'metadata', jsonb_build_object(
        'valuationDate', '2026-03-10',
        'marketValue', '2500000',
        'forcedSaleValue', '1800000',
        'odometer', '195432',
        'engineNumber', 'ENG-E2E-5179',
        'chassisNumber', 'CHASSIS-E2E-5179',
        'color', 'Silver'
      )
    ),
    jsonb_build_object(
      'id', 'insurance-policy',
      'name', 'Insurance Policy',
      'type', 'Insurance',
      'status', 'Verified',
      'expiryDate', '2027-12-01',
      'uploadDate', '2025-01-01T12:00:00.000Z',
      'metadata', jsonb_build_object(
        'policyNumber', 'POL-OLD-DUPLICATE',
        'idv', '2000000',
        'policyPremium', '85000',
        'excessDeductible', '5000',
        'authorizedDrivers', 'Named drivers only',
        'limitationsUse', 'Social domestic and pleasure'
      )
    ),
    jsonb_build_object(
      'id', 'insurance-policy',
      'name', 'Insurance Policy',
      'type', 'Insurance',
      'status', 'Verified',
      'expiryDate', '2027-12-01',
      'uploadDate', '2026-06-01T12:00:00.000Z',
      'url', 'https://example.com/e2e/insurance-policy.pdf',
      'metadata', jsonb_build_object(
        'policyNumber', 'POL-NEW-2026',
        'idv', '2200000',
        'policyPremium', '92000',
        'excessDeductible', '7500',
        'authorizedDrivers', 'Any licensed driver 25+',
        'limitationsUse', 'Private hire and social use within Jamaica'
      )
    )
  );

  v_patch := jsonb_build_object(
    'documents', v_docs,
    'registrationExpiry', '2026-10-15',
    'registrationIssueDate', '2024-10-15',
    'registrationCertificateUrl', 'https://example.com/e2e/reg-cert.pdf',
    'fitnessExpiry', '2026-11-17',
    'fitnessIssueDate', '2025-11-17',
    'insuranceExpiry', '2027-12-01',
    'laNumber', 'LA-5179-TEST',
    'mvid', 'MVID-E2E-5179',
    'controlNumber', 'CTRL-E2E-99',
    'vin', 'CHASSIS-E2E-5179',
    'engineNumber', 'ENG-E2E-5179',
    'ccRating', '1500',
    'bodyType', 'Motor Car',
    'color', 'Silver'
  );

  UPDATE fleet.vehicles
  SET payload_json = coalesce(payload_json, '{}'::jsonb) || v_patch
  WHERE organization_id = v_org AND id = v_5179;

  UPDATE public.kv_store_37f42386
  SET value = coalesce(value, '{}'::jsonb) || v_patch
  WHERE key = 'vehicle:' || v_5179;
END $$;

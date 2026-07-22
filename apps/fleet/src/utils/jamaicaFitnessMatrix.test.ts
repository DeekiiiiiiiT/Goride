import { describe, it, expect } from 'vitest';
import {
  annualizeFitnessFee,
  classifyFitnessTier,
  endDateFromValidity,
  getFitnessTier,
  vehicleAgeYears,
} from './jamaicaFitnessMatrix';

const asOf = new Date('2026-07-21T12:00:00.000Z');

describe('vehicleAgeYears', () => {
  it('computes age from model year', () => {
    expect(vehicleAgeYears('2024', asOf)).toBe(2);
    expect(vehicleAgeYears(2015, asOf)).toBe(11);
  });

  it('returns null for invalid years', () => {
    expect(vehicleAgeYears('', asOf)).toBeNull();
    expect(vehicleAgeYears('abc', asOf)).toBeNull();
  });
});

describe('classifyFitnessTier', () => {
  it('classifies private brand new under 250 km as 5-year', () => {
    const tier = classifyFitnessTier({
      usageCategory: 'Private',
      plateClass: 'White',
      year: 2025,
      odometerKm: 100,
      asOf,
    });
    expect(tier?.id).toBe('private_new');
    expect(tier?.fee).toBe(4500);
    expect(tier?.validityYears).toBe(5);
  });

  it('classifies private mid-age as 3-year', () => {
    const tier = classifyFitnessTier({
      usageCategory: 'Private',
      plateClass: 'White',
      year: 2020,
      odometerKm: 80000,
      asOf,
    });
    expect(tier?.id).toBe('private_mid');
    expect(tier?.validityYears).toBe(3);
  });

  it('classifies private over 10 years as annual', () => {
    const tier = classifyFitnessTier({
      usageCategory: 'Private',
      plateClass: 'White',
      year: 2014,
      asOf,
    });
    expect(tier?.id).toBe('private_old');
    expect(tier?.validityYears).toBe(1);
  });

  it('treats young private with high odometer as mid-age not brand-new', () => {
    const tier = classifyFitnessTier({
      usageCategory: 'Private',
      plateClass: 'White',
      year: 2025,
      odometerKm: 500,
      asOf,
    });
    expect(tier?.id).toBe('private_mid');
  });

  it('classifies motorcycle as annual 4500', () => {
    const tier = classifyFitnessTier({
      usageCategory: 'Motorcycle',
      plateClass: 'White',
      year: 2010,
      asOf,
    });
    expect(tier?.id).toBe('motorcycle');
    expect(tier?.fee).toBe(4500);
    expect(tier?.validityYears).toBe(1);
  });

  it('classifies commercial first registration as 3-year', () => {
    const tier = classifyFitnessTier({
      usageCategory: 'Commercial',
      plateClass: 'Green',
      year: 2026,
      firstRegistration: true,
      asOf,
    });
    expect(tier?.id).toBe('commercial_new');
    expect(tier?.validityYears).toBe(3);
  });

  it('classifies used commercial under 10 as annual', () => {
    const tier = classifyFitnessTier({
      usageCategory: 'Commercial',
      plateClass: 'Green',
      year: 2020,
      firstRegistration: false,
      asOf,
    });
    expect(tier?.id).toBe('commercial_used');
    expect(tier?.validityYears).toBe(1);
  });

  it('classifies PPV as 5400 annual', () => {
    const tier = classifyFitnessTier({
      usageCategory: 'PPV',
      plateClass: 'Red',
      year: 2018,
      asOf,
    });
    expect(tier?.id).toBe('ppv');
    expect(tier?.fee).toBe(5400);
    expect(tier?.validityYears).toBe(1);
  });

  it('classifies trailer as 5400 annual', () => {
    const tier = classifyFitnessTier({
      usageCategory: 'Trailer',
      plateClass: 'Green',
      year: 2012,
      asOf,
    });
    expect(tier).toEqual(getFitnessTier('trailer'));
  });

  it('returns null when usage/plate missing or mismatched', () => {
    expect(classifyFitnessTier({ year: 2020 })).toBeNull();
    expect(
      classifyFitnessTier({ usageCategory: 'Private', plateClass: 'Red', year: 2020, asOf }),
    ).toBeNull();
    expect(
      classifyFitnessTier({ usageCategory: 'PPV', plateClass: 'White', year: 2020, asOf }),
    ).toBeNull();
  });
});

describe('endDateFromValidity', () => {
  it('adds validity years minus one day', () => {
    expect(endDateFromValidity('2025-10-17', 1)).toBe('2026-10-16');
    expect(endDateFromValidity('2025-10-17', 3)).toBe('2028-10-16');
    expect(endDateFromValidity('2025-10-17', 5)).toBe('2030-10-16');
  });
});

describe('annualizeFitnessFee', () => {
  it('spreads multi-year fees', () => {
    expect(annualizeFitnessFee(4500, 3)).toBe(1500);
    expect(annualizeFitnessFee(4500, 5)).toBe(900);
    expect(annualizeFitnessFee(5400, 1)).toBe(5400);
  });
});

import type { HaulageFreightItem } from './types';

const MAX_WEIGHT_KG = 5000;
const MAX_DIMENSION_CM = 500;

export type ItemSpecInput = {
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  weightKg: string;
};

export type ItemSpecErrors = Partial<Record<keyof ItemSpecInput, string>>;

export function validateItemSpec(input: ItemSpecInput): ItemSpecErrors {
  const errors: ItemSpecErrors = {};
  const weight = Number(input.weightKg);

  if (!input.weightKg.trim() || Number.isNaN(weight) || weight <= 0) {
    errors.weightKg = 'weightRequired';
  } else if (weight > MAX_WEIGHT_KG) {
    errors.weightKg = 'weightTooHigh';
  }

  const dims = [input.lengthCm, input.widthCm, input.heightCm];
  const filled = dims.filter((d) => d.trim() !== '');
  if (filled.length > 0 && filled.length < 3) {
    errors.lengthCm = 'dimensionsIncomplete';
  }

  for (const [key, raw] of Object.entries({
    lengthCm: input.lengthCm,
    widthCm: input.widthCm,
    heightCm: input.heightCm,
  })) {
    if (!raw.trim()) continue;
    const value = Number(raw);
    if (Number.isNaN(value) || value <= 0) {
      errors[key as keyof ItemSpecInput] = 'dimensionInvalid';
    } else if (value > MAX_DIMENSION_CM) {
      errors[key as keyof ItemSpecInput] = 'dimensionTooHigh';
    }
  }

  return errors;
}

export function parseItemSpec(input: ItemSpecInput): Pick<
  HaulageFreightItem,
  'lengthCm' | 'widthCm' | 'heightCm' | 'weightKg'
> {
  const parseDim = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const value = Number(trimmed);
    return Number.isNaN(value) ? null : value;
  };

  return {
    lengthCm: parseDim(input.lengthCm),
    widthCm: parseDim(input.widthCm),
    heightCm: parseDim(input.heightCm),
    weightKg: Number(input.weightKg),
  };
}

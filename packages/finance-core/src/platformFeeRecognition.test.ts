import { describe, expect, it } from 'vitest';
import { recognizePlatformGrossAndFees } from './platformFeeRecognition';

describe('platform fee recognition', () => {
  it('a reversal fare reduces the week instead of adding again', () => {
    const recognized = recognizePlatformGrossAndFees([
      {
        platform: 'Uber',
        eventType: 'fare_earning',
        netAmount: 100,
        grossAmount: 100,
      },
      {
        platform: 'Uber',
        eventType: 'fare_earning',
        netAmount: 100,
        grossAmount: 100,
        metadata: { reversal: true },
      },
    ]);
    expect(recognized.totalGross).toBe(0);
  });
});

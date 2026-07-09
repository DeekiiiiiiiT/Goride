import { describe, expect, it } from 'vitest';
import {
  buildDriverAliasMap,
  driverIdsReferToSamePerson,
  driverNamesReferToSamePerson,
  getCanonicalDriverName,
  resolveCanonicalDriverIdentity,
  resolveTollDisplayDriverName,
} from '@roam/types/driverIdentity';

const kenny = {
  id: '73e5b1dc-01b4-45ee-a34a-25a3256b9841',
  name: 'Kenny Gregory Rattray',
  driverName: 'kenny Rattray',
  uberDriverId: '52ff47da-ef48-41b8-93d5-80a09b85ce5b',
};

describe('driverIdentity', () => {
  it('prefers the fullest canonical driver name', () => {
    expect(getCanonicalDriverName(kenny)).toBe('Kenny Gregory Rattray');
  });

  it('treats partial names as the same person', () => {
    expect(driverNamesReferToSamePerson('kenny Rattray', 'KENNY GREGORY RATTRAY')).toBe(true);
  });

  it('links Roam and Uber ids via alias map', () => {
    const map = buildDriverAliasMap([kenny]);
    expect(
      driverIdsReferToSamePerson(
        '73e5b1dc-01b4-45ee-a34a-25a3256b9841',
        '52ff47da-ef48-41b8-93d5-80a09b85ce5b',
        map,
      ),
    ).toBe(true);
  });

  it('resolves submit identity from fleet profile', () => {
    expect(resolveCanonicalDriverIdentity(kenny)).toEqual({
      driverId: '73e5b1dc-01b4-45ee-a34a-25a3256b9841',
      driverName: 'Kenny Gregory Rattray',
    });
  });

  it('upgrades toll display name from fleet profile', () => {
    expect(
      resolveTollDisplayDriverName(
        { driverId: kenny.id, driverName: 'kenny Rattray' },
        [kenny],
      ),
    ).toBe('Kenny Gregory Rattray');
  });
});

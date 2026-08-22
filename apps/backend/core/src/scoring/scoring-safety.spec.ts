import { EtaService, selectEtaEstimate } from '../eta/eta.service';
import { rankByMinuteCost } from './ranking-policy';

describe('scoring safety', () => {
  it('ranks minute cost deterministically with ETA and code tie-breaks', () => {
    const candidates = [{ codigo: 'B', totalMinutes: 10, etaMin: 6 }, { codigo: 'A', totalMinutes: 10, etaMin: 5 }, { codigo: 'C', totalMinutes: 8, etaMin: 9 }];
    expect(rankByMinuteCost(candidates).map(({ codigo }) => codigo)).toEqual(['C', 'A', 'B']);
    expect(rankByMinuteCost([...candidates])).toEqual(rankByMinuteCost(candidates));
  });
  it('uses fallback minutes with explicit provenance when primary ETA is unavailable', () => {
    expect(selectEtaEstimate(null, 12)).toEqual({ etaMin: 12, provenance: 'haversine_fallback' });
    expect(selectEtaEstimate(7, 12)).toEqual({ etaMin: 7, provenance: 'mapbox' });
  });
  it('returns fallback provenance from the ETA service result', async () => {
    const eta = new EtaService({ get: () => undefined } as never);
    await expect(eta.matriz({ lat: 4.6, lng: -74.1 }, [{ codigo: 'A', coord: { lat: 4.61, lng: -74.11 } }])).resolves.toMatchObject([{ provenance: 'haversine_fallback', conTrafico: false }]);
  });
});
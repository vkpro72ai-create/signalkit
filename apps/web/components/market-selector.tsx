'use client';

import { useEffect, useState } from 'react';
import { spacing, typography, radius, border } from '@signalkit/ui';
import type { MarketScope } from '@signalkit/shared';
import { apiGet, type CountryView } from '../lib/api';
import { palette } from './ui';

/**
 * Country/region picker. Adapts to the chosen market scope: a single dropdown
 * for one-country scopes, a checkbox grid for multi-market comparison, and
 * nothing for global (no country needed).
 */
export function MarketSelector({
  scope,
  country,
  onCountry,
  countries,
  onCountries,
}: {
  scope: MarketScope;
  country: string;
  onCountry: (code: string) => void;
  countries: string[];
  onCountries: (codes: string[]) => void;
}) {
  const [options, setOptions] = useState<CountryView[]>([]);

  useEffect(() => {
    apiGet<CountryView[]>('/geo/countries')
      .then(setOptions)
      .catch(() => setOptions([]));
  }, []);

  if (scope === 'global' || scope === 'current_location' || scope === 'country_of_residence') {
    return (
      <p style={{ color: palette.subtle, fontSize: typography.size.sm, margin: 0 }}>
        {scope === 'global'
          ? 'No country needed — global opportunity search.'
          : 'Market comes from your settings (consent-gated).'}
      </p>
    );
  }

  const label = (c: CountryView) => c.names['en'] ?? c.code;

  if (scope === 'multi_country') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.xs }}>
        {options.map((c) => {
          const checked = countries.includes(c.code);
          return (
            <label key={c.code} style={{ display: 'flex', gap: spacing.xs, fontSize: typography.size.sm }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) =>
                  onCountries(e.target.checked ? [...countries, c.code] : countries.filter((x) => x !== c.code))
                }
              />
              {label(c)}
            </label>
          );
        })}
        {options.length === 0 && <span style={{ color: palette.subtle }}>No countries loaded.</span>}
      </div>
    );
  }

  // manual_country / manual_region → single select.
  return (
    <select
      value={country}
      onChange={(e) => onCountry(e.target.value)}
      style={{
        padding: `${spacing.sm}px ${spacing.md}px`,
        borderRadius: radius.md,
        border: `${border.hairline}px solid ${palette.line}`,
        fontSize: typography.size.sm,
        minWidth: 220,
      }}
    >
      <option value="">Select a country…</option>
      {options.map((c) => (
        <option key={c.code} value={c.code}>
          {label(c)}
        </option>
      ))}
    </select>
  );
}

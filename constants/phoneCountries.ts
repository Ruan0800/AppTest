export type PhoneCountry = {
  name: string;
  iso2: string;
  dialCode: string;
};

/** Países mais usados no app; Brasil primeiro (padrão). */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { name: 'Brasil', iso2: 'BR', dialCode: '55' },
  { name: 'Portugal', iso2: 'PT', dialCode: '351' },
  { name: 'Argentina', iso2: 'AR', dialCode: '54' },
  { name: 'Chile', iso2: 'CL', dialCode: '56' },
  { name: 'Colômbia', iso2: 'CO', dialCode: '57' },
  { name: 'México', iso2: 'MX', dialCode: '52' },
  { name: 'Uruguai', iso2: 'UY', dialCode: '598' },
  { name: 'Paraguai', iso2: 'PY', dialCode: '595' },
  { name: 'Peru', iso2: 'PE', dialCode: '51' },
  { name: 'Bolívia', iso2: 'BO', dialCode: '591' },
  { name: 'Estados Unidos', iso2: 'US', dialCode: '1' },
  { name: 'Canadá', iso2: 'CA', dialCode: '1' },
  { name: 'Espanha', iso2: 'ES', dialCode: '34' },
  { name: 'Itália', iso2: 'IT', dialCode: '39' },
  { name: 'França', iso2: 'FR', dialCode: '33' },
  { name: 'Alemanha', iso2: 'DE', dialCode: '49' },
  { name: 'Reino Unido', iso2: 'GB', dialCode: '44' },
  { name: 'Angola', iso2: 'AO', dialCode: '244' },
  { name: 'Moçambique', iso2: 'MZ', dialCode: '258' },
  { name: 'Cabo Verde', iso2: 'CV', dialCode: '238' },
];

export const DEFAULT_PHONE_COUNTRY = PHONE_COUNTRIES[0];

export function findCountryByDialCode(dialCode: string): PhoneCountry | undefined {
  const digits = dialCode.replace(/\D/g, '');
  return PHONE_COUNTRIES.find((c) => c.dialCode === digits);
}

/** Monta DDI + número local só com dígitos. */
export function buildFullPhone(dialCode: string, localNumber: string): string {
  return `${dialCode.replace(/\D/g, '')}${localNumber.replace(/\D/g, '')}`;
}

/**
 * Máscara do número local (sem DDI).
 * Brasil: (85) 99900-6787 ou (85) 9900-6787
 */
export function formatLocalNumber(localNumber: string, dialCode = '55'): string {
  const digits = localNumber.replace(/\D/g, '');
  if (!digits) return '';

  if (dialCode === '55') {
    const d = digits.slice(0, 11);
    if (d.length <= 2) return `(${d}`;
    const ddd = d.slice(0, 2);
    const rest = d.slice(2);
    if (rest.length <= 4) return `(${ddd}) ${rest}`;
    if (d.length <= 10) {
      return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
    return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  }

  return digits.slice(0, 12);
}

/** Formata número completo para lista, ex: +55 (85) 99900-6787 */
export function formatPhoneDisplay(fullPhone: string): string {
  const digits = fullPhone.replace(/\D/g, '');
  if (!digits) return fullPhone;

  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    const local = digits.slice(2);
    return `+55 ${formatLocalNumber(local, '55')}`;
  }

  const country = PHONE_COUNTRIES.find(
    (c) => digits.startsWith(c.dialCode) && c.dialCode.length > 0
  );
  if (country) {
    const local = digits.slice(country.dialCode.length);
    const formatted = formatLocalNumber(local, country.dialCode);
    return formatted ? `+${country.dialCode} ${formatted}` : `+${country.dialCode}`;
  }

  return `+${digits}`;
}

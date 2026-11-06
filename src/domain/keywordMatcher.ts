/** Normaliza texto para comparação: minúsculas e sem acentos. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Retorna a primeira palavra-chave encontrada no transcript,
 * ou null se nenhuma casar.
 */
export function findMatchingKeyword(
  transcript: string,
  keywords: string[]
): string | null {
  const normalizedTranscript = ` ${normalizeText(transcript)} `;

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) continue;

    // Só palavra inteira — evita "perigo" dentro de "perigosamente".
    if (normalizedTranscript.includes(` ${normalizedKeyword} `)) {
      return keyword;
    }
  }

  return null;
}

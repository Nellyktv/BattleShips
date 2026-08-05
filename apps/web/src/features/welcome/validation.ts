export function graphemeLength(value: string): number {
  if ('Segmenter' in Intl) {
    const Segmenter = Intl.Segmenter;
    return [
      ...new Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
    ].length;
  }
  return Array.from(value).length;
}

export function validPlayerName(value: string): boolean {
  const trimmed = value.trim();
  const length = graphemeLength(trimmed);
  return length >= 3 && length <= 24;
}

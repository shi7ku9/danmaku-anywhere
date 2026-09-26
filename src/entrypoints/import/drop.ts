/** Picks the file to import from a drop; extra files beyond the first are counted, not imported. */
export function pickDroppedFile(data: DataTransfer | null): { file: File; extra: number } | null {
  const files = Array.from(data?.files ?? []);
  const [file] = files;
  return file ? { file, extra: files.length - 1 } : null;
}

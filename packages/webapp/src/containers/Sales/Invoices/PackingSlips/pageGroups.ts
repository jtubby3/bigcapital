/** Every original page belongs to exactly one slip, including pages to ignore later. */
export function parsePageGroups(value: string, pageCount: number): number[][] {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error('This file has no pages available to group.');
  }
  const groups = value.split('\n').map((line) => {
    const parts = line.split(',').map((part) => part.trim());
    if (parts.some((part) => !/^\d+$/.test(part))) {
      throw new Error(
        'Use one slip per line, with page numbers separated by commas.',
      );
    }
    return parts.map(Number).sort((a, b) => a - b);
  });
  const pages = groups.flat();
  if (
    pages.some((page) => page < 1 || page > pageCount) ||
    new Set(pages).size !== pages.length ||
    pages.length !== pageCount
  ) {
    throw new Error(`Assign every page from 1 to ${pageCount} exactly once.`);
  }
  return groups;
}

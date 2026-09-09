export function getAssetPath(relativePath: string): string {
  const withoutLeadingSlash = relativePath.replace(/^\/+/, '');

  return `./${withoutLeadingSlash}`;
}

/** Page asset collection and categorization. */

export interface PageAsset {
  type: 'image' | 'script' | 'stylesheet' | 'font' | 'media' | 'iframe';
  url: string;
  size?: number;
  details?: string;
}

export interface AssetSummary {
  images: PageAsset[];
  scripts: PageAsset[];
  stylesheets: PageAsset[];
  fonts: string[];
  media: PageAsset[];
  iframes: PageAsset[];
  totals: {
    images: number;
    scripts: number;
    stylesheets: number;
    fonts: number;
    media: number;
    iframes: number;
  };
}

/** Extract filename from a URL. */
export function getFilename(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const parts = path.split('/');
    const filename = parts[parts.length - 1];
    return filename || u.hostname;
  } catch {
    // Relative or malformed URL
    const parts = url.split('/');
    return parts[parts.length - 1] || url;
  }
}

/** Get the domain from a URL. */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Check if a URL is external relative to a given page URL. */
export function isExternalUrl(assetUrl: string, pageUrl: string): boolean {
  try {
    const asset = new URL(assetUrl);
    const page = new URL(pageUrl);
    return asset.hostname !== page.hostname;
  } catch {
    return false;
  }
}

/** Format a file size for display. */
export function formatAssetSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Categorize assets by external vs internal. */
export function partitionByOrigin(assets: PageAsset[], pageUrl: string): { internal: PageAsset[]; external: PageAsset[] } {
  const internal: PageAsset[] = [];
  const external: PageAsset[] = [];
  for (const a of assets) {
    if (isExternalUrl(a.url, pageUrl)) {
      external.push(a);
    } else {
      internal.push(a);
    }
  }
  return { internal, external };
}

/** Get image dimensions string from details. */
export function parseImageDimensions(details: string | undefined): string {
  return details || '';
}

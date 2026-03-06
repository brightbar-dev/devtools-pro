import { describe, it, expect } from 'vitest';
import {
  getFilename,
  getDomain,
  isExternalUrl,
  formatAssetSize,
  partitionByOrigin,
  type PageAsset,
} from '../utils/assets';

describe('getFilename', () => {
  it('extracts filename from absolute URL', () => {
    expect(getFilename('https://example.com/assets/style.css')).toBe('style.css');
  });

  it('extracts filename from URL with query params', () => {
    expect(getFilename('https://cdn.example.com/app.js?v=123')).toBe('app.js');
  });

  it('returns hostname for root path', () => {
    expect(getFilename('https://example.com/')).toBe('example.com');
  });

  it('handles relative URLs', () => {
    expect(getFilename('/assets/img.png')).toBe('img.png');
  });

  it('handles malformed URLs gracefully', () => {
    expect(getFilename('not-a-url')).toBe('not-a-url');
  });
});

describe('getDomain', () => {
  it('extracts domain from URL', () => {
    expect(getDomain('https://cdn.example.com/file.js')).toBe('cdn.example.com');
  });

  it('returns empty string for invalid URL', () => {
    expect(getDomain('not-a-url')).toBe('');
  });
});

describe('isExternalUrl', () => {
  it('detects external URLs', () => {
    expect(isExternalUrl('https://cdn.other.com/file.js', 'https://example.com/')).toBe(true);
  });

  it('detects internal URLs', () => {
    expect(isExternalUrl('https://example.com/assets/file.js', 'https://example.com/')).toBe(false);
  });

  it('handles invalid URLs gracefully', () => {
    expect(isExternalUrl('invalid', 'also-invalid')).toBe(false);
  });
});

describe('formatAssetSize', () => {
  it('formats zero bytes', () => {
    expect(formatAssetSize(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatAssetSize(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatAssetSize(2048)).toBe('2.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatAssetSize(1536 * 1024)).toBe('1.5 MB');
  });
});

describe('partitionByOrigin', () => {
  const pageUrl = 'https://example.com/page';
  const assets: PageAsset[] = [
    { type: 'script', url: 'https://example.com/app.js' },
    { type: 'script', url: 'https://cdn.other.com/lib.js' },
    { type: 'stylesheet', url: 'https://example.com/style.css' },
    { type: 'image', url: 'https://img.external.com/photo.jpg' },
  ];

  it('separates internal and external assets', () => {
    const { internal, external } = partitionByOrigin(assets, pageUrl);
    expect(internal).toHaveLength(2);
    expect(external).toHaveLength(2);
  });

  it('internal assets are from same domain', () => {
    const { internal } = partitionByOrigin(assets, pageUrl);
    expect(internal.every(a => getDomain(a.url) === 'example.com')).toBe(true);
  });
});

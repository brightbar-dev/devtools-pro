/** Accessibility analysis utilities. */

import type { ContrastAudit } from './contrast';

/** A WCAG 2.2 success criterion an issue maps to. `bestPractice` marks guidance that is not a strict failure. */
export interface WcagRef {
  id: string;
  name: string;
  level: 'A' | 'AA' | 'AAA';
  url: string;
  bestPractice?: boolean;
}

const understanding = (slug: string) => `https://www.w3.org/WAI/WCAG22/Understanding/${slug}`;

export const WCAG = {
  nonTextContent: { id: '1.1.1', name: 'Non-text Content', level: 'A', url: understanding('non-text-content') },
  infoAndRelationships: { id: '1.3.1', name: 'Info and Relationships', level: 'A', url: understanding('info-and-relationships') },
  contrastMinimum: { id: '1.4.3', name: 'Contrast (Minimum)', level: 'AA', url: understanding('contrast-minimum') },
  contrastEnhanced: { id: '1.4.6', name: 'Contrast (Enhanced)', level: 'AAA', url: understanding('contrast-enhanced') },
  bypassBlocks: { id: '2.4.1', name: 'Bypass Blocks', level: 'A', url: understanding('bypass-blocks') },
  pageTitled: { id: '2.4.2', name: 'Page Titled', level: 'A', url: understanding('page-titled') },
  focusOrder: { id: '2.4.3', name: 'Focus Order', level: 'A', url: understanding('focus-order') },
  linkPurpose: { id: '2.4.4', name: 'Link Purpose (In Context)', level: 'A', url: understanding('link-purpose-in-context') },
  languageOfPage: { id: '3.1.1', name: 'Language of Page', level: 'A', url: understanding('language-of-page') },
  nameRoleValue: { id: '4.1.2', name: 'Name, Role, Value', level: 'A', url: understanding('name-role-value') },
} satisfies Record<string, WcagRef>;

const bestPractice = (ref: WcagRef): WcagRef => ({ ...ref, bestPractice: true });

/** Element groups the content script can highlight on the page. */
export type HighlightGroup =
  | 'images-no-alt'
  | 'headings-skipped'
  | 'links-no-text'
  | 'buttons-no-text'
  | 'inputs-no-label'
  | 'tabindex-positive'
  | 'contrast-aa'
  | 'contrast-manual';

export interface A11yIssue {
  type: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  element?: string; // selector or tag description
  details?: string;
  wcag?: WcagRef;
  /** Elements behind this issue, highlightable on the page. */
  group?: HighlightGroup;
}

export interface A11yReport {
  issues: A11yIssue[];
  stats: {
    errors: number;
    warnings: number;
    info: number;
    total: number;
  };
  headingStructure: HeadingInfo[];
  landmarkCount: number;
  imageCount: number;
  imagesWithAlt: number;
  imagesWithoutAlt: number;
  ariaRolesUsed: string[];
}

export interface HeadingInfo {
  level: number;
  text: string;
  outOfOrder: boolean;
}

/** What the content script collects for the accessibility panel. Ids index its element registry. */
export interface AccessibilityData {
  imagesTotal: number;
  imagesWithoutAlt: number;
  headings: Array<{ level: number; text: string }>;
  hasMainLandmark: boolean;
  hasNavLandmark: boolean;
  hasSkipLink: boolean;
  linksWithoutText: number;
  buttonsWithoutText: number;
  formInputsWithoutLabel: number;
  tabindexPositive: number;
  ariaRolesUsed: string[];
  htmlLang: string;
  titleText: string;
  landmarkCount: number;
  groups: Partial<Record<HighlightGroup, number[]>>;
  contrast: ContrastAudit & { truncated: boolean };
}

/** Analyze heading structure for proper hierarchy. */
export function analyzeHeadings(headings: Array<{ level: number; text: string }>): HeadingInfo[] {
  let lastLevel = 0;
  return headings.map(h => {
    const outOfOrder = h.level > lastLevel + 1 && lastLevel > 0;
    lastLevel = h.level;
    return { ...h, outOfOrder };
  });
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Check for common accessibility issues from collected page data. */
export function analyzeIssues(data: {
  imagesWithoutAlt: number;
  imagesTotal: number;
  headings: HeadingInfo[];
  hasMainLandmark: boolean;
  hasNavLandmark: boolean;
  hasSkipLink: boolean;
  linksWithoutText: number;
  buttonsWithoutText: number;
  formInputsWithoutLabel: number;
  tabindexPositive: number;
  /** Text elements below WCAG AA contrast. */
  contrastIssues: number;
  /** Text elements that pass AA but not AAA. */
  contrastAAAOnly?: number;
  /** Text elements on images or gradients, which need a manual check. */
  contrastManual?: number;
  /** Text elements whose contrast was measured. */
  contrastChecked?: number;
  htmlLang: string;
  titleText: string;
}): A11yIssue[] {
  const issues: A11yIssue[] = [];

  // Images
  if (data.imagesWithoutAlt > 0) {
    issues.push({
      type: 'error',
      category: 'Images',
      message: `${data.imagesWithoutAlt} image${data.imagesWithoutAlt > 1 ? 's' : ''} missing alt text`,
      details: `${data.imagesWithoutAlt} of ${data.imagesTotal} images lack alt attributes`,
      wcag: WCAG.nonTextContent,
      group: 'images-no-alt',
    });
  }
  if (data.imagesWithoutAlt === 0 && data.imagesTotal > 0) {
    issues.push({
      type: 'info',
      category: 'Images',
      message: `All ${data.imagesTotal} images have alt text`,
      wcag: WCAG.nonTextContent,
    });
  }

  // Contrast
  if (data.contrastIssues > 0) {
    issues.push({
      type: 'error',
      category: 'Contrast',
      message: `${plural(data.contrastIssues, 'text element')} below WCAG AA contrast`,
      details: 'Normal text needs 4.5:1; large text (24px, or 18.66px bold) needs 3:1',
      wcag: WCAG.contrastMinimum,
      group: 'contrast-aa',
    });
  }
  if ((data.contrastManual ?? 0) > 0) {
    issues.push({
      type: 'warning',
      category: 'Contrast',
      message: `${plural(data.contrastManual ?? 0, 'text element')} on images or gradients need a manual check`,
      wcag: WCAG.contrastMinimum,
      group: 'contrast-manual',
    });
  }
  if ((data.contrastAAAOnly ?? 0) > 0) {
    issues.push({
      type: 'info',
      category: 'Contrast',
      message: `${plural(data.contrastAAAOnly ?? 0, 'text element')} pass AA but not AAA`,
      wcag: WCAG.contrastEnhanced,
    });
  }
  if (data.contrastIssues === 0 && (data.contrastChecked ?? 0) > 0) {
    issues.push({
      type: 'info',
      category: 'Contrast',
      message: `All ${data.contrastChecked} measured text elements meet WCAG AA contrast`,
      wcag: WCAG.contrastMinimum,
    });
  }

  // Headings
  const outOfOrder = data.headings.filter(h => h.outOfOrder);
  if (outOfOrder.length > 0) {
    issues.push({
      type: 'warning',
      category: 'Headings',
      message: `${outOfOrder.length} heading${outOfOrder.length > 1 ? 's' : ''} skip levels`,
      details: outOfOrder.map(h => `h${h.level}: "${h.text}"`).join(', '),
      wcag: bestPractice(WCAG.infoAndRelationships),
      group: 'headings-skipped',
    });
  }
  if (data.headings.length === 0) {
    issues.push({
      type: 'warning',
      category: 'Headings',
      message: 'No headings found on page',
      wcag: bestPractice(WCAG.infoAndRelationships),
    });
  }
  const firstHeading = data.headings[0];
  if (firstHeading && firstHeading.level !== 1) {
    issues.push({
      type: 'warning',
      category: 'Headings',
      message: `First heading is h${firstHeading.level}, expected h1`,
      wcag: bestPractice(WCAG.infoAndRelationships),
    });
  }

  // Landmarks
  if (!data.hasMainLandmark) {
    issues.push({
      type: 'warning',
      category: 'Landmarks',
      message: 'No <main> landmark found',
      wcag: bestPractice(WCAG.bypassBlocks),
    });
  }
  if (!data.hasNavLandmark) {
    issues.push({
      type: 'info',
      category: 'Landmarks',
      message: 'No <nav> landmark found',
      wcag: bestPractice(WCAG.infoAndRelationships),
    });
  }
  if (!data.hasSkipLink) {
    issues.push({
      type: 'info',
      category: 'Landmarks',
      message: 'No skip-to-content link found',
      wcag: bestPractice(WCAG.bypassBlocks),
    });
  }

  // Interactive elements
  if (data.linksWithoutText > 0) {
    issues.push({
      type: 'error',
      category: 'Links',
      message: `${data.linksWithoutText} link${data.linksWithoutText > 1 ? 's' : ''} without accessible text`,
      wcag: WCAG.linkPurpose,
      group: 'links-no-text',
    });
  }
  if (data.buttonsWithoutText > 0) {
    issues.push({
      type: 'error',
      category: 'Buttons',
      message: `${data.buttonsWithoutText} button${data.buttonsWithoutText > 1 ? 's' : ''} without accessible text`,
      wcag: WCAG.nameRoleValue,
      group: 'buttons-no-text',
    });
  }

  // Forms
  if (data.formInputsWithoutLabel > 0) {
    issues.push({
      type: 'error',
      category: 'Forms',
      message: `${data.formInputsWithoutLabel} form input${data.formInputsWithoutLabel > 1 ? 's' : ''} without label`,
      details: 'A placeholder is not a label',
      wcag: WCAG.nameRoleValue,
      group: 'inputs-no-label',
    });
  }

  // Tabindex
  if (data.tabindexPositive > 0) {
    issues.push({
      type: 'warning',
      category: 'Focus',
      message: `${data.tabindexPositive} element${data.tabindexPositive > 1 ? 's' : ''} with positive tabindex`,
      details: 'Positive tabindex values create confusing focus order',
      wcag: bestPractice(WCAG.focusOrder),
      group: 'tabindex-positive',
    });
  }

  // Document
  if (!data.htmlLang) {
    issues.push({
      type: 'error',
      category: 'Document',
      message: 'Missing lang attribute on <html>',
      wcag: WCAG.languageOfPage,
    });
  }
  if (!data.titleText) {
    issues.push({
      type: 'error',
      category: 'Document',
      message: 'Missing <title> element',
      wcag: WCAG.pageTitled,
    });
  }

  return issues;
}

/** Compute stats from issues list. */
export function computeStats(issues: A11yIssue[]): A11yReport['stats'] {
  const errors = issues.filter(i => i.type === 'error').length;
  const warnings = issues.filter(i => i.type === 'warning').length;
  const info = issues.filter(i => i.type === 'info').length;
  return { errors, warnings, info, total: issues.length };
}

/** Get severity icon for issue type. */
export function issueIcon(type: A11yIssue['type']): string {
  switch (type) {
    case 'error': return 'X';
    case 'warning': return '!';
    case 'info': return 'i';
  }
}

/** Sort issues by severity (errors first). */
export function sortIssues(issues: A11yIssue[]): A11yIssue[] {
  const order = { error: 0, warning: 1, info: 2 };
  return [...issues].sort((a, b) => order[a.type] - order[b.type]);
}

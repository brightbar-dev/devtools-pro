/** Accessibility analysis utilities. */

export interface A11yIssue {
  type: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  element?: string; // selector or tag description
  details?: string;
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

/** Analyze heading structure for proper hierarchy. */
export function analyzeHeadings(headings: Array<{ level: number; text: string }>): HeadingInfo[] {
  let lastLevel = 0;
  return headings.map(h => {
    const outOfOrder = h.level > lastLevel + 1 && lastLevel > 0;
    lastLevel = h.level;
    return { ...h, outOfOrder };
  });
}

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
  contrastIssues: number;
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
    });
  }
  if (data.imagesWithoutAlt === 0 && data.imagesTotal > 0) {
    issues.push({
      type: 'info',
      category: 'Images',
      message: `All ${data.imagesTotal} images have alt text`,
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
    });
  }
  if (data.headings.length === 0) {
    issues.push({
      type: 'warning',
      category: 'Headings',
      message: 'No headings found on page',
    });
  }
  if (data.headings.length > 0 && data.headings[0].level !== 1) {
    issues.push({
      type: 'warning',
      category: 'Headings',
      message: `First heading is h${data.headings[0].level}, expected h1`,
    });
  }

  // Landmarks
  if (!data.hasMainLandmark) {
    issues.push({
      type: 'warning',
      category: 'Landmarks',
      message: 'No <main> landmark found',
    });
  }
  if (!data.hasNavLandmark) {
    issues.push({
      type: 'info',
      category: 'Landmarks',
      message: 'No <nav> landmark found',
    });
  }
  if (!data.hasSkipLink) {
    issues.push({
      type: 'info',
      category: 'Landmarks',
      message: 'No skip-to-content link found',
    });
  }

  // Interactive elements
  if (data.linksWithoutText > 0) {
    issues.push({
      type: 'error',
      category: 'Links',
      message: `${data.linksWithoutText} link${data.linksWithoutText > 1 ? 's' : ''} without accessible text`,
    });
  }
  if (data.buttonsWithoutText > 0) {
    issues.push({
      type: 'error',
      category: 'Buttons',
      message: `${data.buttonsWithoutText} button${data.buttonsWithoutText > 1 ? 's' : ''} without accessible text`,
    });
  }

  // Forms
  if (data.formInputsWithoutLabel > 0) {
    issues.push({
      type: 'error',
      category: 'Forms',
      message: `${data.formInputsWithoutLabel} form input${data.formInputsWithoutLabel > 1 ? 's' : ''} without label`,
    });
  }

  // Tabindex
  if (data.tabindexPositive > 0) {
    issues.push({
      type: 'warning',
      category: 'Focus',
      message: `${data.tabindexPositive} element${data.tabindexPositive > 1 ? 's' : ''} with positive tabindex`,
      details: 'Positive tabindex values create confusing focus order',
    });
  }

  // Document
  if (!data.htmlLang) {
    issues.push({
      type: 'error',
      category: 'Document',
      message: 'Missing lang attribute on <html>',
    });
  }
  if (!data.titleText) {
    issues.push({
      type: 'error',
      category: 'Document',
      message: 'Missing <title> element',
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

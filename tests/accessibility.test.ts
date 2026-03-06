import { describe, it, expect } from 'vitest';
import {
  analyzeHeadings,
  analyzeIssues,
  computeStats,
  issueIcon,
  sortIssues,
  type A11yIssue,
  type HeadingInfo,
} from '../utils/accessibility';

describe('analyzeHeadings', () => {
  it('marks properly ordered headings as not out of order', () => {
    const headings = [{ level: 1, text: 'Title' }, { level: 2, text: 'Sub' }, { level: 3, text: 'SubSub' }];
    const result = analyzeHeadings(headings);
    expect(result.every(h => !h.outOfOrder)).toBe(true);
  });

  it('marks skipped heading levels', () => {
    const headings = [{ level: 1, text: 'Title' }, { level: 3, text: 'Skipped' }];
    const result = analyzeHeadings(headings);
    expect(result[0].outOfOrder).toBe(false);
    expect(result[1].outOfOrder).toBe(true);
  });

  it('handles empty headings', () => {
    expect(analyzeHeadings([])).toEqual([]);
  });

  it('allows same-level consecutive headings', () => {
    const headings = [{ level: 2, text: 'A' }, { level: 2, text: 'B' }];
    const result = analyzeHeadings(headings);
    expect(result.every(h => !h.outOfOrder)).toBe(true);
  });

  it('allows going up (smaller number) in levels', () => {
    const headings = [
      { level: 1, text: 'Title' },
      { level: 3, text: 'Deep' },
      { level: 2, text: 'Back up' },
    ];
    const result = analyzeHeadings(headings);
    expect(result[2].outOfOrder).toBe(false); // Going up is fine
  });
});

describe('analyzeIssues', () => {
  const baseData = {
    imagesWithoutAlt: 0,
    imagesTotal: 5,
    headings: [{ level: 1, text: 'Title', outOfOrder: false }] as HeadingInfo[],
    hasMainLandmark: true,
    hasNavLandmark: true,
    hasSkipLink: true,
    linksWithoutText: 0,
    buttonsWithoutText: 0,
    formInputsWithoutLabel: 0,
    tabindexPositive: 0,
    contrastIssues: 0,
    htmlLang: 'en',
    titleText: 'Test Page',
  };

  it('reports no errors for a well-structured page', () => {
    const issues = analyzeIssues(baseData);
    const errors = issues.filter(i => i.type === 'error');
    expect(errors).toHaveLength(0);
  });

  it('reports images without alt', () => {
    const issues = analyzeIssues({ ...baseData, imagesWithoutAlt: 3, imagesTotal: 10 });
    const imgIssues = issues.filter(i => i.category === 'Images' && i.type === 'error');
    expect(imgIssues).toHaveLength(1);
    expect(imgIssues[0].message).toContain('3 images');
  });

  it('reports all images have alt as info', () => {
    const issues = analyzeIssues(baseData);
    const imgInfo = issues.filter(i => i.category === 'Images' && i.type === 'info');
    expect(imgInfo).toHaveLength(1);
  });

  it('reports missing lang attribute', () => {
    const issues = analyzeIssues({ ...baseData, htmlLang: '' });
    const langIssues = issues.filter(i => i.message.includes('lang'));
    expect(langIssues).toHaveLength(1);
    expect(langIssues[0].type).toBe('error');
  });

  it('reports missing title', () => {
    const issues = analyzeIssues({ ...baseData, titleText: '' });
    const titleIssues = issues.filter(i => i.message.includes('title'));
    expect(titleIssues).toHaveLength(1);
  });

  it('reports missing main landmark', () => {
    const issues = analyzeIssues({ ...baseData, hasMainLandmark: false });
    const landmarkIssues = issues.filter(i => i.category === 'Landmarks' && i.message.includes('main'));
    expect(landmarkIssues).toHaveLength(1);
  });

  it('reports links without text', () => {
    const issues = analyzeIssues({ ...baseData, linksWithoutText: 2 });
    const linkIssues = issues.filter(i => i.category === 'Links');
    expect(linkIssues).toHaveLength(1);
    expect(linkIssues[0].type).toBe('error');
  });

  it('reports form inputs without labels', () => {
    const issues = analyzeIssues({ ...baseData, formInputsWithoutLabel: 1 });
    const formIssues = issues.filter(i => i.category === 'Forms');
    expect(formIssues).toHaveLength(1);
  });

  it('reports positive tabindex', () => {
    const issues = analyzeIssues({ ...baseData, tabindexPositive: 3 });
    const focusIssues = issues.filter(i => i.category === 'Focus');
    expect(focusIssues).toHaveLength(1);
    expect(focusIssues[0].type).toBe('warning');
  });

  it('reports no headings', () => {
    const issues = analyzeIssues({ ...baseData, headings: [] });
    const headingIssues = issues.filter(i => i.category === 'Headings');
    expect(headingIssues.length).toBeGreaterThan(0);
  });

  it('reports first heading not h1', () => {
    const headings: HeadingInfo[] = [{ level: 2, text: 'Not H1', outOfOrder: false }];
    const issues = analyzeIssues({ ...baseData, headings });
    const h1Issues = issues.filter(i => i.message.includes('h2') && i.message.includes('h1'));
    expect(h1Issues).toHaveLength(1);
  });
});

describe('computeStats', () => {
  it('counts issue types correctly', () => {
    const issues: A11yIssue[] = [
      { type: 'error', category: 'A', message: 'err1' },
      { type: 'error', category: 'B', message: 'err2' },
      { type: 'warning', category: 'C', message: 'warn1' },
      { type: 'info', category: 'D', message: 'info1' },
    ];
    const stats = computeStats(issues);
    expect(stats.errors).toBe(2);
    expect(stats.warnings).toBe(1);
    expect(stats.info).toBe(1);
    expect(stats.total).toBe(4);
  });

  it('handles empty issues', () => {
    const stats = computeStats([]);
    expect(stats.total).toBe(0);
  });
});

describe('issueIcon', () => {
  it('returns correct icons', () => {
    expect(issueIcon('error')).toBe('X');
    expect(issueIcon('warning')).toBe('!');
    expect(issueIcon('info')).toBe('i');
  });
});

describe('sortIssues', () => {
  it('sorts errors first, then warnings, then info', () => {
    const issues: A11yIssue[] = [
      { type: 'info', category: 'A', message: 'info' },
      { type: 'error', category: 'B', message: 'error' },
      { type: 'warning', category: 'C', message: 'warning' },
    ];
    const sorted = sortIssues(issues);
    expect(sorted[0].type).toBe('error');
    expect(sorted[1].type).toBe('warning');
    expect(sorted[2].type).toBe('info');
  });

  it('does not mutate original array', () => {
    const issues: A11yIssue[] = [
      { type: 'info', category: 'A', message: 'info' },
      { type: 'error', category: 'B', message: 'error' },
    ];
    sortIssues(issues);
    expect(issues[0].type).toBe('info');
  });
});

import { describe, it, expect } from 'vitest';
import { analyzeHeadings, analyzeIssues, WCAG } from '../utils/accessibility';

const clean = {
  imagesWithoutAlt: 0,
  imagesTotal: 2,
  headings: analyzeHeadings([{ level: 1, text: 'Title' }, { level: 2, text: 'Section' }]),
  hasMainLandmark: true,
  hasNavLandmark: true,
  hasSkipLink: true,
  linksWithoutText: 0,
  buttonsWithoutText: 0,
  formInputsWithoutLabel: 0,
  tabindexPositive: 0,
  contrastIssues: 0,
  htmlLang: 'en',
  titleText: 'Page',
};

const find = (issues: ReturnType<typeof analyzeIssues>, category: string, type?: string) =>
  issues.find(i => i.category === category && (!type || i.type === type));

describe('WCAG references', () => {
  it('points every reference at the WCAG 2.2 Understanding docs', () => {
    for (const ref of Object.values(WCAG)) {
      expect(ref.url).toMatch(/^https:\/\/www\.w3\.org\/WAI\/WCAG22\/Understanding\/[a-z-]+$/);
      expect(ref.id).toMatch(/^\d\.\d\.\d$/);
    }
  });

  it('gives every issue the fixture can raise a WCAG reference', () => {
    const issues = analyzeIssues({
      ...clean,
      imagesWithoutAlt: 1,
      headings: analyzeHeadings([{ level: 2, text: 'a' }, { level: 4, text: 'b' }]),
      hasMainLandmark: false,
      hasNavLandmark: false,
      hasSkipLink: false,
      linksWithoutText: 1,
      buttonsWithoutText: 1,
      formInputsWithoutLabel: 1,
      tabindexPositive: 1,
      contrastIssues: 1,
      contrastManual: 1,
      contrastAAAOnly: 1,
      htmlLang: '',
      titleText: '',
    });
    expect(issues.length).toBeGreaterThanOrEqual(14);
    for (const issue of issues) expect(issue.wcag, issue.message).toBeDefined();
  });

  it('maps the core failures to their success criteria', () => {
    const issues = analyzeIssues({ ...clean, imagesWithoutAlt: 1, linksWithoutText: 2, buttonsWithoutText: 1, formInputsWithoutLabel: 1, htmlLang: '', titleText: '' });
    expect(find(issues, 'Images', 'error')?.wcag?.id).toBe('1.1.1');
    expect(find(issues, 'Links')?.wcag?.id).toBe('2.4.4');
    expect(find(issues, 'Buttons')?.wcag?.id).toBe('4.1.2');
    expect(find(issues, 'Forms')?.wcag?.id).toBe('4.1.2');
    expect(issues.find(i => i.message.includes('lang'))?.wcag?.id).toBe('3.1.1');
    expect(issues.find(i => i.message.includes('<title>'))?.wcag?.id).toBe('2.4.2');
  });

  it('marks guidance that is not a strict failure as best practice', () => {
    const issues = analyzeIssues({ ...clean, headings: analyzeHeadings([{ level: 1, text: 'a' }, { level: 3, text: 'b' }]), tabindexPositive: 1 });
    expect(find(issues, 'Headings')?.wcag).toMatchObject({ id: '1.3.1', bestPractice: true });
    expect(find(issues, 'Focus')?.wcag).toMatchObject({ id: '2.4.3', bestPractice: true });
  });
});

describe('highlight groups', () => {
  it('ties each element-level issue to a highlightable group', () => {
    const issues = analyzeIssues({
      ...clean, imagesWithoutAlt: 1, linksWithoutText: 1, buttonsWithoutText: 1, formInputsWithoutLabel: 1, tabindexPositive: 1,
      headings: analyzeHeadings([{ level: 1, text: 'a' }, { level: 3, text: 'b' }]),
    });
    expect(issues.map(i => i.group).filter(Boolean).sort()).toEqual(
      ['buttons-no-text', 'headings-skipped', 'images-no-alt', 'inputs-no-label', 'links-no-text', 'tabindex-positive'],
    );
  });

  it('leaves document-level issues without a group', () => {
    const issues = analyzeIssues({ ...clean, htmlLang: '', hasMainLandmark: false });
    for (const issue of issues.filter(i => i.category === 'Document' || i.category === 'Landmarks')) {
      expect(issue.group).toBeUndefined();
    }
  });
});

describe('contrast issues', () => {
  it('raises an AA failure as an error against 1.4.3', () => {
    const issue = find(analyzeIssues({ ...clean, contrastIssues: 3, contrastChecked: 40 }), 'Contrast', 'error');
    expect(issue).toMatchObject({ message: '3 text elements below WCAG AA contrast', group: 'contrast-aa' });
    expect(issue?.wcag?.id).toBe('1.4.3');
  });

  it('raises text on images or gradients as a warning with its own group', () => {
    const issue = find(analyzeIssues({ ...clean, contrastManual: 1, contrastChecked: 10 }), 'Contrast', 'warning');
    expect(issue).toMatchObject({ message: '1 text element on images or gradients need a manual check', group: 'contrast-manual' });
  });

  it('reports AAA-only shortfalls as information against 1.4.6', () => {
    const issue = find(analyzeIssues({ ...clean, contrastAAAOnly: 2, contrastChecked: 10 }), 'Contrast', 'info');
    expect(issue?.message).toBe('2 text elements pass AA but not AAA');
    expect(issue?.wcag?.id).toBe('1.4.6');
  });

  it('confirms a clean pass only when something was measured', () => {
    expect(find(analyzeIssues({ ...clean, contrastChecked: 12 }), 'Contrast')?.message).toBe('All 12 measured text elements meet WCAG AA contrast');
    expect(find(analyzeIssues({ ...clean }), 'Contrast')).toBeUndefined();
  });
});

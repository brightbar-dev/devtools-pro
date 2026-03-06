import { describe, test, expect, vi, afterEach } from 'vitest';
import { isTrialActive, trialDaysRemaining, resolveProStatus, statusLabel, TRIAL_DAYS } from '../utils/payment';

describe('isTrialActive', () => {
  afterEach(() => { vi.useRealTimers(); });

  test('returns false when trialStartedAt is null', () => {
    expect(isTrialActive(null)).toBe(false);
  });

  test('returns true when trial just started', () => {
    expect(isTrialActive(new Date())).toBe(true);
  });

  test('returns true on day 6 of 7-day trial', () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    expect(isTrialActive(sixDaysAgo, 7)).toBe(true);
  });

  test('returns false when trial expired', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(isTrialActive(eightDaysAgo, 7)).toBe(false);
  });

  test('returns false exactly at expiry boundary', () => {
    const exactlySevenDays = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(isTrialActive(exactlySevenDays, 7)).toBe(false);
  });

  test('respects custom trial duration', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(isTrialActive(twoDaysAgo, 3)).toBe(true);
    expect(isTrialActive(twoDaysAgo, 1)).toBe(false);
  });

  test('defaults to TRIAL_DAYS constant', () => {
    const withinDefault = new Date(Date.now() - (TRIAL_DAYS - 1) * 24 * 60 * 60 * 1000);
    expect(isTrialActive(withinDefault)).toBe(true);
  });
});

describe('trialDaysRemaining', () => {
  test('returns 0 when trialStartedAt is null', () => {
    expect(trialDaysRemaining(null)).toBe(0);
  });

  test('returns full days when trial just started', () => {
    expect(trialDaysRemaining(new Date(), 7)).toBe(7);
  });

  test('returns 1 on the last day', () => {
    const almostExpired = new Date(Date.now() - 6.5 * 24 * 60 * 60 * 1000);
    expect(trialDaysRemaining(almostExpired, 7)).toBe(1);
  });

  test('returns 0 when expired', () => {
    const expired = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    expect(trialDaysRemaining(expired, 7)).toBe(0);
  });

  test('rounds up partial days', () => {
    // 5 days and 1 hour ago → 2 days remaining (ceil of 1.958...)
    const fiveDaysOneHourAgo = new Date(Date.now() - (5 * 24 + 1) * 60 * 60 * 1000);
    expect(trialDaysRemaining(fiveDaysOneHourAgo, 7)).toBe(2);
  });
});

describe('resolveProStatus', () => {
  test('unlocked when paid', () => {
    const status = resolveProStatus({
      paid: true,
      paidAt: new Date('2026-01-15'),
      trialStartedAt: null,
    });
    expect(status.unlocked).toBe(true);
    expect(status.paid).toBe(true);
    expect(status.trialActive).toBe(false);
  });

  test('unlocked during active trial', () => {
    const status = resolveProStatus({
      paid: false,
      paidAt: null,
      trialStartedAt: new Date(),
    });
    expect(status.unlocked).toBe(true);
    expect(status.paid).toBe(false);
    expect(status.trialActive).toBe(true);
    expect(status.trialDaysLeft).toBeGreaterThan(0);
  });

  test('locked when not paid and no trial', () => {
    const status = resolveProStatus({
      paid: false,
      paidAt: null,
      trialStartedAt: null,
    });
    expect(status.unlocked).toBe(false);
    expect(status.paid).toBe(false);
    expect(status.trialActive).toBe(false);
    expect(status.trialDaysLeft).toBe(0);
  });

  test('locked when trial expired and not paid', () => {
    const status = resolveProStatus({
      paid: false,
      paidAt: null,
      trialStartedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });
    expect(status.unlocked).toBe(false);
    expect(status.trialActive).toBe(false);
  });

  test('unlocked when paid even if trial expired', () => {
    const status = resolveProStatus({
      paid: true,
      paidAt: new Date('2026-02-01'),
      trialStartedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });
    expect(status.unlocked).toBe(true);
    expect(status.paid).toBe(true);
    expect(status.trialActive).toBe(false);
  });
});

describe('statusLabel', () => {
  test('shows Pro when paid', () => {
    expect(statusLabel({
      unlocked: true, paid: true, paidAt: new Date(), trialActive: false, trialDaysLeft: 0,
    })).toBe('Pro');
  });

  test('shows trial with days remaining', () => {
    expect(statusLabel({
      unlocked: true, paid: false, paidAt: null, trialActive: true, trialDaysLeft: 5,
    })).toBe('Trial (5d left)');
  });

  test('shows Free when locked', () => {
    expect(statusLabel({
      unlocked: false, paid: false, paidAt: null, trialActive: false, trialDaysLeft: 0,
    })).toBe('Free');
  });
});

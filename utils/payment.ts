/**
 * Payment/licensing utilities for DevTools Pro.
 * Pure functions for pro status resolution — no ExtPay dependency.
 * ExtPay initialization lives in background.ts and popup code.
 */

/** ExtensionPay extension ID. Replace after registering at extensionpay.com */
export const EXTPAY_ID = 'devtools-pro';

/** Pricing: one-time $59 purchase */
export const PRICE_DISPLAY = '$59';
export const PRICE_LABEL = 'one-time';

/** Trial duration in days */
export const TRIAL_DAYS = 7;

export interface ProStatus {
  unlocked: boolean;
  paid: boolean;
  paidAt: Date | null;
  trialActive: boolean;
  trialDaysLeft: number;
}

/** Minimal user shape from ExtPay's getUser() — only fields we use */
export interface PaymentUser {
  paid: boolean;
  paidAt: Date | null;
  trialStartedAt: Date | null;
}

/** Check if a trial is still active given its start date and duration */
export function isTrialActive(trialStartedAt: Date | null, trialDays: number = TRIAL_DAYS): boolean {
  if (!trialStartedAt) return false;
  const elapsed = Date.now() - trialStartedAt.getTime();
  return elapsed < trialDays * 24 * 60 * 60 * 1000;
}

/** Days remaining in trial (0 if expired or not started) */
export function trialDaysRemaining(trialStartedAt: Date | null, trialDays: number = TRIAL_DAYS): number {
  if (!trialStartedAt) return 0;
  const elapsed = Date.now() - trialStartedAt.getTime();
  const remaining = trialDays - elapsed / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(remaining));
}

/** Resolve full pro status from ExtPay user data */
export function resolveProStatus(user: PaymentUser, trialDays: number = TRIAL_DAYS): ProStatus {
  const trialActive = isTrialActive(user.trialStartedAt, trialDays);
  return {
    unlocked: user.paid || trialActive,
    paid: user.paid,
    paidAt: user.paidAt,
    trialActive,
    trialDaysLeft: trialDaysRemaining(user.trialStartedAt, trialDays),
  };
}

/** Format status for display in options/popup */
export function statusLabel(status: ProStatus): string {
  if (status.paid) return 'Pro';
  if (status.trialActive) return `Trial (${status.trialDaysLeft}d left)`;
  return 'Free';
}

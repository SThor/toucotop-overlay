/**
 * Shared alert type definitions — imported by both server (alert-relay, eventsub-handler)
 * and client (useAlertStream hook) to avoid type drift between the two sides.
 */

export type AlertType =
  | 'follow'
  | 'subscribe'
  | 'resubscribe'
  | 'gift_sub'
  | 'cheer'
  | 'raid'
  | 'hype_train_begin'
  | 'hype_train_progress'
  | 'hype_train_end';

export interface AlertPayload {
  /** Unique id for this alert event */
  id: string;
  type: AlertType;
  /** ISO timestamp */
  timestamp: string;
  // ── per-type optional fields ──────────────────────────────────────────────
  /** Display name of the acting user (follower, subscriber, raider, cheerer…) */
  userName?: string;
  /** Sub tier: '1000' | '2000' | '3000' */
  tier?: string;
  /** Whether this is a gifted sub */
  isGift?: boolean;
  /** Gifter display name */
  gifterName?: string;
  /** Re-sub cumulative months */
  cumulativeMonths?: number;
  /** Streak months for re-sub */
  streakMonths?: number;
  /** Re-sub / custom reward message */
  message?: string;
  /** Number of gifted subs in a gift-bomb */
  giftCount?: number;
  /** Bits amount for cheers */
  bits?: number;
  /** Raiding channel display name */
  raiderName?: string;
  /** Viewer count for raids */
  viewerCount?: number;
  /** Hype train level */
  level?: number;
  /** Hype train progress 0-100 */
  progress?: number;
}

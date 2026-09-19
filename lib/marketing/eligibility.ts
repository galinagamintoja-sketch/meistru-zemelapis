export type DispatchFacts = {
  approvedRevisionMatches: boolean;
  suppressed: boolean;
  registered: boolean;
  hasNewReply: boolean;
  campaignPaused: boolean;
  channelAvailable: boolean;
  dailyAllowanceRemaining: boolean;
  insideSendingWindow: boolean;
  contactabilityPermitted: boolean;
};

export function dispatchEligibility(facts: DispatchFacts) {
  const failures = Object.entries({
    approval_changed: !facts.approvedRevisionMatches,
    suppressed: facts.suppressed,
    registered: facts.registered,
    reply_received: facts.hasNewReply,
    campaign_paused: facts.campaignPaused,
    channel_unavailable: !facts.channelAvailable,
    daily_limit_reached: !facts.dailyAllowanceRemaining,
    outside_sending_window: !facts.insideSendingWindow,
    contactability_not_permitted: !facts.contactabilityPermitted,
  })
    .filter(([, failed]) => failed)
    .map(([reason]) => reason);
  return { eligible: failures.length === 0, failures };
}

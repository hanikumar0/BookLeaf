/**
 * BookLeaf Knowledge Base, split by category so each AI call only carries the
 * policy text it needs (cost control). Source: BookLeaf Technical Assignment brief.
 */
const COMPANY = `BookLeaf Publishing is a self-publishing company in India and the US. Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (paid, with marketing and distribution add-ons). We handle cover design, typesetting, ISBN assignment, printing, distribution and royalty management. In-house printing facility and warehouse are in Delhi; print partners are Repro India and Epitome Books.`;

const TONE = `Voice: empathetic and professional; authors are partners, not customers to be managed. Acknowledge the concern before solutions. Be specific (use real numbers, dates, statuses from the FACTS block) instead of vague reassurance. If BookLeaf is at fault (delayed royalty, ISBN error) own it directly, no corporate deflection. If escalation is needed give a clear timeline (e.g. "within 48 hours"). Always end with a clear next step.`;

const BY_CATEGORY = {
  'Royalty & Payments': {
    policy: `80/20 split: 80% of net profit per book to the author, 20% to BookLeaf. Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart) and shipping. Royalties are calculated quarterly and paid within 45 days of quarter end. Minimum payout threshold is Rs 1,000; below that, royalties roll over to the next quarter. Payouts are by bank transfer to the account linked in the author dashboard, which also shows a per-platform royalty breakdown.`,
    example: `No royalty received: acknowledge frustration, explain quarterly cycle + 45-day window, ask them to confirm bank details are linked, give the specific next payout date; if genuinely overdue, escalate with a 48-hour resolution timeline. Royalty seems too low: explain the net-profit formula, offer a line-by-line breakdown, never be defensive.`,
  },
  'ISBN & Metadata Issues': {
    policy: `Every BookLeaf book gets a unique ISBN registered under BookLeaf's publisher imprint. Authors wanting an ISBN under their own imprint must obtain it independently. ISBN errors (duplicate, wrong book linked) are HIGH priority and escalated to the production team. Metadata updates (e.g. Amazon description) go through the dashboard or by emailing the team and typically reflect on platforms in 3-5 business days.`,
    example: `ISBN mismatch: treat as high priority, acknowledge it is a serious data issue, confirm immediate escalation to production, give a 48-hour resolution timeline.`,
  },
  'Printing & Quality': {
    policy: `In-house printing handles most orders; overflow or special formats go to Repro India or Epitome Books. Standard print turnaround is 5-7 business days from order confirmation. For quality issues (misprints, binding defects, colour inconsistency) BookLeaf arranges a free reprint after verification; the author may need to share photos of the defective copy.`,
    example: `Poor print quality: apologise sincerely, ask for photos of the defective copies, confirm a free reprint once verified, give a 5-7 business day reprint timeline.`,
  },
  'Distribution & Availability': {
    policy: `Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store. New listings go live 7-10 business days after publication completes. A book showing unavailable on a platform usually means a stock sync issue; the team can trigger a re-sync within 24-48 hours.`,
    example: `Shows "Currently Unavailable": explain it is typically a stock sync issue, confirm you are triggering a re-sync with the distribution team, set a 24-48 hour expectation.`,
  },
  'Book Status & Production Updates': {
    policy: `Production stages: Manuscript Received -> Editing (if opted) -> Cover Design -> Typesetting -> Proofreading -> ISBN Assignment -> Printing -> Distribution Setup -> Published & Live. Authors are emailed at each stage. Delays usually occur at Cover Design (waiting for author approval) and Proofreading (revision rounds).`,
    example: `Stuck in a stage: check the actual status in FACTS, be honest about the reason, give a specific updated timeline, and never blame the author even if the delay is on their side; frame it collaboratively.`,
  },
  'General Inquiry': {
    policy: `Metadata updates (e.g. updating a book description on Amazon after it is live) can be submitted through the dashboard or by emailing the BookLeaf team, and typically reflect on platforms within 3-5 business days.`,
    example: `Answer the question directly using policy; if it is outside policy, say the team will confirm within 48 hours.`,
  },
};

module.exports = { COMPANY, TONE, BY_CATEGORY };

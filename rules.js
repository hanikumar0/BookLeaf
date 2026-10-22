/** Deterministic fallback classifier used when the AI API is unavailable. Better than nothing, never blocks. */
const RULES = [
  ['ISBN & Metadata Issues', /\bisbn\b|metadata|wrong book|duplicate/i],
  ['Royalty & Payments', /royalt|payment|payout|paid|bank|earn|commission/i],
  ['Printing & Quality', /print|blurry|binding|misalign|quality|reprint|defect|colou?r/i],
  ['Distribution & Availability', /unavailable|amazon|flipkart|listing|not showing|stock|available/i],
  ['Book Status & Production Updates', /typeset|cover design|proof|editing|production|when will|status/i],
];

function classifyByRules({ subject, description }) {
  const text = `${subject} ${description}`;
  const category = (RULES.find(([, re]) => re.test(text)) || [])[0] || 'General Inquiry';
  let priority = 'Medium';
  if (/legal|fraud|lawyer|scam|cheat/i.test(text) || (category === 'Royalty & Payments' && /\b(6|six|[7-9]|1\d)\s*months?\b|never received|haven.t received any/i.test(text))) priority = 'Critical';
  else if (category === 'ISBN & Metadata Issues' || /urgent|asap|terrible|not received|wrong|missing/i.test(text)) priority = 'High';
  else if (category === 'General Inquiry') priority = 'Low';
  return { category, priority, source: 'rules' };
}

module.exports = { classifyByRules };

// Built-in talking points, used when AI is off or fails.
// We pick 3 per call using a simple hash of (person + date), so the same call
// always gets the same ideas, but each day brings different ones.
import type { Relation } from "../../../shared/schemas.js";

const TOPICS: Record<Relation, string[]> = {
  parent: [
    "Ask what they ate today and who cooked.",
    "Share one small win from your week.",
    "Ask how they are sleeping and how they feel — and really listen.",
    "Ask their advice on something you are figuring out.",
    "Ask what they are looking forward to this week.",
    "Tell them one thing you learned in class.",
    "Ask which relatives they talked to recently.",
    "Plan your next visit home together.",
  ],
  sibling: [
    "Ask what is stressing them out lately.",
    "Bring up a funny memory from when you were kids.",
    "Swap one show, song or game recommendation.",
    "Ask how things are going at college or work.",
    "Plan something to do together next time you meet.",
    "Ask how Mom and Dad seemed to them lately.",
  ],
  grandparent: [
    "Ask for a story from when they were your age.",
    "Ask how their health has been this week.",
    "Tell them what you are studying and why.",
    "Ask about their favourite festival memory.",
    "Ask what they cooked or ate today.",
    "Ask what advice they would give their younger self.",
  ],
  relative: [
    "Ask how everyone at home is doing.",
    "Catch up on any family news or events coming up.",
    "Ask about their work or studies.",
    "Share what you have been busy with lately.",
    "Ask when you might all meet next.",
  ],
  friend: [
    "Ask what has been on their mind lately.",
    "Follow up on the thing they mentioned last time.",
    "Share something funny that happened this week.",
    "Swap one recommendation: a song, a show or a reel.",
    "Float a plan to meet up or play something online.",
    "Ask what they are excited about right now.",
    "Ask how they are really doing — not just 'fine'.",
  ],
  partner: [
    "Ask about the best and hardest part of their day.",
    "Plan your next date or call.",
    "Share something that reminded you of them.",
    "Ask what would make their week easier.",
  ],
  other: [
    "Ask how their week has been.",
    "Share one thing you have been up to.",
    "Ask what they are looking forward to.",
    "Ask if there is anything you can help with.",
  ],
};

/** FNV-1a: a tiny, stable string hash. Not for security — only for picking topics. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function offlineTopics(relation: Relation, seed: string, count = 3): string[] {
  const list = TOPICS[relation];
  const start = hash(seed) % list.length;
  const out: string[] = [];
  for (let i = 0; i < Math.min(count, list.length); i++) {
    const topic = list[(start + i) % list.length];
    if (topic) out.push(topic);
  }
  return out;
}

# ALTERNATIVES

The options we turned down for each big choice, what they would have cost, and what would change our mind.

## Planning horizon
| Option | Cost / risk | Verdict |
|---|---|---|
| Plan a whole week | Calendar spam, stale plans when meetings change | Rejected |
| Plan 2–3 days | Still clutters the calendar, more events to keep in sync | Rejected |
| **Plan today, every morning** | One missed morning = no call that day | **Chosen** |

Revisit if: I want to book calls with busy people days in advance.

## Where the planning logic lives
| Option | Cost / risk | Verdict |
|---|---|---|
| Logic mixed with Google API calls | Hard to test, needs a real calendar | Rejected |
| **Pure planner + thin "apply" layer** | A little extra glue code | **Chosen** |

## How to pick who to call
| Option | Cost / risk | Verdict |
|---|---|---|
| Round robin | Ignores that I want to call Mom more often than a cousin | Rejected |
| Random | Unfair streaks, hard to test | Rejected |
| **Overdue score** | Needs call history | **Chosen** |

## Reaching my contacts
| Option | Cost / risk | Verdict |
|---|---|---|
| Twilio SMS | Looks like spam, costs money, India DLT paperwork | Rejected |
| WhatsApp Business API | Business verification, templates, cost | Rejected |
| **One-tap WhatsApp/SMS links from my phone** | One tap of effort | **Chosen** |

Revisit if: a free, personal way to send from my own number appears.

## Date library
| Option | Cost / risk | Verdict |
|---|---|---|
| Native `Date` | Painful timezone maths, easy DST bugs | Rejected |
| date-fns-tz | Fine, but two packages and a more scattered API | Rejected |
| **Luxon** | ~70 KB | **Chosen** |

Revisit if: `Temporal` is supported in Node and all browsers.

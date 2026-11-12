# touchbase

**One short call a day with someone you care about.**

Even with free time, it's easy to go weeks without calling family and close friends. touchbase reads your Google Calendar every morning, finds a free 10–15 minute gap later that day, picks the person you've gone longest without calling, and adds one "📞 Call Mom" event. That event is for **today only**.

> 🚧 Work in progress. The scheduling engine is done and tested. The server and dashboard are being built.

## How it decides
- **Who:** the person who is most overdue (days since your last call ÷ how often you want to talk to them).
- **When:** the first free slot inside your call window (for example 19:30–22:00), away from your other events, and inside the other person's waking hours if they live abroad.
- **Never:** more than your daily limit, events on other days, or changes to events it did not create.

## Docs
The [docs folder](docs/README.md) explains how it works and why it was built this way.

## License
MIT

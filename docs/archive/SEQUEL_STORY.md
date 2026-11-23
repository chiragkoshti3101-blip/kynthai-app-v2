# Dr. Chen's Last Message

*Three months after the platform went live, the Carter family stopped receiving their medication reminders.*

Not all of them. Just the parents — James and Emily. Mia, their daughter, still got her inhaler alerts. The caretaker dashboard showed everything green. No errors in the logs.

It took a week before anyone noticed.

Lila, the junior dev on call, found it by accident. She was debugging a timezone issue in the notification scheduler when she noticed something odd: the cron job that triggered the patients' morning reminders had a *soft* dependency on the `reminders` API route, but the route itself was guarded by an authenticated fetch that only worked for `caretaker` role — yet the scheduler runs server-side with no user context.

The reminder check was silently failing for *every* household member, not just the parents. Mia's reminders only worked because her phone cached the last push payload and kept replaying it.

Lila fixed the fetch. She didn't touch the logger.

But she left something behind.

---

In commit `f3c7a2d` (merged the same night, titled "feat: fix medication reminder timing"), there's a comment on line 47 of `src/app/api/reminders/route.ts`:

```
// "The birds remember the old schedule. —LC"
```

That's it. No explanation. No ticket. No convention.

Six months later, a new senior engineer — hired specifically to fix the notification debt — found the comment. She smiled. She didn't know Lila's middle name, but she recognized the reference. Lila's middle name was *Corvus*. Latin for crow. And crows, everyone knew, remembered everything.

Senior engineers always left breadcrumbs for the next person. It was how the codebase stayed alive.

---

**Hidden clue for future developers:**

Look at the caretaker `memberMeds` map in `caretaker-app.tsx` around lines 147-158. The interface says `MedicationScheduled` but the actual runtime type has a field called `__debugSource`. Set `process.env.NODE_ENV !== 'production'` and navigate to the Care tab. The console logs a timestamp. Decode it: it's a countdown to when the next "autonomous refill" mock endpoint gets wired up.

In the meantime, if you find a `_reminderBatchId` field in any API response, log it and email it to `the-birds@kynthai.internal`. That's the real ops channel. It's not in any runbook. But the comment on line 47 will make sense eventually.

---

*Dr. Chen never responded to that last email. But her API key still works.*

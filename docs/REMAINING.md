# Remaining work

Deliberately deferred. StillScans launches free, with Google sign-in only.

## When real users arrive

- **Turn on Web Risk before sharing the site publicly.** Production runs without a key, so links
  aren't checked against threat lists. See the reminder in `CLAUDE.md`, including the billing screen
  that showed a $30 charge.

## After launch

- **Payments.** Pro and Business show a waitlist for now. Count interest with `pnpm waitlist:count`.
  Stripe Checkout or a merchant of record such as Lemon Squeezy or Paddle are both options. A successful payment
  should only set `users.plan` and `users.code_allowance`, so it can never affect a printed code.
- **Comparison pages** for "[provider] alternative" searches.
- **Dark mode** and **social share images** (1200×630).
- **Duplicate a code** from the dashboard.
- **Server-side reading** of QR images the browser can't decode.
- **Email sign-in.** Removed for launch. It would need an email provider such as Resend.
- **Staging environment.** The config is there, but its resources don't exist yet.

## Soon

- Delete scan records older than 24 months, as `/privacy` promises.
- Self-serve account deletion. Requests go by email for now.
- Legal review of `/privacy` and `/terms`, including warranty, liability, governing law and disputes.
- The re-check job for destinations, because nothing sets `blocked` automatically.
- Verified provider claims, with a source link and a real date for each.

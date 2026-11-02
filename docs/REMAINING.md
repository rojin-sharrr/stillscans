# Remaining work

Deliberately deferred. StillScans launches free, with Google sign-in only.

## After launch

- **Stripe and paid packs.** Analytics and logos stay free for everyone until this exists. Paying
  should only raise `users.code_allowance`, so it can never affect a printed code.
- **Comparison pages** for "[provider] alternative" searches.
- **Dark mode** and **social share images** (1200×630).
- **Duplicate a code** from the dashboard.
- **Server-side reading** of QR images the browser can't decode.
- **Email sign-in.** Removed for launch. It would need an email provider such as Resend.
- **Staging environment.** The config is there, but its resources don't exist yet.

## Before going public

Tracked here so they aren't lost: these are not deferred.

- Pricing, Trust and the 4 Guides pages, which the site links to but which show a 404 today.
- Privacy Policy and Terms.
- A scheduled job that re-checks destinations, because nothing sets `blocked` automatically.
- A Web Risk key. Until it is set, destinations are not checked against threat lists.
- Verified provider claims, with a source link and a real date for each.

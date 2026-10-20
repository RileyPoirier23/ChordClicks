# Selling ChordClicks Pro — setup checklist (about 10 minutes)

What's already built: the app checks keys offline, the helper server issues keys from Stripe payments and emails them,
and the website shows the key on a thank-you page right after checkout. You only connect the accounts.

## 1. Deploy the helper server (once)
Render (free): https://render.com → New → **Blueprint** → this repo (`render.yaml`). Note the URL, e.g. `https://chordclicks-server.onrender.com`.
Then in Render → the service → **Environment**, add:

| Variable | Value |
|---|---|
| `LICENCE_PRIVATE_JWK` | the whole contents of your `licence-private.jwk` (one line) |
| `STRIPE_SECRET_KEY` | from Stripe → Developers → API keys (`sk_live_…`; use `sk_test_…` while testing) |
| `STRIPE_WEBHOOK_SECRET` | from step 3 (`whsec_…`) |
| `RESEND_API_KEY` | optional, from https://resend.com (free 3k emails/month) so keys are emailed automatically |
| `MAIL_FROM` | optional, e.g. `ChordClicks <keys@506clicks.ca>` (verify the domain in Resend) |
| `ADMIN_TOKEN` | any long random string; paste the same one into 506clicks.ca/admin to see orders and issue keys |
| `SITE_THANKS` | optional, `https://www.506clicks.ca/projects/chordclicks/thanks/` |

Check: `https://<your-server>/api/health` → `{"ok":true}`.

## 2. Stripe product + Payment Link
1. https://dashboard.stripe.com → Products → **Add product**: "ChordClicks Pro", one-time, $24.99 (CAD or USD).
2. Product → **Create payment link**. Under *After payment* choose **Don't show confirmation page** → redirect to
   `https://www.506clicks.ca/projects/chordclicks/thanks/?session_id={CHECKOUT_SESSION_ID}` (keep the placeholder exactly).
3. Copy the link (`https://buy.stripe.com/…`).

## 3. Webhook (key issued on every sale)
Stripe → Developers → **Webhooks** → Add endpoint → `https://<your-server>/api/stripe/webhook`,
events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy the **Signing secret** into
`STRIPE_WEBHOOK_SECRET` on Render and redeploy.

## 4. Point the buttons at it
* App: `src/js/pro.js` → `BUY_URL = 'https://buy.stripe.com/…'` (and `PRICE` if you change it). Rebuild / release.
* Website: `src/site/data.ts` → `CHORDCLICKS = { buy: 'https://buy.stripe.com/…', helper: 'https://<your-server>' }`.
  Also paste the helper address into the app's Settings → Helper server on phones/web so Ultimate Guitar works there.

## 5. Test with Stripe test mode
Use `sk_test_…`, a test Payment Link and card `4242 4242 4242 4242`. After paying you should land on the thank-you page
with a `CCPRO-…` key; `node scripts/licence.mjs verify <key>` prints VALID; the key unlocks Pro in the app.
Switch the three Stripe values to live when happy.

## Manual sales (no Stripe)
`node scripts/licence.mjs issue "Buyer Name" --email buyer@example.com` prints a key to send yourself.

## Square instead of Stripe?
Square Online payment links work for taking the money, but the automatic key step here is written for Stripe's
webhook format. With Square you'd issue keys manually from the order email, or ask for a Square webhook version.

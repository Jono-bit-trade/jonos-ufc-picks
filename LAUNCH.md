# Launching the paid site

The site is already built for paid plans. It has the Event Pass ($9.99, one card) and Monthly ($14.99) plans, a Pricing page, an Account page and locked picks for free visitors. A public picks file (`predictions_public.json`) with the paid fields removed is also in place. What's missing is the part that knows **who is paying**. This file lists what to set up when you're ready, in order.

## Why this is needed

GitHub Pages only serves files. Anything in `docs/` can be downloaded by anyone, including `docs/data/predictions.json`. Locking picks in the browser is fine for previewing. Once people pay, though, the full picks have to come from a server that checks their plan first.

## The pieces (all have free tiers to start)

| Job | Recommended | Why |
|---|---|---|
| Payments | **Stripe** (Checkout + Customer Portal) | Hosted checkout pages, so no card data touches the site. It handles both one-off payments (Event Pass) and subscriptions (Monthly), plus receipts and cancellations. |
| Sign-in | **Supabase Auth** (email magic link) | No passwords to store. Its free tier covers thousands of users. |
| Paid picks | **Supabase Edge Function** `picks` | Checks the visitor's plan, then returns the full `predictions.json`. |
| Plan records | Supabase table `access` | Filled in by Stripe's webhook. |

## Steps

1. **Domain.** Buy one (for example octagonedge.com) and point it at GitHub Pages. Payment providers and buyers trust a real domain more than a github.io address.
2. **Stripe.**
   - Create two products: *Event Pass* ($9.99, one-time) and *Monthly* ($14.99/month, recurring).
   - Turn on the Customer Portal so members can cancel on their own.
   - Add Terms and Privacy pages. Stripe requires them.
3. **Supabase.**
   - Create a project and turn on email magic-link sign-in.
   - Create the table `access(user_id, plan, event_date, expires_at, stripe_customer)`.
4. **Stripe webhook → Supabase function.** On `checkout.session.completed` and `customer.subscription.updated` or `deleted`, write or refresh the visitor's row in `access`. An Event Pass covers the card dated `event_date`. Monthly lasts until `expires_at`.
5. **Picks function.**
   - Move the full `predictions.json` out of `docs/`. The GitHub Action uploads it to Supabase Storage (private) instead.
   - The `picks` function reads the signed-in user's `access` row. It returns the full file to Monthly members, and to Event Pass holders for their card. Everyone else gets `predictions_public.json`.
6. **Site changes** (small, all in `docs/app.js`):
   - `myPlan()`: read the plan from the Supabase session instead of `localStorage`.
   - `getPred()`: fetch the `picks` function with the user's token instead of `predictions.json`.
   - Account page: add the sign-in form, "Manage subscription" (Stripe portal link) and the renewal date.
   - `docs/plans.json`: fill in each plan's `checkout_url`, then set `"paywall": true`.
7. **Test end to end** in Stripe test mode with its test cards:
   - Buy a pass and confirm only that card unlocks.
   - Subscribe, cancel, and confirm access ends at period end.
   - Confirm a signed-out visitor can't download the full picks.

## Already done

- Plans, prices, the free-sample rule and feature lists: `docs/plans.json`
- Locked picks, the free sample pick and lock overlays: `gatePredictions()`, `lockedPick()`
- Public picks file without paid fields, written every run: `predict.public_card()`
- Pricing and Account pages, and owner preview links (`#/account`)

## Accounts you'll need to create yourself

Stripe (needs your business and bank details), Supabase and a domain registrar. Claude can write and wire up all the code once these exist. Keys go in GitHub secrets and Supabase settings, never in the repo.

# Post-migration cleanup

Dead Dominion copies that no screen loaded were removed after a reachability check (`node scripts/admin-reachability.mjs`).

Still live, on purpose, until each product admin is verified and the 30-day notice is up:

- Rush merchant verification (`MerchantVerificationManager`) is still routed. Rush admin already has merchant management. Dominion switches to a moved notice in the customer-screen phase, then the copy is deleted after 30 days.
- Fare rules and surge cells were not loaded by any Dominion screen and have been deleted. They live in the Rides admin.

Do not delete a screen that is still in the sidebar.

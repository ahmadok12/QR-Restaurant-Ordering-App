# QR Restaurant Ordering - MVP

QR table ordering for restaurants, sold as a multi-restaurant SaaS. Guests scan the table QR, add to one shared table order from their own phones, and the restaurant receives it on the admin panel (PC or phone) or, if their plan includes it, on the waiter app.

---

## MVP apps

| App | File | What it does |
| :--- | :--- | :--- |
| **Customer portal** | `index.html` | Guest enters their name, browses the menu, and orders together with everyone at the table. Live cart, "Sara joined" / "Sara added 2× Karahi" alerts, only the host sends the first order, service bell (water, tissues, bill...). |
| **Restaurant admin** | `restaurant_admin.html` | Works on PC (sidebar) and phone (bottom bar). **Live** screen for new orders and service calls with sound, menu, tables, staff, QR codes, and the **Waiter app** on/off switch. |
| **Waiter app** (optional) | `waiter.html` | Only available when the restaurant's plan includes it **and** the restaurant admin has it switched on. |
| **Testing hub** | `hub.html` | Two guest phones, the admin panel and the waiter app side by side for testing. |

Not part of the MVP (kept in the repo, not linked): `cashier.html`, `kds.html`, `admin.html`. The platform owner's panel `super_admin.html` is still reachable by URL to create restaurants and choose whether the waiter app is in their plan.

---

## How it works

**Guest names and table host**
- The first time a phone opens the table QR, it asks the guest's name.
- The first person at an idle table becomes the **table host**. Later guests join the same table session and never reset the cart.
- A table session ends after 3 hours without activity, or when the bill is settled.

**Live table activity**
- Each dish in the cart shows who added it.
- Everyone else at the table gets an alert when someone joins, adds or removes a dish.
- Alerts arrive instantly over the live connection (SSE); the 2-second background check catches anything missed (for example when a phone screen was off). Each alert has a number, so nothing is shown twice.

**Optional waiter app**
- `features.waiterApp` on a restaurant: set by the super admin (is it in the plan?).
- `settings.waiterAppEnabled`: set by the restaurant admin in **Staff → Waiter app**.
- When it's off (or not in the plan): waiters can't log in, logged-in waiters are signed out, and new orders and service calls go to the admin **Live** screen.

---

## How to run and test

### 1. Start the server
Requires [Node.js](https://nodejs.org/):
```bash
node server.js
```
Opens on `http://localhost:3000`.

### 2. Open the testing hub
```text
http://localhost:3000/hub.html
```
Click **Reset table 07**, then follow the steps on the left.

Single customer phone: `http://localhost:3000/index.html?restaurantId=REST-001&table=07`
Add `&debug=1` to show the testing tools (switch host/guest role, reset order, advance status).

Demo logins:
- Restaurant admin: `owner@deragourmet.com` / `DeraAdmin#2026`
- Waiter: `hamza@deragourmet.com` / `Waiter#101`

### 3. Run the automated tests (server must be running)
```bash
node test_names_and_notifications.js   # guest names, host rules, join/add/remove alerts
node test_waiter_app_toggle.js         # waiter app plan + on/off switch, order routing, file protection
node test_multi_person_ordering.js
node test_cohost_realtime_sync.js
node test_billing_and_deals.js
node test_fraud_controls.js
node test_table_layouts.js
```
The tests write to `data/pos_db.json`. Run `git checkout data/pos_db.json` afterwards if you want the original demo data back.

---

## Security notes
- Server-authoritative pricing: client prices and totals are recalculated from the menu.
- The database file (`data/`), server code and tests are never served to browsers.
- Only the super admin can change which modules are in a restaurant's plan.

## Known limits before going live (next phases)
- Data is stored in one JSON file; tables are not yet separated per restaurant. Planned move to Supabase (Postgres) with per-restaurant data.
- Passwords are stored in plain text and some screens still read the full database through `/api/db`.
- Web push notifications for phones with the screen locked are not added yet; alerts work while the page is open.

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

On first start it creates `data/pos_db.json` with the demo restaurant (owner `owner@deragourmet.com` / `DeraAdmin#2026`, manager PIN `7788`). **Change these before real use.** The `data/` folder holds passwords and orders and is git-ignored; never commit it.

Optional environment variables:
- `AUTH_SECRET`: secret used to sign login tokens. If unset, a random one is generated and kept in `data/.auth_secret`.
- `DB_FILE`: path to the database file (default `data/pos_db.json`).
- `PORT`: port to listen on (default `3000`).

### 2. Open the testing hub
Each table's QR code carries a secret (`&t=...`), so a plain `?table=07` link no longer lets anyone order. The hub fetches the demo table's code for you; print real table QR codes from the restaurant admin portal (QR codes section).
```text
http://localhost:3000/hub.html
```
Click **Reset table 07**, then follow the steps on the left.

Single customer phone: open the hub's customer link (it includes the table's `&t=` code).

Demo logins:
- Restaurant admin: `owner@deragourmet.com` / `DeraAdmin#2026`
- Waiter: `hamza@deragourmet.com` / `Waiter#101`

### 3. Run the automated tests
```bash
node run_tests.js
```
This starts the server against a throwaway database on port 3000 and runs every suite (fraud controls, table layouts, billing and deals, multi-person ordering, co-host sync, guest names and table alerts, optional waiter app, order controls, reports and feedback, security). Your real `data/pos_db.json` is never touched.

---

## 🛡️ Anti-Fraud & Security Controls
- **Server-Authoritative Pricing**: Client-side prices or totals are discarded; recalculations strictly enforce catalog pricing.
- **Segregation of Duties**: Cashier portal cannot void bills. Order voids require managerial override.
- **Blind Cash Count**: Till shift closings require cashiers to count cash blindly before revealing over/short variance.
- **Immutable Audit Trail**: All financial events (orders, voids, settlements, shift reconciliations) are permanently logged.
- **Locked-Down API**: Every admin, staff and menu change requires a login token for the right role, and restaurant admins can only change their own restaurant.
- **Hashed Secrets**: Passwords and manager PINs are stored as scrypt hashes and never returned by the API. Plaintext values in an existing database are converted on startup.
- **Brute-Force Limits**: 10 failed logins per account in 15 minutes, and 5 wrong manager PINs lock voids for that restaurant for 15 minutes.
- **No Guest-Set Prices**: Orders containing items that are not on the restaurant's menu are rejected.
- **Private Data Files**: Only the app's HTML pages are served; the database, server code and tests are not downloadable.

## ✅ Order Controls (customer → waiter → kitchen → cashier)
- **Waiter confirms every guest order**: a guest's order arrives as a pending round. The waiter confirms it at the table, can lower quantities or drop a wrong item, or rejects it with a reason the guest sees. Only confirmed items reach the kitchen and the bill. Owners can turn this off; rounds over 10 items always need a waiter.
- **Table QR secrets**: every table QR carries a secret. Orders, carts and the service bell need it, unknown tables are refused, and the owner can issue a new code for a table (old printed codes stop working). Optionally, a waiter must open a table before guests can order.
- **Server-owned tickets**: ticket ids, status and prices come from the server. A guest's later orders are added as new rounds to the same table ticket; earlier rounds cannot be changed.
- **Limits**: at most 20 of one item per line, 30 lines per round, one round per phone every 5 seconds; sold-out dishes are refused.
- **Status only moves forward** (New → In Kitchen → Plated & Ready → Served). Only the cashier settles, and a settled bill cannot be voided or changed. Paying closes the table session, so the next guests start fresh.
- **Removing items**: removing a confirmed item needs a reason; once the kitchen has started, a waiter also needs the manager PIN. Removed items stay on the record, struck through.
- **Exceptions report**: the admin portal lists voids, removed items, rejected rounds and failed PIN attempts per waiter, plus served-but-unpaid orders and tables reset without an invoice, with a CSV export.
- **Pause ordering**: the owner can pause all ordering with a message, or switch off online orders.

## ✨ Portal Features
- **Customer menu**: review step with a 5-second undo, live "waiting for waiter / confirmed" status, estimated ready time, request the bill (cash, card or bank transfer) and an itemised bill, star rating with comments saved for the owner, server-synced sold-out dishes, dietary filter chips, Urdu / English toggle.
- **Waiter app**: sound and vibration alerts for new orders and service calls (with mute), bill-requested badges, reconnect banner, larger text and touch targets, installable from the home screen.
- **Restaurant admin**: Reports tab with sales by day, dish, payment method and waiter (CSV export) plus guest feedback; "Sold out today" toggle per dish; dish photos are resized and compressed in the browser before upload.

## Known limits before going live (next phases)
- Data is stored in one JSON file; tables are not yet separated per restaurant. Planned move to Supabase (Postgres) with per-restaurant data.
- Web push notifications for phones with the screen locked are not added yet; alerts work while the page is open.

# Dera Gourmet - Full-Stack QR Restaurant Ordering & Floor Management App

A modern, institutional restaurant operating suite built for friction-free guest ordering, kitchen workflow automation, anti-fraud cashier controls, and interactive visual floor plan customization.

---

## 🍽️ Portals & Architecture

| Portal | File | Description |
| :--- | :--- | :--- |
| **Customer Portal** | `index.html` | Scannable QR Table Ordering for guests. Dynamic table switching, menu exploration, custom spice/size options, real-time order tracking, and service bells. |
| **Restaurant Admin** | `restaurant_admin.html` | Interactive 2D Visual Floor Plan Designer (drag-and-drop), full menu creator with dish images & sizes, staff management, and printable QR tent cards. |
| **Cashier Terminal** | `cashier.html` | Anti-fraud cash drawer: float opening, blind closing cash count, variance reconciliation, authoritative settlement, and sequential invoicing (`INV-YYYY-XXXXX`). |
| **Waiter Console** | `waiter.html` | Section-based table occupancy, service call alerts, order punching, and food pickup notifications. |
| **Kitchen Display (KDS)** | `kds.html` | Real-time chef ticket production screen with station routing. |
| **Super Admin** | `super_admin.html` | Multi-tenant restaurant subscription management and live immutable audit trail inspector. |
| **Testing Hub** | `hub.html` | 1-click launcher to open all portals in synchronized testing tabs. |

---

## 🚀 How to Run & Test

### 1. Launch the Backend Server
Requires [Node.js](https://nodejs.org/):
```bash
node server.js
```
The server will start on `http://localhost:3000`.

On first start it creates `data/pos_db.json` with the demo restaurant (owner `owner@deragourmet.com` / `DeraAdmin#2026`, manager PIN `7788`). **Change these before real use.** The `data/` folder holds passwords and orders and is git-ignored; never commit it.

Optional environment variables:
- `AUTH_SECRET`: secret used to sign login tokens. If unset, a random one is generated and kept in `data/.auth_secret`.
- `DB_FILE`: path to the database file (default `data/pos_db.json`).
- `PORT`: port to listen on (default `3000`).

### 2. Test the Customer Portal
Each table's QR code carries a secret (`&t=...`), so a plain `?table=04` link no longer lets anyone order. Print table QR codes from the restaurant admin portal (Tables / QR section), or open the Testing Hub, which fetches the demo table's code for you to launch customer, kitchen, waiter, and cashier side-by-side:
```text
http://localhost:3000/hub.html
```

### 3. Run Automated Tests
```bash
node run_tests.js
```
This starts the server against a throwaway database on port 3000 and runs every suite (fraud controls, table layouts, billing and deals, multi-person ordering, co-host sync, order controls, reports and feedback, security). Your real `data/pos_db.json` is never touched.

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

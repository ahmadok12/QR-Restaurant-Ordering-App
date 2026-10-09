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
Open in your browser:
```text
http://localhost:3000/index.html?restaurantId=rest-dera-01&table=04
```
Or open the Testing Hub to launch customer, kitchen, waiter, and cashier side-by-side:
```text
http://localhost:3000/hub.html
```

### 3. Run Automated Tests
```bash
node run_tests.js
```
This starts the server against a throwaway database on port 3000 and runs every suite (fraud controls, table layouts, billing and deals, multi-person ordering, co-host sync, security). Your real `data/pos_db.json` is never touched.

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

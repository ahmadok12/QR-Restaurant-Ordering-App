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
node test_fraud_controls.js    # 33 institutional security & audit tests
node test_table_layouts.js     # 22 table customization & floor layout tests
```

---

## 🛡️ Anti-Fraud & Security Controls
- **Server-Authoritative Pricing**: Client-side prices or totals are discarded; recalculations strictly enforce catalog pricing.
- **Segregation of Duties**: Cashier portal cannot void bills. Order voids require managerial override.
- **Blind Cash Count**: Till shift closings require cashiers to count cash blindly before revealing over/short variance.
- **Immutable Audit Trail**: All financial events (orders, voids, settlements, shift reconciliations) are permanently logged.

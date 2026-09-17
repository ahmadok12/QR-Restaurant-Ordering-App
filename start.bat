@echo off
title QR Restaurant Ordering App Ecosystem
echo ======================================================
echo    QR RESTAURANT MULTI-APP ECOSYSTEM (6 MOBILE APPS)
echo ======================================================
echo.
echo 1. Super Admin Panel:     http://localhost:3000/super_admin.html
echo 2. Restaurant Admin App:  http://localhost:3000/restaurant_admin.html
echo 3. Cashier Mobile POS:    http://localhost:3000/cashier.html
echo 4. Waiter Floor App:      http://localhost:3000/waiter.html
echo 5. Kitchen Display (KDS): http://localhost:3000/kds.html
echo 6. Customer Mobile Menu:  http://localhost:3000/index.html?table=04
echo.
echo Launching Interactive Testing Hub & Mobile Simulator...
start "" "http://localhost:3000/hub.html"
node server.js
pause

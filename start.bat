@echo off
title QR Restaurant Ordering MVP
echo ======================================================
echo    QR RESTAURANT ORDERING - MVP
echo ======================================================
echo.
echo 1. Testing Hub:        http://localhost:3000/hub.html
echo 2. Customer Portal:    http://localhost:3000/index.html?restaurantId=REST-001^&table=07
echo 3. Restaurant Admin:   http://localhost:3000/restaurant_admin.html
echo 4. Waiter App (opt.):  http://localhost:3000/waiter.html
echo.
echo Launching Testing Hub...
start "" "http://localhost:3000/hub.html"
node server.js
pause

# Testing on a phone

The dev server forwards `/api` and `/socket.io` to the backend (see `campus-shuttle-frontend/vite.config.js`),
so the phone only ever talks to **port 3000**. Nothing else needs forwarding, and the backend's
`ALLOWED_ORIGINS` never needs a tunnel URL or IP.

Start both servers on the PC first:

    abu-shuttle-backend:        npm run dev      (PORT=5000 in its .env)
    campus-shuttle-frontend:    npm run dev

## Option A: dev tunnel (https, GPS works, no cable)

1. VS Code: Ports panel > Forward a Port > `3000`.
2. Right-click the row > Port Visibility > **Public**. Private tunnels make the phone sign in first.
3. Open the forwarded `https://...devtunnels.ms` URL on the phone.

## Option B: ADB (localhost, GPS works)

1. Install Android platform-tools and add the folder to your PATH, so `adb` works in any terminal.
2. Connect the phone.
   - USB: enable USB debugging and accept the prompt on the phone.
   - Wi-Fi (when the USB prompt never appears): Developer options > Wireless debugging > Pair device with pairing code, then
     `adb pair <ip>:<pairing-port>` and `adb connect <ip>:<port>`.
3. Run `npm run adb` in `campus-shuttle-frontend` (it runs `adb reverse tcp:3000 tcp:3000`).
4. On the phone open `http://localhost:3000`. To see its console: Chrome on the PC > `chrome://inspect/#devices`.

Run `npm run adb` again after reconnecting the phone; the reverse is dropped when the connection drops.

## Option C: same Wi-Fi, no tools (no GPS)

Open `http://<your-PC-IP>:3000` on the phone. Browsers block location on plain http addresses, so "Share my location"
and the driver GPS will show a message explaining why. Allow port 3000 through the PC firewall if it will not load.
Note that this exposes the dev server to everyone on that network.

## If something fails

| Symptom | Cause / fix |
|---|---|
| `ERR_CONNECTION_REFUSED` on login | The page is calling `localhost` on the phone. Make sure you are running this version (API base is `/api/v1`), then hard-refresh. |
| `Blocked request. This host is not allowed` | The tunnel host is not in `server.allowedHosts` in `vite.config.js` (`.devtunnels.ms` is already allowed). |
| Login or data returns 502/504 | Backend is not running on the port set as `BACKEND` in `vite.config.js` (default 5000). |
| Page loads but the map is empty | The phone has no internet for map tiles. |
| "Location needs a secure connection" | You are on plain http. Use Option A or B. |
| ADB shows `offline` / `unauthorized` | Re-accept the debugging prompt, or switch to Wi-Fi pairing above. |

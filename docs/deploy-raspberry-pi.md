# Running the chore app natively on the Raspberry Pi

This moves the kitchen chore app off the PC so the Pi is self-contained (server + display)
and works even when the PC is off. The code comes from GitHub; the family's data and images
come from the `chores-pi-transfer.zip` bundle created on the PC.

Throughout, `~/chores` is the app folder on the Pi and `$USER` is your Pi login. Adjust if you
prefer a different location.

## What you're transferring

- **Code** → `git clone` from GitHub (always current).
- **`chores-pi-transfer.zip`** (on the PC Desktop) → the SQLite database (`data/chores.db`,
  already WAL-checkpointed and complete) plus the runtime image folders
  (`public/chore-images`, `public/gold-chore-images`, `public/member-photos`). These are NOT in git.
- **`GOOGLE_API_KEY`** → copy the value from the PC's `.env.local` (used for AI chore-image generation).

---

## 0. Check the Pi first

On the Pi terminal:

```bash
uname -m            # aarch64 = 64-bit (best); armv7l = 32-bit
cat /etc/os-release # note VERSION_CODENAME (e.g. bookworm)
node --version 2>/dev/null || echo "no node yet"
```

Tell me the output if anything looks unusual; the steps below assume 64-bit Raspberry Pi OS
(Bookworm). better-sqlite3 has ready-made binaries for 64-bit; on 32-bit it compiles from source
(step 2 installs the build tools either way).

## 1. Install prerequisites

```bash
sudo apt update
sudo apt install -y git build-essential python3 chromium-browser
# Node 20 LTS (Next.js 14 needs Node >= 18.17)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version      # expect v20.x
```

## 2. Get the code

```bash
git clone https://github.com/ngissing/chores.git ~/chores
cd ~/chores
npm ci
# If better-sqlite3 errors on 32-bit or a Node mismatch, force a rebuild:
npm rebuild better-sqlite3
```

## 3. Bring the data + images across

Copy `chores-pi-transfer.zip` from the PC to the Pi (USB stick, or from the PC:
`scp "%USERPROFILE%\Desktop\chores-pi-transfer.zip" $USER@<pi-ip>:~/`). Then on the Pi:

```bash
cd ~/chores
unzip -o ~/chores-pi-transfer.zip -d ~/chores
# This drops data/chores.db and the public/*-images folders into place,
# merging over the empty placeholders from the clone.
ls -la data/chores.db
ls public/chore-images | head
```

## 4. Environment file

```bash
cat > ~/chores/.env.production.local <<'EOF'
GOOGLE_API_KEY=PASTE_YOUR_GOOGLE_API_KEY_HERE
DB_PATH=/home/USER/chores/data/chores.db
PORT=3000
NODE_ENV=production
EOF
# Fix the username in DB_PATH, then paste your key:
sed -i "s#/home/USER/#$HOME/#" ~/chores/.env.production.local
nano ~/chores/.env.production.local   # replace PASTE_YOUR_GOOGLE_API_KEY_HERE
```

Get the key value from the PC's `C:\Users\Nick Gissing\Claude Code\.env.local` (the `GOOGLE_API_KEY` line).

## 5. Build and test once

```bash
cd ~/chores
npm run build
npm start            # then open http://localhost:3000 in a browser on the Pi
```

Confirm your members, points, streaks, chore images, and admin PIN all appear. Then `Ctrl+C` to stop.

## 6. Auto-start the server on boot (systemd)

```bash
sudo tee /etc/systemd/system/chores.service >/dev/null <<EOF
[Unit]
Description=Family chore app
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/chores
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now chores.service
systemctl status chores.service --no-pager   # should be "active (running)"
curl -s http://localhost:3000/api/settings >/dev/null && echo "serving OK"
```

## 7. Kiosk display on boot

Disable screen blanking (works across Pi OS versions):

```bash
sudo raspi-config    # → Display Options → Screen Blanking → Disable
```

Launch Chromium fullscreen at the dashboard on login via an XDG autostart entry (honoured by
both the older LXDE and Bookworm's labwc/wayfire desktops):

```bash
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/chores-kiosk.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Chores Kiosk
Exec=chromium-browser --kiosk --incognito --noerrordialogs --disable-infobars --check-for-update-interval=31536000 http://localhost:3000
X-GNOME-Autostart-enabled=true
EOF
```

(If `chromium-browser` isn't found, the binary may be `chromium` — adjust the Exec line.)

## 8. Reboot and verify

```bash
sudo reboot
```

On reboot the Pi should boot straight into the chore dashboard, served locally, with no PC needed.
To test the new countdown overlay any time: tap ⚙ → your PIN → Countdown → 👁 Preview now.

---

## Updating later

When you change the app on GitHub:

```bash
cd ~/chores
git pull
npm ci
npm run build
sudo systemctl restart chores.service
```

The database and images stay put (they're gitignored), so updates never touch your data.

## Notes

- Only `GOOGLE_API_KEY` is needed; `OPENAI_API_KEY` is not used by the app.
- The database is served from `DB_PATH`; keep regular copies of `~/chores/data/chores.db` as backups.
- The PC can stop serving chores once the Pi is confirmed working; the calendar (port 3001) is
  unaffected and still served from the PC.

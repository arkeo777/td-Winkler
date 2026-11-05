# Internet Switch

One tap to turn internet **on or off** for the kids' devices, without digging
through the UniFi app. Uses the same **Block / Unblock** that the UniFi app uses.

- Big green/red buttons, one per device (green = internet ON, red = OFF)
- **All off / All on** buttons
- Works on your phone (add it to your home screen) and on your desktop
- Protected by a PIN so the kids can't flip themselves back on

It's a small program that runs on a computer at home and talks to your UniFi
gateway. It only needs Python, nothing else.

---

## Setup (about 10 minutes, one time)

### 1. Make a local UniFi login for the switch

The switch can't use your ui.com cloud login (the one with 2-step
verification). Make a separate local account:

1. Open your UniFi console in a browser (usually `https://192.168.1.1`) or
   unifi.ui.com.
2. Go to **Settings → Admins & Users → Create New** (exact wording varies by version).
3. Turn on **Restrict to Local Access Only**.
4. Username `internet-switch`, pick a password, give it access to the
   **Network** app as **Site Admin** (or "Full Management").

### 2. Install Python on the computer that will run it

Pick a computer that stays on most of the time. It *can* be one of the kids'
computers. Blocking only cuts the internet, so the switch still reaches the
UniFi gateway. But that computer has to be powered on for the switch to work.

- **Windows:** install from <https://www.python.org/downloads/> and tick
  **"Add python.exe to PATH"** during install.
- **Mac:** Python 3 is usually already installed. If not, use the same link.

### 3. Fill in the settings

1. Copy this `internet-switch` folder onto that computer.
2. Copy `config.example.json` to **`config.json`** and open it in Notepad.
3. Set:
   - `pin`: the PIN you'll type on your phone the first time
   - `unifi.url`: your gateway's address (usually `https://192.168.1.1`)
   - `unifi.username` / `unifi.password`: the local account from step 1

### 4. Point it at the right devices

Open a terminal (Windows: Command Prompt) in the folder and run:

```
python internet_switch.py --find
```

That prints every device UniFi knows, with its name and MAC address. In
`config.json`, set each device's `"match"` to the **exact name UniFi shows**:

```json
{ "label": "Levi's Laptop", "icon": "💻", "match": "LEVI-PC" }
```

You can use a MAC address instead (`"mac": "aa:bb:cc:dd:ee:ff"`). If a device
appears more than once (for example Wi-Fi and a network cable), list both:
`"macs": ["aa:..", "bb:.."]`.

`label` is what appears on the button, so name it anything you like.

### 5. Start it

- **Windows:** double-click **`Start Internet Switch.bat`**
- **Mac:** double-click **`start-internet-switch.command`**

A window opens showing two addresses. Leave that window open (you can minimize it).

---

## The desktop button

- **Windows:** right-click `Start Internet Switch.bat` → **Send to → Desktop
  (create shortcut)**. Double-click it any time to open the switch.
- To have it start automatically: press `Win + R`, type `shell:startup`, and
  put a shortcut to the `.bat` file in the folder that opens.

## The phone button

1. Make sure your phone is on your home Wi-Fi.
2. Open the **"On your phone"** address shown in the window
   (e.g. `http://192.168.1.50:8787`).
3. Enter your PIN once.
4. **iPhone:** Share button → **Add to Home Screen**.
   **Android:** ⋮ menu → **Add to Home screen**.

Now it's an icon on your home screen: tap it, tap a device, done.

> **Tip:** in the UniFi app, give the computer running the switch a
> **Fixed IP** so the phone address never changes.

---

## Good to know

- **Works only at home** (on your Wi-Fi). To use it away from home, turn on
  UniFi's built-in **Teleport VPN** on your phone first, and it'll work the same.
- **"Not found in UniFi"** on a button means the `match` name or MAC doesn't
  match. Run `--find` again and copy the name exactly.
- **A laptop keeps showing up as a new device?** It may be using a "private"
  / random MAC address. On Windows: Wi-Fi settings → your network → turn off
  **Random hardware addresses**. Otherwise blocking won't stick.
- The password is stored in `config.json` on that computer only, and
  `config.json` is never uploaded to GitHub (it's in `.gitignore`).
- The tiny dot on each button lights up when the device is currently connected.
- **Xboxes:** turn off **"Use random MAC address"** if it's on
  (Settings → General → Network settings → Advanced settings), so the block sticks.

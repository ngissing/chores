# HA Kitchen Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a sleek, adaptive light/dark Mushroom-based Home Assistant Lovelace dashboard for a 13" landscape kitchen touchscreen covering lights, climate, vacuum, and a conditional doorbell camera section.

**Architecture:** A single HA Sections-view dashboard with two columns (lights + doorbell left, climate + vacuum right). Mushroom cards provide the visual layer. The Caule theme with a sunrise/sunset automation handles adaptive theming. The doorbell camera section uses a built-in `conditional` card so it only appears when motion/person detection is active.

**Tech Stack:** Home Assistant (2024.1+), Lovelace YAML mode, HACS, mushroom (piitaya/lovelace-mushroom), Caule theme

---

## Before you start — find your entity IDs

Every entity ID below is a placeholder. Before writing any YAML, open **Developer Tools → States** in HA and note your real IDs for:

| Placeholder | What to look for |
|-------------|-----------------|
| `light.kitchen_ceiling` | Your kitchen ceiling light entity |
| `light.under_cabinet` | Under-cabinet light entity |
| `light.hallway` | Hallway light entity |
| `climate.thermostat` | Thermostat entity |
| `sensor.indoor_temperature` | Indoor temperature sensor |
| `sensor.indoor_humidity` | Indoor humidity sensor |
| `binary_sensor.doorbell_motion` | Doorbell motion or person-detected binary sensor |
| `camera.doorbell` | Doorbell camera entity |
| `vacuum.roomba` | Robot vacuum entity |

Add any extra light entities you have — each gets its own `mushroom-light-card`.

---

## Task 1: Install Mushroom cards via HACS

**Files:** No files — UI steps in HA

- [ ] **Step 1: Open HACS in HA**

  Navigate to **HACS → Frontend** in your HA sidebar.

- [ ] **Step 2: Search and install Mushroom**

  Search for `Mushroom`. Click the result (by `piitaya`). Click **Download**. Accept the default version. Confirm download.

- [ ] **Step 3: Reload browser resources**

  After download completes, HA will prompt you to reload the browser. Do so. Alternatively go to **Developer Tools → YAML → Check and Restart** (not needed, just reload the browser tab).

- [ ] **Step 4: Verify install**

  In HA go to **HACS → Frontend** — Mushroom should now appear as installed with a version number.

---

## Task 2: Install Caule theme via HACS

**Files:** No files — UI steps in HA

- [ ] **Step 1: Search for Caule in HACS**

  Go to **HACS → Frontend**, search `Caule`. Click the result by `orickcorner`. Click **Download**.

- [ ] **Step 2: Enable themes in configuration.yaml**

  Open your HA `configuration.yaml` (via **Settings → System → Edit configuration.yaml** or File Editor addon) and ensure this line exists. If it's already there, skip:

  ```yaml
  frontend:
    themes: !include_dir_merge_named themes
  ```

- [ ] **Step 3: Restart HA**

  Go to **Settings → System → Restart**. Wait for HA to come back online.

- [ ] **Step 4: Verify theme is available**

  Go to your HA profile (bottom-left avatar icon) → **Theme** dropdown. You should see `Caule` options (Caule, Caule Dark, etc.) listed.

---

## Task 3: Create adaptive theme automation

**Files:** Edit via HA Automations UI or `automations.yaml`

This automation switches the HA theme at sunrise (light) and sunset (dark) for all users.

- [ ] **Step 1: Create a new automation**

  Go to **Settings → Automations & Scenes → Create Automation → Create new automation**.

- [ ] **Step 2: Set up the sunrise trigger (switch to light theme)**

  Click **Add Trigger → Sun → Sunrise**. Leave offset at 0.

- [ ] **Step 3: Add action for light theme**

  Click **Add Action → Call Service**. Search for `frontend.set_theme`. Set:
  - Theme: `Caule`

- [ ] **Step 4: Add sunset trigger**

  Click **Add Trigger** again → **Sun → Sunset**.

- [ ] **Step 5: Add condition to split triggers**

  Rather than two automations, use an `if/then` action. After the sunrise trigger action, add a second **If-Then** action block:
  - If: `trigger.id` equals `sunset` (set trigger IDs: name the sunrise trigger `sunrise`, sunset trigger `sunset`)
  - Then: Call service `frontend.set_theme` with Theme: `Caule Dark`

  Alternatively, create two separate automations — one for sunrise (theme: `Caule`) and one for sunset (theme: `Caule Dark`). Two automations is simpler and less error-prone.

- [ ] **Step 6: Save and test**

  Save the automation(s). Manually trigger each via the **Run** button in the automation editor to confirm the theme switches correctly.

---

## Task 4: Create the dashboard YAML

**Files:** New Lovelace dashboard created in HA UI, then edited in YAML mode

- [ ] **Step 1: Create a new dashboard**

  Go to **Settings → Dashboards → Add Dashboard**. Name it `Kitchen`. Set URL slug to `kitchen`. Choose icon `mdi:chef-hat`. Enable **Admin only** if you don't want other users editing it. Save.

- [ ] **Step 2: Open dashboard and switch to YAML edit mode**

  Open the Kitchen dashboard. Click the three-dot menu (top right) → **Edit dashboard** → three-dot menu again → **Raw configuration editor**.

- [ ] **Step 3: Paste the full dashboard YAML**

  Replace all existing content with the YAML below. **Substitute every placeholder entity ID** with your real ones from the list at the top of this plan before pasting.

  ```yaml
  views:
    - title: Kitchen
      type: sections
      sections:

        - cards:
            - type: heading
              heading: Lights
              heading_style: title

            - type: custom:mushroom-light-card
              entity: light.kitchen_ceiling
              name: Kitchen ceiling
              show_brightness_control: true
              use_light_color: true
              fill_container: false

            - type: custom:mushroom-light-card
              entity: light.under_cabinet
              name: Under cabinet
              show_brightness_control: true
              use_light_color: true
              fill_container: false

            - type: custom:mushroom-light-card
              entity: light.hallway
              name: Hallway
              show_brightness_control: true
              use_light_color: true
              fill_container: false

            - type: heading
              heading: Front door
              heading_style: title

            - type: conditional
              conditions:
                - condition: state
                  entity: binary_sensor.doorbell_motion
                  state: "on"
              card:
                type: picture-glance
                entity: camera.doorbell
                camera_image: camera.doorbell
                title: Doorbell
                entities: []

        - cards:
            - type: heading
              heading: Climate
              heading_style: title

            - type: custom:mushroom-climate-card
              entity: climate.thermostat
              show_temperature_control: true
              hvac_modes:
                - heat
                - cool
                - heat_cool
                - "off"
              fill_container: false

            - type: horizontal-stack
              cards:
                - type: custom:mushroom-template-card
                  primary: "{{ states('sensor.indoor_temperature') }}°C"
                  secondary: Indoor temp
                  icon: mdi:thermometer
                  icon_color: blue
                  fill_container: true

                - type: custom:mushroom-template-card
                  primary: "{{ states('sensor.indoor_humidity') }}%"
                  secondary: Humidity
                  icon: mdi:water-percent
                  icon_color: cyan
                  fill_container: true

            - type: heading
              heading: Vacuum
              heading_style: title

            - type: custom:mushroom-vacuum-card
              entity: vacuum.roomba
              actions:
                - action: start
                - action: pause
                - action: return_to_base
              fill_container: false
  ```

- [ ] **Step 4: Save**

  Click **Save** in the raw config editor. HA will validate the YAML — fix any reported errors (usually mismatched entity IDs or indentation).

---

## Task 5: Verify the dashboard

**Files:** None — browser checks

- [ ] **Step 1: View on desktop first**

  Navigate to `/kitchen` in your browser. Confirm:
  - Two columns appear side by side
  - All lights show with toggle + name
  - Thermostat card shows current temp and target
  - Temp and humidity chips appear in a horizontal row
  - Vacuum card shows state and three action buttons
  - Doorbell section is **not visible** (motion sensor is off)

- [ ] **Step 2: Test the conditional doorbell card**

  Temporarily force `binary_sensor.doorbell_motion` to `on` via **Developer Tools → States** (set state to `on`). Confirm the doorbell camera card appears in the left column. Set it back to `off`.

- [ ] **Step 3: Test theme switching**

  Manually trigger each theme automation via **Settings → Automations** → Run. Confirm the dashboard switches between Caule (light) and Caule Dark.

- [ ] **Step 4: Open in kiosk display**

  Open the iframe URL in your kiosk app pointed at `/kitchen`. Confirm the layout fills the 13" screen without horizontal scroll or clipping.

- [ ] **Step 5: Test touch controls**

  On the touchscreen: tap a light to toggle, tap-hold a light to get brightness slider, tap vacuum action buttons, confirm they respond correctly.

---

## Optional Task 6: Add mini-graph-card sparklines (if you want trend history)

Only do this if you want small temperature/humidity history graphs instead of plain chip values.

- [ ] **Step 1: Install mini-graph-card via HACS**

  Go to **HACS → Frontend**, search `mini-graph-card` (by `kalkih`). Download and reload browser.

- [ ] **Step 2: Replace mushroom template chips with mini-graph-card**

  In the raw YAML editor, replace the `horizontal-stack` section under Climate with:

  ```yaml
  - type: horizontal-stack
    cards:
      - type: custom:mini-graph-card
        entities:
          - entity: sensor.indoor_temperature
        name: Indoor temp
        hours_to_show: 24
        points_per_hour: 2
        line_color: var(--info-color)
        fill: false

      - type: custom:mini-graph-card
        entities:
          - entity: sensor.indoor_humidity
        name: Humidity
        hours_to_show: 24
        points_per_hour: 2
        line_color: var(--primary-color)
        fill: false
  ```

- [ ] **Step 3: Save and verify**

  Save. Confirm both sparkline graphs render with 24h history on the climate section.

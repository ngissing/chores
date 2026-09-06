# Home Assistant Kitchen Dashboard — Design Spec

**Date:** 2026-06-16

## Overview

A sleek, touch-friendly Home Assistant Lovelace dashboard displayed on a 13" landscape touchscreen in the kitchen via iframe/kiosk app. Covers lights, climate, vacuum, and doorbell camera. No media controls.

## Theme & Adaptive Appearance

- Install **Caule** theme from HACS (has distinct light and dark variants)
- Create a HA automation triggered at sunrise/sunset to switch between `Caule` light and dark
- No manual toggle needed — fully automatic

## Layout

**Dashboard type:** `sections` (built-in HA 2024.x view type, no extra card needed)

**Grid:** 2 columns, optimised for 13" landscape (approx. 1280×800 or similar)

### Left column

**Section: Lights**
- One `mushroom-light-card` per light entity
- Shows entity name + on/off toggle
- Tap-hold opens brightness slider
- Entities (to be filled with real entity IDs): kitchen ceiling, under cabinet, hallway (+ any others)

**Section: Front door**
- Wrapped in a `conditional` card
- Condition: doorbell motion sensor OR person-detected binary sensor = `on`
- Card shown: `picture-glance` using the doorbell camera entity
- Hidden entirely when nothing is detected (saves space)

### Right column

**Section: Climate**
- `mushroom-climate-card` for the thermostat entity
  - Shows current temperature, target temperature, and current mode (heat/cool/off)
- Two `mushroom-template-card` chips below:
  - Indoor temperature (from temp sensor entity)
  - Indoor humidity (from humidity sensor entity)

**Section: Vacuum**
- `mushroom-vacuum-card` for the robot vacuum entity
- Shows: current state (docked/cleaning/returning) + battery percentage
- Quick-action buttons: Start, Pause, Return to dock

## Custom Cards Required (install via HACS Frontend)

| Card | Purpose |
|------|---------|
| `mushroom` | All mushroom-* card types (light, climate, vacuum, template) |
| `mini-graph-card` | Optional: sparkline trend on temp/humidity chips |

## Entity Placeholder Mapping

The following entity IDs need to be substituted when the YAML is written:

| Slot | Description |
|------|-------------|
| `light.kitchen_ceiling` | Kitchen ceiling light |
| `light.under_cabinet` | Under-cabinet light |
| `light.hallway` | Hallway light |
| `climate.thermostat` | Main thermostat |
| `sensor.indoor_temperature` | Indoor temp sensor |
| `sensor.indoor_humidity` | Indoor humidity sensor |
| `binary_sensor.doorbell_motion` | Doorbell motion/person trigger |
| `camera.doorbell` | Doorbell camera feed |
| `vacuum.roomba` | Robot vacuum |

## Implementation Notes

- Dashboard is YAML mode (edit raw YAML in HA, not the visual editor)
- The `sections` view type requires HA 2024.1 or later
- Mushroom cards install as a single HACS frontend repository (`piitaya/lovelace-mushroom`)
- The conditional doorbell section uses HA's built-in `conditional` card — no extra dependency
- Entity IDs above are placeholders; actual IDs depend on how devices were added in HA

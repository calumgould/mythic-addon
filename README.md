# Mythic Addon Module

This is an addon module for the Mythic system, which can be found here https://github.com/AugmenTab/mythic

Currently based on the Mythic v6.3 rulebook.

## Installation

Enter this as the "Manifest URL" when installing modules on Foundry:
https://github.com/calumgould/mythic-addon/releases/latest/download/module.json

If you just want the macro to copy and paste into your game you get find it here -> [damageCalculator.js](src/scripts/macros/damageCalculator.js)

## Current Features

### Damage Calculator

Macro that reads the latest attack from the chat messages and calculates the damage that the selected token takes (falls back to the current character if no token is selected).

This is still early in development and I'm still fairly new to the Mythic system, so there's definitely a lot of missing interactions, and you could see unexpected results if your case isn't covered below.

#### Features

So far the logic covers the basics, plus:
- Burst fire (multiple damage instances on one hit)
- Energy shields
- Weapon special rules:
  - Headshot
  - Penetrating
  - Kinetic
  - Blast
  - Various special rules that do bonus damage against energy shields
- Vehicle damage (beta)


Also includes some extra options on the form:
- Whisper result
  - This option will send the result as a whisper to the player who triggered the macro instead of a public message.
- Hide damage results
  - This options with hide the remaining values of the target, the damage will still be shown.
- Damage multiplier (e.g. from kill radius on a grenade)
- Extra pierce (e.g. from a charge attack)
- Areas of target being in cover
- Hitting multiple breakpoints on a vehicle, e.g. with blast
- Ignore certain hits (e.g. evading)

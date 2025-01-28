# Mythic Addon Module

This is an addon module for the Mythic system, which can be found here https://github.com/AugmenTab/mythic

Specifically based on the Mythic 6.3 rules

## Install

Enter this as the "Manifest URL" when installing modules on Foundry:
https://github.com/calumgould/mythic-addon/releases/latest/download/module.json

If you just want the macro to copy and paste into your game you get find it here -> [damageCalculator.js](src/scripts/macros/damageCalculator.js)

### Current Features

#### Damage Calculator

Macro that reads the latest attack from the chat messages and calculates the damage that the selected token or current character takes.

This is still early in development and is likely missing a lot of interactions that should be specifically handled.

So far the logic covers the basics, plus:
- Ignore certain hits (e.g. evading)
- Headshots (weapons with headshot special rule)
- Burst fire (multiple damage instances on one hit)
- Energy shields
- Areas of target being in cover
- Extra pierce (e.g. from a charge attack)
- Damage multiplier (e.g. from kill radius on a grenade)

Also includes:
- Whisper result
  - This option will send the result as a whisper to the player who triggered the macro instead of publicly.

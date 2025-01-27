## Mythic Addon Module

This is an addon module for the Mythic system, which can be found here https://github.com/AugmenTab/mythic

### Current Features

#### Damage Calculator

Macro that reads the latest attack from the chat messages and calculates the damage that the selected token or current character takes.

This is still early in development and is likely missing a lot of interactions that should be specifically handled.

So far the logic covers the basics, plus:
- Ignore certain hits (e.g. evading)
- Headshots (weapons with headshot special rule)
- Burst fire (multiple damage instances on one hit)
- Shields (including some weapons adding their pierce to shield damage)
- Areas of target being in cover
- Extra pierce (e.g. from a charge attack)
- Damage multiplier (e.g. from kill radius on a grenade)

Also includes:
- Whisper result
  - This option will send the result as a whisper to the player who triggered the macro instead of publicly.

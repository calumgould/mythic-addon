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

## Development

### Local Development

In order to test this without needing to create a new release everytime you'd need to test changes to this module on Foundry, you can create a symlink to the `dist` folder in your Foundry modules.

#### Windows

Open PowerShell as an admin and run:
```shell
New-Item -ItemType SymbolicLink -Target "$(pwd)\dist" -Path "$env:LOCALAPPDATA\FoundryVTT\Data\modules\mythic-addon"
```

#### MacOS

Open your preferred Terminal client and run:
```
ln -s $PWD/dist $HOME/Library/Application\ Support/FoundryVTT/Data/modules/mythic-addon
```

Once this is done, the module should show up in your Foundry client and reflect the code you have locally.

To test any changes you make now, follow the below steps:
1. Close Foundry
2. Run `yarn build`
3. Re-open Foundry

Now the module should have updated for your local changes.

### Creating a new release

Update the version in `package.json` and `module.json`
First run

```shell
npm run build
```

Then bundling the macro itself takes a bit more work.

1. Create the macro in Foundry, then right click and export the JSON.
2. Update `src/packs/macros-mythic.json` with what you exported.
3. Commit those changes and you're ready to make a release!

Go to [Releases](https://github.com/calumgould/mythic-addon/releases) and create a new release.

The github workflow should take care of the rest and add the final bundle files to the release once it completes.
import fs from 'fs-extra'
import path from 'path'

const embedMacros = () => {
    const damageCalculatorMacro = {
      _id: 'mythic-damage-calculator',
      name: 'Damage Calculator',
      type: 'script',
      scope: 'global',
      img: "modules/mythic-addon/assets/calculator.svg",
      command: fs.readFileSync('src/scripts/macros/damageCalculator.js', 'utf8'),
    };

    const batchDamageCalculatorMacro = {
        _id: 'mythic-batch-damage-calculator',
        name: 'Ordnance Damage Calculator',
        type: 'script',
        scope: 'global',
        img: "modules/mythic-addon/assets/airstrike.svg",
        command: fs.readFileSync('src/scripts/macros/batchDamageCalculator.js', 'utf8'),
      };

    fs.writeFileSync(
      path.resolve('src/packs/macros-mythic.json'),
      JSON.stringify([damageCalculatorMacro, batchDamageCalculatorMacro], null, 2)
    );
  }

embedMacros();
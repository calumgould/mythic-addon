import fs from 'fs'
import path from 'path'

const createMacros = async () => {
    console.log("Creating macros")
    const damageCalculatorCommand = fs.readFileSync(path.join(__dirname, '../scripts/macros/damageCalculator.js'), 'utf-8');

    console.log("Command", damageCalculatorCommand)

    const damageCalculatorMacro = await Macro.create({
        name: 'Damage Calculator Macro',
        type: 'script',
        command: damageCalculatorCommand,
        img: "icons/svg/d20.svg",
        permission: { default: 0 },
        author: 'Calum Gould'
    })

    console.log("Macro created", damageCalculatorMacro)

    const compendium = await game.packs.get('mythic-addon.mythic-addon-macros');

    console.log("Compendium", compendium)

    await compendium.importEntity(damageCalculatorMacro)
}

Hooks.on("init", async () => {
    await createMacros()
    console.log("Mythic-addon module loaded")
});

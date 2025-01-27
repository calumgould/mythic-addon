const createDamageCalculatorMacro = async () => {
    console.log("Creating macros")

    const existingDamageCalculatorMacro = game.macros.find((macro: any) => macro.name === 'Damage Calculator Macro')

    console.log("Existing macro", existingDamageCalculatorMacro)

    const damageCalculatorMacro = await Macro.create({
        name: 'Damage Calculator Macro',
        type: 'script',
        command: 'console.log("Damage Calculator Macro");',
        img: "icons/svg/d20.svg",
        permission: { default: 0 },
        author: 'Calum Gould'
    })

    console.log("Macro created", damageCalculatorMacro)

    const compendium = await game.packs.get('mythic-addon.mythic-addon-macros');

    console.log("Compendium", compendium)

    await compendium.importEntity(damageCalculatorMacro)
}

Hooks.on("init", async (data: any) => {
    console.log("Init data", data)
    await createDamageCalculatorMacro()
    console.log("Mythic-addon module loaded")
});

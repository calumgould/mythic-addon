const createMacros = async () => {
    console.log("Creating macros")

    const testMacro = await Macro.create({
        name: 'Mythic addon test macro',
        type: 'script',
        command: "console.log('This is a Mythic test macro');",
        img: "icons/svg/d20.svg",
        permission: { default: 0 }
    })

    console.log("Macro created", testMacro)

    const compendium = await game.packs.get('mythic-addon.mythic-addon-macros');

    console.log("Compendium", compendium)

    await compendium.importEntity(testMacro)
}

Hooks.on("init", async () => {
    await createMacros()
    console.log("Mythic-addon module loaded")
});

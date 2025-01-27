const createMacros = async () => {
    const testMacro = await Macro.create({
        name: 'Mythic addon test macro',
        type: 'script',
        command: "console.log('This is a Mythic test macro');",
        img: "icons/svg/d20.svg",
        permission: { default: 0 }
    })

    const compendium = await game.packs.get('mythic-addon.mythic-addon-macros');
    await compendium.importEntity(testMacro)
}

Hooks.on("init", async () => {
    await createMacros()
    console.log("Mythic-addon module loaded")
});

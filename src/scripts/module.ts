Hooks.on("setup", () => {
    console.log("Foundry setup");
});

Hooks.on("ready", async () => {
    console.log('game', game);
    console.log('canvas', canvas);
});

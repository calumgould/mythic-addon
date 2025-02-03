const rollDice = (dice) => {
    const roll = new Roll(dice).evaluate({ async: false })
    return roll.total
}

const calculateDamage = ({ actor, damage, pierce, damageMultiplier }) => {
    const armour = actor.system.armor
    const shields = actor.system.shields.value

    const lowestArmour = Math.min(...Object.values(armour).map(part => part.resistance))

    let remainingDamage = damage * damageMultiplier

    let shieldDamage = 0
    let woundDamage = 0

    if (shields > 0) {
        if (shields >= remainingDamage) {
            shieldDamage = remainingDamage
            remainingDamage = 0
        } else {
            shieldDamage = shields
            remainingDamage -= shields
        }
    }

    if (remainingDamage > 0) {
        remainingDamage += pierce
        remainingDamage -= lowestArmour

        if (remainingDamage > 0) {
            woundDamage = remainingDamage
        }
   }

    return { shieldDamage, woundDamage }
}

const calculateBatchDamage = async ({ damageRoll, pierce, damageMultiplier }) => {
    const selectedTokens = canvas.tokens.controlled

    if (!selectedTokens.length) {
        ui.notifications.error('No tokens selected.')
        return
    }

    if (selectedTokens.some((token) => token.actor.type === 'Vehicle')) {
        ui.notifications.error('Vehicles not supported.')
        return
    }

    const damage = rollDice(damageRoll)

    if (!damage) {
        ui.notifications.error('Invalid damage roll.')
        return
    }

    const tokensToUpdate = selectedTokens.map(async (token, index) => {
        const { shieldDamage, woundDamage } = calculateDamage({ actor: token.actor, damage, pierce, damageMultiplier })

        await token.actor.update({
            "system.wounds.value": token.actor.system.wounds.value - woundDamage,
            "system.shields.value": token.actor.system.shields.value - shieldDamage
        })

        if (token.actor.system.wounds.value <= 0) {
            return `[${index + 1}] ${token.actor.name} is dead.`
        } else if (shieldDamage > 0) {
            return `[${index + 1}] ${token.actor.name} took ${shieldDamage} shield damage and ${woundDamage} wound damage.`
        } else {
            return `[${index + 1}] ${token.actor.name} took ${woundDamage} wound damage.`
        }
    })

    const messages = await Promise.all(tokensToUpdate)

    const chatMessage = messages.join('<br>')

    ChatMessage.create({
        user: game.user._id,
        speaker: ChatMessage.getSpeaker(),
        content: chatMessage,
    });
}

const requiredSection = `
<fieldset class="form-section">
    <legend>Required Inputs</legend>
    <label class='input-label'>
        Damage Roll
        <input type="text" name="damageRoll" placeholder="e.g. 4d10 + 24" />
    </label>

    <label class='input-label'>
        Pierce
        <input type="number" name="pierce" value="0" />
    </label>
</fieldset>
`

const damageModifiersSection = `
<fieldset class="form-section">
    <legend>Damage Modifiers</legend>
    <label class='input-label'>
        Damage Multiplier
        <input type="number" name="damageMultiplier" class="damage-multiplier-input" value="1" />
    </label>
</fieldset>
`

const formSection = `
<form class='form'>
    ${requiredSection}
    ${damageModifiersSection}
</form>
`

const dialogStyles = `
<style>
    .form {
        margin-bottom: 5px;
        display: flex;
        flex-direction: column;
        gap: 5px;
    }
    .form-section {
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
        gap: 10px;
    }
    .input-label {
        display: flex;
        align-items: center;
        gap: 10px;
        white-space: nowrap;
    }
</style>
`;

new Dialog({
    title: 'Ordnance Batch Damage Calculator',
    content: `
        ${dialogStyles}
        ${formSection}
    `,
    buttons:{
        confirm: {
            icon: "<i class='fas fa-check'></i>",
            label: "Calculate",
            callback: async (html) => {
                const damageRoll = html.find("input[name='damageRoll']").val()
                const pierce = parseInt(html.find("input[name='pierce']").val(), 10)
                const damageMultiplier = parseInt(html.find("input[name='damageMultiplier']").val(), 10)

                await calculateBatchDamage({ damageRoll, pierce, damageMultiplier })
            },
        },
        cancel: {
            label: 'Cancel'
        }
    }
}).render(true);
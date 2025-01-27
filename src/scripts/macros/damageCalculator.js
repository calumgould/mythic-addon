const parser = new DOMParser();

const TRAITS_ADD_PIERCE_AGAINST_SHIELDS = ['Penetrating', 'Spread', 'Cauterize', 'Kinetic', 'Blast and Kill Radius', 'Carpet']

const hitLocationMap = {
    'Head': 'head',
    'Right Arm': 'rightArm',
    'Right Leg': 'rightLeg',
    'Chest': 'chest',
    'Left Arm': 'leftArm',
    'Left Leg': 'leftLeg'
}

const getSelectedToken = () => canvas.tokens.controlled[0]

const getCharacter = () => {
    const user = game.user

    // If there's an active selected token then use that as the character, if not use the user's character
    const selectedToken = getSelectedToken()

    if (selectedToken) {
        const tokenActorId = selectedToken.document.actorId
        const selectedCharacter = game.actors.find((actor) => actor._id === tokenActorId)

        return selectedCharacter
    }

    if (!user.character) {
        console.error('No character found for user')
    }

    return user.character
}

const isNamedCharacter = (character) => character.type === 'Named Character'

const getLastAttackFromChat = () => {
    // Find last attack in chat messages
    const chatMessages = game.messages.contents.reverse()
    const lastAttackMessage = chatMessages.find((msg) => msg.flavor.includes('Attack'))

    return lastAttackMessage
}

const extractDataForHits = (htmlString) => {
    const parsedHtml = parser.parseFromString(htmlString, 'text/html');

    const hits = Array.from(parsedHtml.querySelectorAll('.post-attack div'))
    .filter(attacks => attacks.querySelector('.damage-block'))
    .map(hit => {
        const hitOutcome = hit.querySelector('.outcome')

        // the hitNumber is the first p tag in the outcome div
        const hitTag = hitOutcome.querySelector('p')
        const hitNumber = hitTag.textContent.trim() || '?'

        const damageBlock = hit.querySelector('.damage-block')

        const additions = damageBlock.querySelector('.damage-block p').textContent.trim();

        const pierceMatch = additions.match(/Pierce\s(\d+)/);
        const pierce = pierceMatch ? pierceMatch[1] : null;

        const locationMatch = additions.match(/:\s([a-zA-Z\s-]+)\s-/);
        const location = locationMatch ? locationMatch[1].trim() : null;

        const rollResults = damageBlock.querySelectorAll('.inline-roll.inline-result')

        const damageInstances = Array.from(rollResults).map((result) => {
            const damage = result.textContent.trim();

            return {
                damage: parseInt(damage, 10),
                pierce: parseInt(pierce, 10),
                location,
            }
        })

        return {
            hitNumber: parseInt(hitNumber, 10),
            damageInstances
        }
    });

    return hits
}

const handleWeaponSpecialRules = (weaponSpecialRules) => {
    // If the weapon has certain special rules, when damaging shields it adds the weapon's pierce to the damage
    const weaponAddsPierceAgainstShields = weaponSpecialRules.some(trait => TRAITS_ADD_PIERCE_AGAINST_SHIELDS.includes(trait))
    const weaponHasHeadshotSpecialRule = weaponSpecialRules.includes('Headshot')

    return {
        weaponAddsPierceAgainstShields,
        weaponHasHeadshotSpecialRule
    }
}

const calculateDamage = ({ damage, pierce, location, resistance, weaponTraits, coverLocations, coverPoints, shields }) => {
    const mappedHitLocation = hitLocationMap[location]
    const applyHeadshot = location === 'Head' && weaponTraits.weaponHasHeadshotSpecialRule
    const isHitLocationInCover = coverLocations[mappedHitLocation]

    // When a weapon has the headshot special rule, it ignores the toughness modifier when calculating resistance
    let resistanceAtHitLocation = applyHeadshot ? resistance[mappedHitLocation].protection : resistance[mappedHitLocation].resistance

    // If location being hit is in cover, add the cover points to the overall resistance
    if (isHitLocationInCover) {
        resistanceAtHitLocation += coverPoints
    }

    // If the target has shields then the damage should be applied to the shields first
    if (shields > 0) {
        const { shieldDamage, armourDamage } = calculateShieldDamage({ damage, pierce, weaponTraits, shields })

        // If no damage got through to the target's armour, we don't need to do anything else
        if (armourDamage <= 0) {
            return { shieldDamage, woundDamage: 0 }
        }

        // If the shield is depleted, the remaining damage goes through to the target's armour, the normal resistances apply but pierce does not apply since it was already applied to the shield damage
        const damageThroughResistance = (resistanceAtHitLocation > armourDamage)
            ? 0
            : armourDamage - resistanceAtHitLocation

        return { shieldDamage, woundDamage: damageThroughResistance }
    }

    // If the pierce is greater than the damage resistance, it shouldn't add any damage. Instead it pierces through the target to whatever is behind and should be handled separately.
    const effectiveResistance = pierce > resistanceAtHitLocation
        ? 0
        : (resistanceAtHitLocation - pierce)

    const damageThroughResistance = damage - effectiveResistance

    return { shieldDamage: 0, woundDamage: damageThroughResistance }
}

const calculateShieldDamage = ({ damage, pierce, weaponTraits, shields }) => {
    const damageToShields = weaponTraits.weaponAddsPierceAgainstShields
        ? damage + pierce
        : damage

    // If the shield health is greater than the damage, then the shields absorb all the damage and we don't need to do anything else
    if (shields > damageToShields) {
        return { shieldDamage: damageToShields, armourDamage: 0 }
    }

    // If shields would be depleted, the remaining damage goes through to the target's armour
    let damageThroughToArmour = damageToShields - shields

    // If pierce was added to the damage against shields, it no longer applies when damage spills through to the target's armour
    // Pierce is also applied first to the shields, before any of the base damage
    if (weaponTraits.weaponAddsPierceAgainstShields) {
        const remainingPierce = pierce - shields

        if (remainingPierce > 0) {
            damageThroughToArmour -= remainingPierce
        }
    }

    return { shieldDamage: shields, armourDamage: damageThroughToArmour }
}

const generateChatMessage = ({ characterName, remainingShields, remainingWounds, totalDamage, hasShields }) => {
    // Target took no damage
    if (totalDamage <= 0) {
        if (hasShields) {
            return `${characterName} took no damage. They still have ${remainingShields} shields and ${remainingWounds} wounds.`
        } else {
            return `${characterName} took no damage. They still have ${remainingWounds} wounds.`
        }
    }

    // Target has been downed
    if (remainingWounds <= 0) {
        if (hasShields) {
            return `${characterName} is down! They took ${totalDamage} damage. They have ${remainingShields} shields and ${remainingWounds} wounds.`
        } else {
            return `${characterName} is down! They took ${totalDamage} damage. They have ${remainingWounds} wounds.`
        }
    }

    // Target took some damage
    if (hasShields) {
        return `${characterName} took ${totalDamage} damage. They have ${remainingShields} shields and ${remainingWounds} wounds remaining.`
    } else {
        return `${characterName} took ${totalDamage} damage. They have ${remainingWounds} wounds remaining.`
    }
}

const applyDamage = ({ remainingWounds, remainingShields }) => {
    const character = getCharacter()

    if (isNamedCharacter(character)) {
        character.update({
            "system.wounds.value": remainingWounds,
            "system.shields.value": remainingShields
        })
    } else {
        // If it's a minion, just update the wounds of the token since multiple minions can have the same character sheet
        const selectedToken = getSelectedToken()
        selectedToken.actor.update({
            "system.wounds.value": remainingWounds,
            "system.shields.value": remainingShields
        })
    }
}

// Html for the dialog
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
    .checkbox-group {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }
    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 5px;
    }
    .checkbox-label input[type="checkbox"] {
        margin: 0;
    }
    .location-checkbox-label {
        width: calc(33.33% - 10px);
    }
    .input-label {
        display: flex;
        align-items: center;
        gap: 10px;
        white-space: nowrap;
    }
</style>
`;

const hitLocationFormOptions = Object.entries(hitLocationMap).map(([key, value]) => ({ name: value, label: key }))

const coverLocationOptions = hitLocationFormOptions
    .map((location) => `
        <label class="location-checkbox-label checkbox-label">
            <input type="checkbox" name="coverLocation" value="${location.name}" />
            ${location.label}
        </label>
    `)
    .join("");

const coverLocationsSection = `
        <fieldset class="form-section">
            <legend>Locations in Cover</legend>
            <div class="checkbox-group">
                ${coverLocationOptions}
            </div>
        </fieldset>
`

const whisperResultSection = `
<fieldset class="form-section">
    <legend>Options</legend>
    <label class="checkbox-label">
        <input type="checkbox" name="whisperResult" value="whisperResult" />
        Whisper Result
    </label>
</fieldset>
`

const resistanceModifiersSection = `
<fieldset class="form-section">
    <legend>Resistance Modifiers</legend>
    <label class='input-label'>
        Cover Points
        <input type="number" name="coverPoints" class="cover-points-input" value="0" />
    </label>

    <label class='input-label'>
        Extra Pierce
        <input type="number" name="extraPierce" class="extra-pierce-input" value="0" />
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

const hitsSection = `
<fieldset class="form-section">
    <legend>Hits</legend>
    <div class="damage-instances-container">
        <!-- Dynamically generated checkboxes will render here -->
    </div>
</fieldset>
`

const formSection = `
<form class='form'>
    ${whisperResultSection}
    ${resistanceModifiersSection}
    ${damageModifiersSection}
    ${coverLocationsSection}
    ${hitsSection}
</form>
`

new Dialog({
    title: 'Damage Calculator',
    content: `
        ${dialogStyles}
        ${formSection}
    `,
    buttons:{
      confirm: {
        icon: "<i class='fas fa-check'></i>",
        label: "Calculate",
        callback: (html) => {
            const character = getCharacter()

            if (!character) {
                console.error('No character selected or found for user.')
                return
            }

            const isNamedCharacter = character.type === 'Named Character'
            const selectedToken = getSelectedToken()
            const callsign = character.name.match(/"([^"]+)"/)
            const characterName = callsign ? callsign[1] : character.name

            // If it's a minion, get data from the token since multiple minions can have the same character sheet
            const resistance = isNamedCharacter ? character.system.armor : selectedToken.actor.system.armor
            const currentWounds = isNamedCharacter ? character.system.wounds.value : selectedToken.actor.system.wounds.value
            const hasShields = isNamedCharacter ? !!character.system.shields.max : !!selectedToken.actor.system.shields.max
            const currentShields = isNamedCharacter ? character.system.shields.value : selectedToken.actor.system.shields.value

            // Parse all the form data inputs
            // Options
            const whisperResult = html.find("input[name='whisperResult']").is(':checked')
            // Resistance modifiers
            const coverPoints = parseInt(html.find("input[name='coverPoints']").val(), 10);
            const extraPierce = parseInt(html.find("input[name='extraPierce']").val(), 10);

            // Damage modifiers
            const damageMultiplier = parseInt(html.find("input[name='damageMultiplier']").val(), 10);

            // Cover Locations
            const coverLocationInputs = html.find("input[name='coverLocation']")

            // Hits
            const hits = html.find("input[name='hits']")

            const coverLocations = coverLocationInputs.toArray().reduce((curr, el) => {
                const location = el.value;
                curr[location] = el.checked;
                return curr;
            }, {});

            const appliedHits = hits.toArray().reduce((curr, el) => {
                const hit = el.value;
                curr[hit] = el.checked;
                return curr;
            }, {});

            const lastAttackMessage = getLastAttackFromChat()

            // Extract data from the last attack
            const hitData = extractDataForHits(lastAttackMessage.content)
            const lastAttackHtml = parser.parseFromString(lastAttackMessage.content, 'text/html');

            // Get weapon traits from weapon used in the attack
            const weaponSpecialRules = Array.from(lastAttackHtml.querySelectorAll('aside.special .special-rule'))
                .map(span => span.textContent.trim());
            const weaponTraits = handleWeaponSpecialRules(weaponSpecialRules)

            const hitResult = hitData.reduce((acc, curr) => {
                const { hitNumber, damageInstances } = curr

                if (!appliedHits[hitNumber]) {
                    // if hit wasn't checked we don't calculate damage, this could be because it was evaded for example
                    return acc
                }

                // Each hit can have multiple instances of damage, e.g burst fire so we need to loop over all of them
                const damageResults = damageInstances.reduce((acc, curr) => {
                    const { damage, pierce, location } = curr

                    // Handle any extra pierce being applied form the form, e.g. from a charge
                    const totalPierce = pierce + extraPierce

                    // Handle any damage multipliers being applied from the form, e.g. from a grenade's kill radius
                    const totalDamage = damage * damageMultiplier

                    const { shieldDamage, woundDamage } = calculateDamage({
                        damage: totalDamage,
                        pierce: totalPierce,
                        location,
                        resistance,
                        weaponTraits,
                        coverLocations,
                        coverPoints,
                        shields: acc.remainingShields
                    })

                    acc.totalDamage += shieldDamage
                    acc.totalDamage += woundDamage
                    acc.remainingShields -= shieldDamage
                    acc.remainingWounds -= woundDamage

                    return acc
                }, { totalDamage: 0, remainingWounds: acc.remainingWounds, remainingShields: acc.remainingShields })

                acc.totalDamage += damageResults.totalDamage
                acc.remainingWounds = damageResults.remainingWounds
                acc.remainingShields = damageResults.remainingShields

                return acc
            }, { totalDamage: 0, remainingWounds: currentWounds, remainingShields: currentShields })

            const { totalDamage, remainingWounds, remainingShields } = hitResult

            const chatMessage = generateChatMessage({ characterName: characterName, remainingShields, remainingWounds, totalDamage, hasShields })

            applyDamage({ remainingWounds, remainingShields })

            ChatMessage.create({
                user: game.user._id,
                speaker: ChatMessage.getSpeaker(),
                content: chatMessage,
                // If the user wants the result to be private, only they will see the message
                whisper: whisperResult ? [game.user._id] : null
            });
        }
      },
      cancel: {
        label: 'Cancel'
      }
    },
    render: (html) => {
        const damageInstancesContainer = html.find('.damage-instances-container');

        const lastAttackMessage = getLastAttackFromChat()
        const hitData = extractDataForHits(lastAttackMessage.content)

        hitData.forEach((hit) => {
            const { hitNumber, damageInstances } = hit;

            const damageText = damageInstances.map(({ damage }) => damage).join(', ')
            // Pierce should be the same for all damage instances of a single hit, e.g using burst fire
            const pierce = damageInstances[0].pierce
            const hitLocation = damageInstances[0].location

            const label = $(`
                <label class="checkbox-label">
                    <input type="checkbox" name="hits" value="${hitNumber}" checked />
                    Hit ${hitNumber} || ${damageText} Damage | Pierce ${pierce} | ${hitLocation}
                </label>`
            );

            damageInstancesContainer.append(label);
        });
    }
  }).render(true);
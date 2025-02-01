const parser = new DOMParser();

const hitLocationMap = {
    'Head': 'head',
    'Right Arm': 'rightArm',
    'Right Leg': 'rightLeg',
    'Chest': 'chest',
    'Left Arm': 'leftArm',
    'Left Leg': 'leftLeg',
}

const vehicleHitLocationMap = {
    'Engine': 'eng',
    'Hull': 'hull',
    'Mobility': 'mob',
    'Optics': 'op',
    'Weapon': 'wep'
}

// Should be a string format like '1d10' or '1d6 + 2', etc.
const rollDice = (dice) => {
    const roll = new Roll(dice).evaluate({ async: false})
    return roll.total
}

const calculateHitLocation = (hitRoll) => {
    if (hitRoll >= 1 && hitRoll <= 10) return "Head";
    if (hitRoll >= 11 && hitRoll <= 20) return "Left Arm";
    if (hitRoll >= 21 && hitRoll <= 30) return "Right arm";
    if (hitRoll >= 31 && hitRoll <= 45) return "Left Leg";
    if (hitRoll >= 46 && hitRoll <= 60) return "Right Leg";
    if (hitRoll >= 61 && hitRoll <= 100) return "Chest";
}

const getSelectedToken = () => {
    const selectedTokens = canvas.tokens.controlled

    if (selectedTokens.length > 1) {
        console.warn('More than one token selected, the first one selected will be used. If you get unexpected results please only select one token.')
    }

    return selectedTokens[0]
}

const getTarget = () => {
    const selectedToken = getSelectedToken()

    // If user selected a token, use that token's data
    if (selectedToken) {
        return { token: selectedToken, actor: selectedToken.actor }
    }

    // If no token is selected, try and fallback to the user's character
    if (!game.user.character) {
        console.error('No target found. Please select a token.')
    }

    const actor = game.user.character
    const tokens = actor.getActiveTokens()

    if (tokens.length > 1) {
        console.warn('More than one active token found for character, the first one will be used. If you get unexpected results please select a specific token instead.')
    }

    return { actor, token: tokens[0] }
}

const getLastAttackFromChat = () => {
    // Find last attack in chat messages
    const chatMessages = game.messages.contents.reverse()
    const lastAttackMessage = chatMessages.find((msg) => msg.flavor.includes('Attack'))

    return lastAttackMessage
}

// This function extracts the data from the html string of the last attack message, then loops over each hit and extracts the damage instances, with damage, pierce and hit location
const extractDataForHits = (htmlString) => {
    const parsedHtml = parser.parseFromString(htmlString, 'text/html');

    const hits = Array.from(parsedHtml.querySelectorAll('.post-attack div'))
    .filter(attacks => attacks.querySelector('.damage-block'))
    .map(hit => {
        // hitOutcome is a div that contains the number number
        const hitOutcome = hit.querySelector('.outcome')

        const hitTags = hitOutcome.querySelectorAll('p')
        // the hitNumber is the first p tag in the outcome div
        const hitNumber = hitTags[0].textContent.trim() || '?'
        // the hitNumber is the third p tag in the outcome div
        const hitRollMatch = hitTags[2].textContent.trim().match((/^\d{1,3}/))
        const hitRoll = hitRollMatch ? hitRollMatch[0] : 0

        // damageBlock is a div that contains the damage instances, pierce and location
        const damageBlock = hit.querySelector('.damage-block')

        const additions = damageBlock.querySelector('.damage-block p').textContent.trim();

        // Look through the element for pierce
        const pierceMatch = additions.match(/Pierce\s(\d+)/);
        const pierce = pierceMatch ? pierceMatch[1] : null;

        // Look through the element for location
        const locationMatch = additions.match(/:\s*([\p{L}\s-]+?)(?=\s*-|\n|$)/u);
        const location = locationMatch ? locationMatch[1].trim() : null;

        const rollResults = damageBlock.querySelectorAll('.inline-roll.inline-result')

        // Loop over each damage instance and extract the damage
        // If there are multiple damage instances, e.g. burst fire, the pierce and hit location are the same so we can just use the above values
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
            hitRoll: parseInt(hitRoll, 10),
            damageInstances
        }
    });

    return hits
}

const handleWeaponSpecialRules = (weaponSpecialRules) => {
    // If the weapon has any of these special rules, when damaging energy shields it adds the weapon's pierce to the damage
    // Penetrating weapons also fall into this category but they are handled separately
    const specialRuleAddPierceAgainstShield = ['Spread', 'Cauterize', 'Kinetic', 'Blast', 'Kill', 'Carpet']

    const addsPierceAgainstEnergyShields = weaponSpecialRules.some(trait => specialRuleAddPierceAgainstShield.includes(trait))

    /*
        The headshot special rule means that the target does not add their toughness modifier to their resistance.
    */
    const headshot = weaponSpecialRules.includes('Headshot')

    /*
        The kinetic special rule does a couple of things:
        - Deals damage against the target without pierce if they have energy shields.
        - If the target does not have energy shields, the attack adds 1D10 damage.
    */
    const kinetic = weaponSpecialRules.includes('Kinetic')

    /*
        The penetrating special rule does a couple of things:
            - Deals pierce * 3 damage against energy shields or pierce * 5 if the weapon also has 'Blast' or 'Kill' special rules.
            - Deals damage * 2 and pierce * 2 against cover points and physical shields.
        This extra damage does not carry through to wounds.
    */
    const penetrating = weaponSpecialRules.includes('Penetrating')

    const blast = weaponSpecialRules.includes('Blast')
    const kill = weaponSpecialRules.includes('Kill')

    return {
        addsPierceAgainstEnergyShields,
        headshot,
        kinetic,
        penetrating,
        blast,
        kill
    }
}

const calculateDamage = ({ damage, pierce, location, resistance, weaponSpecialRules, coverLocations, coverPoints, energyShields }) => {
    const mappedHitLocation = hitLocationMap[location]
    const applyHeadshot = location === 'Head' && weaponSpecialRules.headshot
    const isHitLocationInCover = coverLocations[mappedHitLocation]

    let resistanceAtHitLocation = resistance[mappedHitLocation].resistance

    // Protection is the armour without toughness modifier applied
    if (applyHeadshot) {
        resistanceAtHitLocation = resistance[mappedHitLocation].protection
    }

    // Blast weapons always hit the location with the lowest armour
    // Locations in cover should not be considered for the damage
    if (weaponSpecialRules.blast) {
        const locationsNotInCover = Object.entries(resistance).filter(([location]) => !coverLocations[location])
        const lowestResistanceNotInCover = Math.min(...Object.values(locationsNotInCover).map(([_, armour]) => armour.resistance));

        resistanceAtHitLocation = lowestResistanceNotInCover
    }

    // If location being hit is in cover, add the cover points to the overall resistance
    if (isHitLocationInCover) {
        resistanceAtHitLocation += coverPoints
    }

    // If the target has energy shields then the damage should be applied to the shields first
    if (energyShields > 0) {
        const { shieldDamage, armourDamage } = calculateEnergyShieldDamage({
            damage,
            pierce,
            weaponSpecialRules,
            energyShields,
            isHitLocationInCover,
            coverPoints
        })

        let damageToArmour = armourDamage

        // Kinetic weapons also deal damage to the armour through energy shields
        if (weaponSpecialRules.kinetic) {
            damageToArmour += damage
        }

        // If no damage got through to the target's armour, we don't need to do anything else
        if (damageToArmour <= 0) {
            return { shieldDamage, woundDamage: 0 }
        }

        // Any damage through to armour after damaging energy shields does not benefit from pierce so it isn't applied here
        const damageThroughResistance = (resistanceAtHitLocation > damageToArmour)
            ? 0
            : damageToArmour - resistanceAtHitLocation

        return { shieldDamage, woundDamage: damageThroughResistance }
    }

    // If the pierce is greater than the damage resistance, it shouldn't add any damage. Instead it pierces through the target to whatever is behind and should be handled separately.
    const effectiveResistance = pierce > resistanceAtHitLocation
        ? 0
        : (resistanceAtHitLocation - pierce)

    let damageBeforeResistance = damage

    // Kinetic weapons deal additional damage against unshielded targets
    if (weaponSpecialRules.kinetic) {
        const extraKineticDamage = rollDice('1d10')
        damageBeforeResistance += extraKineticDamage
    }

    const damageThroughResistance = damageBeforeResistance - effectiveResistance

    // Make sure we don't apply negative damage which would give them wounds
    if (damageThroughResistance <= 0) {
        return { shieldDamage: 0, woundDamage: 0 }
    }

    return { shieldDamage: 0, woundDamage: damageThroughResistance }
}

const calculateEnergyShieldDamage = ({ damage, pierce, weaponSpecialRules, energyShields, isHitLocationInCover, coverPoints }) => {
    let damageToShields = damage
    let pierceDamageToShields = 0

    if (weaponSpecialRules.addsPierceAgainstEnergyShields) {
        pierceDamageToShields += pierce
    }

    // Penetrating weapons do their pierce * 3 or 5 damage against energy shields
    if (weaponSpecialRules.penetrating) {
        if (weaponSpecialRules.blast || weaponSpecialRules.kill) {
            pierceDamageToShields = pierce * 5
        } else {
            pierceDamageToShields = pierce * 3
        }
    }

    damageToShields += pierceDamageToShields

    // Cover still applies when damaging energy shields, so we need to reduce the damage by the coverPoints value if the target is in cover
    const effectiveDamage = isHitLocationInCover
        ? damageToShields - coverPoints
        : damageToShields

    // If the shield health is greater than the damage, then the energy shields absorb all the damage and we don't need to do anything else
    if (energyShields > effectiveDamage) {
        return { shieldDamage: effectiveDamage, armourDamage: 0 }
    }

    // If energy shields would be depleted, the remaining damage goes through to the target's armour
    let damageThroughToArmour = effectiveDamage - energyShields

    // If pierce was added to the damage against energy shields, it no longer applies when damage spills through to the target's armour
    // Pierce is also applied first to the energy shields, before any of the base damage
    if (weaponSpecialRules.addsPierceAgainstEnergyShields) {
        const remainingPierce = pierceDamageToShields - energyShields

        if (remainingPierce > 0) {
            damageThroughToArmour -= remainingPierce
        }
    }

    return { shieldDamage: energyShields, armourDamage: damageThroughToArmour }
}

const generateChatMessage = ({ actorName, remainingShields, remainingWounds, totalDamage, shieldDamage, woundDamage, hasShields }) => {
    // Target took no damage
    if (totalDamage <= 0) {
        if (hasShields) {
            return `${actorName} took no damage. They still have ${remainingShields} energy shields and ${remainingWounds} wounds.`
        } else {
            return `${actorName} took no damage. They still have ${remainingWounds} wounds.`
        }
    }

    // Target has been downed
    if (remainingWounds <= 0) {
        if (hasShields) {
            return `${actorName} is down! They took ${shieldDamage} shield damage and ${woundDamage} wound damage. They have ${remainingShields} energy shields and ${remainingWounds} wounds.`
        } else {
            return `${actorName} is down! They took ${woundDamage} damage. They have ${remainingWounds} wounds.`
        }
    }

    // Target took some damage
    if (hasShields) {
        return `${actorName} took ${shieldDamage} shield damage and ${woundDamage} wound damage. They have ${remainingShields} energy shields and ${remainingWounds} wounds remaining.`
    } else {
        return `${actorName} took ${totalDamage} damage. They have ${remainingWounds} wounds remaining.`
    }
}

const applyDamage = ({ target, remainingWounds, remainingShields }) => {
    target.update({
        "system.wounds.value": remainingWounds,
        "system.shields.value": remainingShields
    })
}

const handleHit = ({ hitData, appliedHits, extraPierce, damageMultiplier, resistance, weaponSpecialRules, coverLocations, coverPoints, currentWounds, currentShields, actor, whisperResult, hasShields }) => {
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
                weaponSpecialRules,
                coverLocations,
                coverPoints,
                energyShields: acc.remainingShields
            })

            acc.totalDamage += shieldDamage
            acc.totalDamage += woundDamage
            acc.woundDamage += woundDamage
            acc.shieldDamage += shieldDamage
            acc.remainingShields -= shieldDamage
            acc.remainingWounds -= woundDamage

            return acc
        }, { totalDamage: 0, shieldDamage: 0, woundDamage: 0, remainingWounds: acc.remainingWounds, remainingShields: acc.remainingShields })

        acc.totalDamage += damageResults.totalDamage
        acc.shieldDamage += damageResults.shieldDamage
        acc.woundDamage += damageResults.woundDamage
        acc.remainingWounds = damageResults.remainingWounds
        acc.remainingShields = damageResults.remainingShields

        return acc
    }, { totalDamage: 0, shieldDamage: 0, woundDamage: 0, remainingWounds: currentWounds, remainingShields: currentShields })

    const {
        totalDamage,
        shieldDamage,
        woundDamage,
        remainingWounds,
        remainingShields
    } = hitResult

    const callsign = actor.name.match(/"([^"]+)"/)
    const actorName = callsign ? callsign[1] : actor.name

    const chatMessage = generateChatMessage({
        actorName,
        remainingShields,
        remainingWounds,
        totalDamage,
        shieldDamage,
        woundDamage,
        hasShields
    })

    applyDamage({ target: actor, remainingWounds, remainingShields })

    ChatMessage.create({
        user: game.user._id,
        speaker: ChatMessage.getSpeaker(),
        content: chatMessage,
        // If the user wants the result to be private, only they will see the message
        whisper: whisperResult ? [game.user._id] : null
    });
}

const handleVehicleHit = ({ vehicle }) => {
    const crew = vehicle.system.crew

    const crewActorIds = [
        ...crew.operators.map(operator => operator.id).filter(id => id !== null),
        ...crew.gunners.map(gunner => gunner.id).filter(id => id !== null),
        ...crew.complement.map(complement => complement.id).filter(id => id !== null)
    ];

    // Get actors for crew and determine if they get hit
    const crewActors = crewActorIds.map((id) => {
        const actor = game.actors.get(id)
        const roll = rollDice('d100')
        const hit = roll >= 96 // crew have 5% chance of being hit inside vehicle

        return { actor, hit }
    })

    console.log({ crewActors })
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
    .cover-locations-container {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }
    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 5px;
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

const coverLocationsSection = `
        <fieldset class="form-section">
            <legend>Locations in Cover</legend>
            <div class="cover-locations-container">
                <!-- Dynamically generated checkboxes will render here -->
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
            const { actor, token } = getTarget()

            if (!actor || !token) {
                console.error('No target found.')
                return
            }

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

            if (!lastAttackMessage) {
                console.error('No attack message found in chat')
                return
            }

            // Extract data from the last attack
            const hitData = extractDataForHits(lastAttackMessage.content)

            const isAttackAgainstVehicle = hitData.every(hit =>
                hit.damageInstances.every(instance => instance.location in vehicleHitLocationMap)
            );

            // Make sure the target is a vehicle if the attack is against a vehicle
            // Crew of the vehicle being hit will be handled automatically
            if (isAttackAgainstVehicle && actor.type !== 'Vehicle') {
                console.error('Vehicle hit detected but target is not a vehicle.')
                return
            }

            const lastAttackHtml = parser.parseFromString(lastAttackMessage.content, 'text/html');

            // Get weapon traits from weapon used in the attack
            const specialRules = Array
                .from(lastAttackHtml.querySelectorAll('aside.special .special-rule'))
                .map(span => span.textContent.trim().replace(/\s*\(\d+\)/, ''));

            const weaponSpecialRules = handleWeaponSpecialRules(specialRules)

            const resistance = actor.system.armor
            const hasShields = !!actor.system.shields.max
            const currentShields = actor.system.shields.value

            // If target is a vehicle we have to handle this differently
            if (actor.type === 'Vehicle') {
                // TODO handle vehicle
                console.log('Vehicle hit', { actor })
                handleVehicleHit({ vehicle: actor })
            } else {
                const currentWounds = actor.system.wounds.value

                handleHit({ hitData, appliedHits, extraPierce, damageMultiplier, resistance, weaponSpecialRules, coverLocations, coverPoints, currentWounds, currentShields, actor, whisperResult, hasShields })
            }
        }
      },
      cancel: {
        label: 'Cancel'
      }
    },
    // In some cases we need to dynamically inject some html into the dialog as it renders, this is because we need context of certain data points to know what to render
    render: (html) => {
        // Render cover options, this differs if the target is a vehicle or not
        const { actor } = getTarget()
        const coverLocationsContainer = html.find('.cover-locations-container');
        const locations = actor.type === 'Vehicle' ? vehicleHitLocationMap : hitLocationMap
        const hitLocationFormOptions = Object.entries(locations).map(([key, value]) => ({ name: value, label: key }))

        hitLocationFormOptions.forEach((location) => {
            const label = $(`
                <label class="location-checkbox-label checkbox-label">
                    <input type="checkbox" name="coverLocation" value="${location.name}" />
                    ${location.label}
                </label>`
            );

            coverLocationsContainer.append(label);
        })

        // Render hits from the last attack chat message
        const damageInstancesContainer = html.find('.damage-instances-container');
        const lastAttackMessage = getLastAttackFromChat()

        if (!lastAttackMessage) {
            console.error('No attack message found in chat')
            return
        }

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
const parser = new DOMParser()

const hitLocationMap = {
  Head: 'head',
  'Right Arm': 'rightArm',
  'Right Leg': 'rightLeg',
  Chest: 'chest',
  'Left Arm': 'leftArm',
  'Left Leg': 'leftLeg',
}

const vehicleBreakpointMap = {
  Engine: 'eng',
  Hull: 'hull',
  Mobility: 'mob',
  Optics: 'op',
  Weapon: 'wep',
}

const reversedVehicleBreakpointMap = Object.fromEntries(Object.entries(vehicleBreakpointMap).map(([key, value]) => [value, key]))

// Should be a string format like '1d10' or '1d6 + 2', etc.
const rollDice = (dice) => {
  const roll = new Roll(dice).evaluate({ async: false })
  return roll.total
}

const calculateHitLocation = (hitRoll) => {
  if (hitRoll >= 1 && hitRoll <= 10) return 'Head'
  if (hitRoll >= 11 && hitRoll <= 20) return 'Left Arm'
  if (hitRoll >= 21 && hitRoll <= 30) return 'Right arm'
  if (hitRoll >= 31 && hitRoll <= 45) return 'Left Leg'
  if (hitRoll >= 46 && hitRoll <= 60) return 'Right Leg'
  if (hitRoll >= 61 && hitRoll <= 100) return 'Chest'
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
    ui.notifications.error('No target found. Please select a token.')
    return { actor: null, token: null }
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
  const parsedHtml = parser.parseFromString(htmlString, 'text/html')

  const hits = Array.from(parsedHtml.querySelectorAll('.post-attack div'))
    .filter((attacks) => attacks.querySelector('.damage-block'))
    .map((hit) => {
      // hitOutcome is a div that contains the number number
      const hitOutcome = hit.querySelector('.outcome')

      const hitTags = hitOutcome.querySelectorAll('p')
      // the hitNumber is the first p tag in the outcome div
      const hitNumber = hitTags[0].textContent.trim() || '?'
      // the hitNumber is the third p tag in the outcome div
      const hitRollMatch = hitTags[2].textContent.trim().match(/^\d{1,3}/)
      const hitRoll = hitRollMatch ? hitRollMatch[0] : 0

      // damageBlock is a div that contains the damage instances, pierce and location
      const damageBlock = hit.querySelector('.damage-block')

      const additions = damageBlock.querySelector('.damage-block p').textContent.trim()

      // Look through the element for pierce
      const pierceMatch = additions.match(/Pierce\s(\d+)/)
      const pierce = pierceMatch ? pierceMatch[1] : null

      // Look through the element for location
      const locationMatch = additions.match(/:\s*([\p{L}\s-]+?)(?=\s*-|\n|$)/u)
      const location = locationMatch ? locationMatch[1].trim() : null

      const sublocationMatch = additions.match(/- ([^\n\r]+)$/)
      const sublocation = sublocationMatch ? sublocationMatch[1].trim() : null

      const rollResults = damageBlock.querySelectorAll('.inline-roll.inline-result')

      // Loop over each damage instance and extract the damage
      // If there are multiple damage instances, e.g. burst fire, the pierce and hit location are the same so we can just use the above values
      const damageInstances = Array.from(rollResults).map((result) => {
        const damage = result.textContent.trim()

        return {
          damage: parseInt(damage, 10),
          pierce: parseInt(pierce, 10),
          location,
        }
      })

      return {
        hitNumber: parseInt(hitNumber, 10),
        hitRoll: parseInt(hitRoll, 10),
        damageInstances,
      }
    })

  return hits
}

const getWeaponSpecialRules = (html) => {
  const weaponSpecialRules = Array.from(html.querySelectorAll('aside.special .special-rule')).map((span) => span.textContent.trim().replace(/\s*\(\d+\)/, ''))

  // If the weapon has any of these special rules, when damaging energy shields it adds the weapon's pierce to the damage
  // Penetrating weapons also fall into this category but they are handled separately
  const specialRuleAddPierceAgainstShield = ['Spread', 'Cauterize', 'Kinetic', 'Blast', 'Kill', 'Carpet']

  const addsPierceAgainstEnergyShields = weaponSpecialRules.some((trait) => specialRuleAddPierceAgainstShield.includes(trait))

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
    kill,
  }
}

const calculatePersonDamage = ({ damage, pierce, location, armour, weaponSpecialRules, coverLocations, coverPoints, energyShields }) => {
  const mappedHitLocation = hitLocationMap[location]
  const applyHeadshot = location === 'Head' && weaponSpecialRules.headshot
  const isHitLocationInCover = coverLocations[mappedHitLocation]

  let resistanceAtHitLocation = armour[mappedHitLocation]?.resistance

  // Protection is the armour without toughness modifier applied
  if (applyHeadshot) {
    resistanceAtHitLocation = armour[mappedHitLocation].protection
  }

  // Blast weapons always hit the location with the lowest armour
  // Locations in cover should not be considered for the damage
  if (weaponSpecialRules.blast) {
    const locationsNotInCover = Object.entries(armour).filter(([location]) => !coverLocations[location])
    const lowestResistanceNotInCover = Math.min(...Object.values(locationsNotInCover).map(([_, armour]) => armour.resistance))

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
      coverPoints,
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
    const damageThroughResistance = resistanceAtHitLocation > damageToArmour ? 0 : damageToArmour - resistanceAtHitLocation

    return { shieldDamage, woundDamage: damageThroughResistance }
  }

  // If the pierce is greater than the damage resistance, it shouldn't add any damage. Instead it pierces through the target to whatever is behind and should be handled separately.
  const effectiveResistance = pierce > resistanceAtHitLocation ? 0 : resistanceAtHitLocation - pierce

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

const calculateVehicleDamage = ({ damage, pierce, location, armour, weaponSpecialRules, coverLocations, coverPoints, energyShields }) => {
  const isHitLocationInCover = coverLocations[location]

  let armourAtHitLocation = armour[location].value

  // If location being hit is in cover, add the cover points to the overall armour
  if (isHitLocationInCover) {
    armourAtHitLocation += coverPoints
  }

  // If the target has energy shields then the damage should be applied to the shields first
  if (energyShields > 0) {
    const { shieldDamage, armourDamage } = calculateEnergyShieldDamage({
      damage,
      pierce,
      weaponSpecialRules,
      energyShields,
      isHitLocationInCover,
      coverPoints,
    })

    let damageToArmour = armourDamage

    // Kinetic weapons also deal damage to the armour through energy shields
    if (weaponSpecialRules.kinetic) {
      damageToArmour += damage
    }

    // If no damage got through to the target's armour, we don't need to do anything else
    if (damageToArmour <= 0) {
      return { shieldDamage, vehicleDamage: 0 }
    }

    // Any damage through to armour after damaging energy shields does not benefit from pierce so it isn't applied here
    const damageThroughResistance = armourAtHitLocation > damageToArmour ? 0 : damageToArmour - armourAtHitLocation

    return { shieldDamage, vehicleDamage: damageThroughResistance }
  }

  // If the pierce is greater than the armour, it shouldn't add any damage.
  const effectiveResistance = pierce > armourAtHitLocation ? 0 : armourAtHitLocation - pierce

  const damageThroughResistance = damage - effectiveResistance

  // Make sure we don't apply negative damage which would give them wounds
  if (damageThroughResistance <= 0) {
    return { shieldDamage: 0, vehicleDamage: 0 }
  }

  return { shieldDamage: 0, vehicleDamage: damageThroughResistance }
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
  const effectiveDamage = isHitLocationInCover ? damageToShields - coverPoints : damageToShields

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

/* Person Logic */
const generatePersonHitChatMessage = ({ actor, remainingShields, remainingWounds, totalDamage, shieldDamage, woundDamage, hasShields, hideDamageResult }) => {
  const callsign = actor.name.match(/"([^"]+)"/)
  const actorName = callsign ? callsign[1] : actor.name

  let chatMessage = `<b>${actorName}</b>`
  chatMessage += '<br><br>'

  if (totalDamage <= 0) {
    chatMessage += 'No damage taken.'
  } else {
    if (remainingWounds <= 0) {
      chatMessage += `<b>${actorName} is down!</b>`
      chatMessage += '<br><br>'
    }

    if (hasShields) {
      chatMessage += `<b>Shield damage:</b> ${shieldDamage}`

      if (!hideDamageResult) {
        chatMessage += '<br>'
        chatMessage += `<b>Shields remaining:</b> ${remainingShields}`
      }

      chatMessage += '<br><br>'
    }

    chatMessage += `<b>Wound damage:</b> ${woundDamage}`

    if (!hideDamageResult) {
      chatMessage += '<br>'
      chatMessage += `<b>Wounds remaining:</b> ${remainingWounds}`
    }
  }

  return `
        <div style="display: flex; flex-direction: row;">
            <img src="${actor.img}" style="width: 50px; height: 50px; border-radius: 50%; margin-right: 10px;">

            <div>
                ${chatMessage}
            </div>
        </div>
    `
}

const applyPersonHit = async ({ actor, remainingShields, remainingWounds, totalDamage, shieldDamage, woundDamage, hasShields, whisperResult, hideDamageResult }) => {
  const chatMessage = generatePersonHitChatMessage({
    actor,
    remainingShields,
    remainingWounds,
    totalDamage,
    shieldDamage,
    woundDamage,
    hasShields,
    hideDamageResult,
  })

  await applyPersonDamage({ actor, remainingWounds, remainingShields })

  ChatMessage.create({
    user: game.user._id,
    speaker: ChatMessage.getSpeaker(),
    content: chatMessage,
    // If the user wants the result to be private, only they will see the message
    whisper: whisperResult ? [game.user._id] : null,
  })
}

const applyPersonDamage = async ({ actor, remainingWounds, remainingShields }) => {
  await actor.update({
    'system.wounds.value': remainingWounds,
    'system.shields.value': remainingShields,
  })
}

const handlePersonHit = async ({
  hitData,
  appliedHits,
  extraPierce,
  damageMultiplier,
  weaponSpecialRules,
  coverLocations,
  coverPoints,
  actor,
  whisperResult,
  hideDamageResult,
  calledShotLocation,
}) => {
  const hasShields = !!actor.system.shields.max
  const currentShields = actor.system.shields.value
  const currentWounds = actor.system.wounds.value
  const armour = actor.system.armor

  const hitResult = hitData.reduce(
    (acc, curr) => {
      const { hitNumber, damageInstances } = curr

      if (!appliedHits[hitNumber]) {
        // if hit wasn't checked we don't calculate damage, this could be because it was evaded for example
        return acc
      }

      // Each hit can have multiple instances of damage, e.g burst fire so we need to loop over all of them
      const damageResults = damageInstances.reduce(
        (acc, curr) => {
          const { damage, pierce, location } = curr

          // Handle any extra pierce being applied from the form, e.g. from a charge
          const totalPierce = pierce + extraPierce

          // Handle any damage multipliers being applied from the form, e.g. from a grenade's kill radius
          const totalDamage = damage * damageMultiplier

          const { shieldDamage, woundDamage } = calculatePersonDamage({
            damage: totalDamage,
            pierce: totalPierce,
            // Override with called shot location if one was specified, if not just use the location from the hit roll
            location: calledShotLocation || location,
            armour,
            weaponSpecialRules,
            coverLocations,
            coverPoints,
            energyShields: acc.remainingShields,
          })

          acc.totalDamage += shieldDamage
          acc.totalDamage += woundDamage
          acc.woundDamage += woundDamage
          acc.shieldDamage += shieldDamage
          acc.remainingShields -= shieldDamage
          acc.remainingWounds -= woundDamage

          return acc
        },
        { totalDamage: 0, shieldDamage: 0, woundDamage: 0, remainingWounds: acc.remainingWounds, remainingShields: acc.remainingShields }
      )

      acc.totalDamage += damageResults.totalDamage
      acc.shieldDamage += damageResults.shieldDamage
      acc.woundDamage += damageResults.woundDamage
      acc.remainingWounds = damageResults.remainingWounds
      acc.remainingShields = damageResults.remainingShields

      return acc
    },
    { totalDamage: 0, shieldDamage: 0, woundDamage: 0, remainingWounds: currentWounds, remainingShields: currentShields }
  )

  const { totalDamage, shieldDamage, woundDamage, remainingWounds, remainingShields } = hitResult

  await applyPersonHit({ actor, remainingShields, remainingWounds, totalDamage, shieldDamage, woundDamage, hasShields, whisperResult, hideDamageResult })
}

/* Vehicle Logic */
const generateVehicleHitChatMessage = ({ actor, remainingShields, currentBreakpoints, remainingBreakpoints, totalDamage, vehicleDamage, shieldDamage, hasShields, hideDamageResult }) => {
  const callsign = actor.name.match(/"([^"]+)"/)
  const actorName = callsign ? callsign[1] : actor.name

  const damagedBreakpoints = Object.entries(remainingBreakpoints).reduce((acc, [key, value]) => {
    if (value.value < currentBreakpoints[key].value) {
      acc[key] = {
        damageTaken: currentBreakpoints[key].value - value.value,
        remainingHealth: value.value,
      }
    }

    return acc
  }, {})

  let chatMessage = `<b>${actorName}</b>`
  chatMessage += '<br><br>'

  // Vehicle took no damage
  if (totalDamage <= 0) {
    chatMessage = `No damage taken.`
  } else {
    if (hasShields) {
      chatMessage += `<b>Shield damage:</b> ${shieldDamage}`

      if (!hideDamageResult) {
        chatMessage += '<br>'
        chatMessage += `<b>Remaining shields:</b> ${remainingShields}`
      }

      chatMessage += '<br><br>'
    }

    Object.entries(damagedBreakpoints).forEach(([key, data]) => {
      chatMessage += `<b>${reversedVehicleBreakpointMap[key]} damage:</b> ${data.damageTaken}`

      if (!hideDamageResult) {
        chatMessage += '<br>'
        chatMessage += `<b>${reversedVehicleBreakpointMap[key]} integrity:</b> ${data.remainingHealth}`
      }

      chatMessage += '<br><br>'
    })
  }

  return `
        <div style="display: flex; flex-direction: row;">
            <img src="${actor.img}" style="width: 50px; height: 50px; border-radius: 50%; margin-right: 10px;">

            <div>
                ${chatMessage}
            </div>
        </div>
    `
}

const applyVehicleDamage = async ({ actor, remainingShields, remainingBreakpoints }) => {
  Object.entries(remainingBreakpoints).map(async ([key, value]) => {
    await actor.update({
      [`system.breakpoints.${key}.value`]: value.value,
    })
  })

  await actor.update({
    'system.shields.value': remainingShields,
  })
}

const applyVehicleHit = async ({ actor, remainingShields, currentBreakpoints, remainingBreakpoints, totalDamage, vehicleDamage, shieldDamage, hasShields, whisperResult, hideDamageResult }) => {
  const chatMessage = generateVehicleHitChatMessage({ actor, remainingShields, currentBreakpoints, remainingBreakpoints, totalDamage, vehicleDamage, shieldDamage, hasShields, hideDamageResult })

  await applyVehicleDamage({ actor, remainingShields, remainingBreakpoints })

  await ChatMessage.create({
    user: game.user._id,
    speaker: ChatMessage.getSpeaker(),
    content: chatMessage,
    // If the user wants the result to be private, only they will see the message
    whisper: whisperResult ? [game.user._id] : null,
  })
}

const handleVehicleCrewHit = async ({
  actor,
  hitRoll,
  pierce,
  extraPierce,
  damage,
  damageMultiplier,
  vehicleHitLocation,
  weaponSpecialRules,
  coverLocations,
  coverPoints,
  whisperResult,
  hideDamageResult,
}) => {
  const crew = actor.system.crew
  const isOpenTop = actor.system.special.openTop.has

  const crewActorIds = [
    ...crew.operators.map((operator) => operator.id).filter((id) => id !== null),
    ...crew.gunners.map((gunner) => gunner.id).filter((id) => id !== null),
    ...crew.complement.map((complement) => complement.id).filter((id) => id !== null),
  ]

  // Get actors for crew and determine if they get hit
  // Finding the actors with game.actors here doesn't work as it only returns the base actor, it doesn't include armour or anything
  const crewActors = crewActorIds.map((id) => canvas.tokens.placeables.find((token) => token.actor._id === id)?.actor).filter((actor) => actor)

  if (crewActors.length) {
    // 5% chance to hit a crew member if damage has penetrated the hull
    const crewActorsHit = crewActors.filter(() => rollDice('d100') >= 96)

    if (crewActorsHit.length) {
      // Calculate hit location for crew member based on the hit roll
      const crewHitLocation = calculateHitLocation(hitRoll)

      // Refactor the loop to be async
      for (let crewActor of crewActorsHit) {
        const totalPierce = pierce + extraPierce
        const totalDamage = damage * damageMultiplier
        const crewMemberHasShields = !!crewActor.system.shields.max
        const crewMemberCurrentWounds = crewActor.system.wounds.value
        const crewMemberCurrentShields = crewActor.system.shields.value

        let crewArmour = crewActor.system.armor
        const vehicleArmourValue = actor.system.armor[vehicleHitLocation].value

        // If vehicle isn't open top then the crew gets the benefits of the vehicle's armour
        if (!isOpenTop) {
          crewArmour = Object.fromEntries(
            Object.entries(crewArmour).map(([key, stats]) => [
              key,
              {
                protection: stats.protection + vehicleArmourValue,
                resistance: stats.resistance + vehicleArmourValue,
              },
            ])
          )
        }

        const { shieldDamage, woundDamage } = calculatePersonDamage({
          damage: totalDamage,
          pierce: totalPierce,
          location: crewHitLocation,
          armour: crewArmour,
          weaponSpecialRules,
          coverLocations,
          coverPoints,
          energyShields: crewMemberCurrentShields,
        })

        await applyPersonHit({
          actor: crewActor,
          remainingShields: crewMemberCurrentShields - shieldDamage,
          remainingWounds: crewMemberCurrentWounds - woundDamage,
          totalDamage: shieldDamage + woundDamage,
          shieldDamage,
          woundDamage,
          hasShields: crewMemberHasShields,
          whisperResult,
          hideDamageResult,
        })
      }
    }
  }
}

const handleVehicleHit = async ({
  hitData,
  appliedHits,
  extraPierce,
  damageMultiplier,
  weaponSpecialRules,
  coverLocations,
  coverPoints,
  actor,
  whisperResult,
  vehicleHitLocation,
  hideDamageResult,
  breakpointOverride,
}) => {
  const hasShields = !!actor.system.shields.max
  const currentShields = actor.system.shields.value
  const currentBreakpoints = actor.system.breakpoints
  const armour = actor.system.armor

  // Initialize accumulator values
  let totalDamage = 0
  let shieldDamage = 0
  let vehicleDamage = 0
  let remainingBreakpoints = structuredClone(currentBreakpoints)
  let remainingShields = currentShields

  for (let hit of hitData) {
    const { hitNumber, hitRoll, damageInstances } = hit

    // If hit wasn't applied we don't need to do anything for this hit
    if (!appliedHits[hitNumber]) {
      continue
    }

    // Initialize damage accumulator for the current hit
    let damageResult = { totalDamage: 0, shieldDamage: 0, vehicleDamage: 0, remainingBreakpoints: { ...remainingBreakpoints }, remainingShields }

    for (let damageInstance of damageInstances) {
      const { damage, pierce, location } = damageInstance

      let breakpointHitLocation = breakpointOverride || location

      // TODO handle armour being halved when vehicle hull reaches 0
      // TODO handle damage taken when hull is 0
      // If targeting a breakpoint that is already destroyed, the damage is applied to the hull instead
      if (!damageResult.remainingBreakpoints[vehicleBreakpointMap[breakpointHitLocation]] || damageResult.remainingBreakpoints[vehicleBreakpointMap[breakpointHitLocation]].value <= 0) {
        breakpointHitLocation = 'Hull'
      }

      // Handle any extra pierce being applied from the form, e.g. from a charge
      const totalPierce = pierce + extraPierce

      // Handle any damage multipliers being applied from the form, e.g. from a grenade's kill radius
      const totalDamage = damage * damageMultiplier

      const { shieldDamage, vehicleDamage } = calculateVehicleDamage({
        damage: totalDamage,
        pierce: totalPierce,
        location: vehicleHitLocation,
        armour,
        weaponSpecialRules,
        coverLocations,
        coverPoints,
        energyShields: damageResult.remainingShields,
      })

      // If hitting hull and damage has penetrated the hull, there is a 5% chance to hit a crew member
      if (breakpointHitLocation === 'Hull' && vehicleDamage >= 0) {
        await handleVehicleCrewHit({
          actor,
          hitRoll,
          pierce,
          extraPierce,
          damage,
          damageMultiplier,
          vehicleHitLocation,
          weaponSpecialRules,
          coverLocations,
          coverPoints,
          whisperResult,
          hideDamageResult,
        })
      }

      const mappedBreakpointHitLocation = vehicleBreakpointMap[breakpointHitLocation]

      // Accumulate results into the damageResult
      damageResult.totalDamage += shieldDamage
      damageResult.totalDamage += vehicleDamage
      damageResult.vehicleDamage += vehicleDamage
      damageResult.shieldDamage += shieldDamage
      damageResult.remainingShields -= shieldDamage
      damageResult.remainingBreakpoints = {
        ...damageResult.remainingBreakpoints,
        [mappedBreakpointHitLocation]: {
          ...damageResult.remainingBreakpoints[mappedBreakpointHitLocation],
          value: damageResult.remainingBreakpoints[mappedBreakpointHitLocation].value - vehicleDamage,
        },
      }
    }

    // After processing all damage instances, add the results to the overall accumulator
    totalDamage += damageResult.totalDamage
    shieldDamage += damageResult.shieldDamage
    vehicleDamage += damageResult.vehicleDamage
    remainingShields = damageResult.remainingShields
    remainingBreakpoints = Object.entries(damageResult.remainingBreakpoints).reduce(
      (breakpoints, [key, value]) => ({
        ...breakpoints,
        [key]: {
          ...breakpoints[key],
          value: value.value,
        },
      }),
      remainingBreakpoints
    )
  }

  await applyVehicleHit({
    actor,
    remainingShields,
    currentBreakpoints,
    remainingBreakpoints,
    totalDamage,
    vehicleDamage,
    shieldDamage,
    hasShields,
    whisperResult,
    hideDamageResult,
  })
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
    .cover-locations-container, .vehicle-hit-locations-container, .breakpoint-hit-locations-container, .called-shot-locations-container {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }
    .checkbox-label, .location.radio.label {
        display: flex;
        align-items: center;
        cursor: pointer;
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
    .vehicle-hit-locations-container input[type="radio"], .called-shot-locations-container input[type="radio"] {
        transform: scale(1.4);
        margin-right: 5px;
        cursor: pointer;
    }
</style>
`

const coverLocationsSection = `
        <fieldset class="form-section cover-form-section">
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

    <label class="checkbox-label">
        <input type="checkbox" name="hideDamageResult" value="hideDamageResult" />
        Hide Damage Result
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
  buttons: {
    confirm: {
      icon: "<i class='fas fa-check'></i>",
      label: 'Calculate',
      callback: async (html) => {
        const { actor, token } = getTarget()

        if (!actor || !token) {
          ui.notifications.error('No target found.')
          return
        }

        // Parse all the form data inputs
        // Options
        const whisperResult = html.find("input[name='whisperResult']").is(':checked')
        const hideDamageResult = html.find("input[name='hideDamageResult']").is(':checked')

        // Resistance modifiers
        const coverPoints = parseInt(html.find("input[name='coverPoints']").val(), 10)
        const extraPierce = parseInt(html.find("input[name='extraPierce']").val(), 10)

        // Damage modifiers
        const damageMultiplier = parseInt(html.find("input[name='damageMultiplier']").val(), 10)

        // Called shot location
        const calledShotLocation = html.find("input[name='calledShotLocation']:checked").val()

        // Cover Locations
        const coverLocationInputs = html.find("input[name='coverLocation']")

        // Hits
        const hits = html.find("input[name='hits']")
        const breakpointHitLocationInputs = html.find("input[name='breakpointHitLocation']")

        const coverLocations = coverLocationInputs.toArray().reduce((acc, curr) => {
          const location = curr.value
          acc[location] = curr.checked
          return acc
        }, {})

        const appliedHits = hits.toArray().reduce((acc, curr) => {
          const hit = curr.value
          acc[hit] = curr.checked
          return acc
        }, {})

        const breakpointHitLocations = breakpointHitLocationInputs.toArray().reduce((acc, curr) => {
          if (curr.checked) {
            acc.push(reversedVehicleBreakpointMap[curr.value])
          }

          return acc
        }, [])

        const lastAttackMessage = getLastAttackFromChat()

        if (!lastAttackMessage) {
          ui.notifications.error('No attack message found in chat')
          return
        }

        // Extract data from the last attack
        const hitData = extractDataForHits(lastAttackMessage.content)

        const isAttackAgainstVehicle = hitData.every((hit) => hit.damageInstances.every((instance) => instance.location in vehicleBreakpointMap))

        // Make sure the target is a vehicle if the attack is against a vehicle
        // Crew of the vehicle being hit will be handled automatically
        if (isAttackAgainstVehicle && actor.type !== 'Vehicle') {
          ui.notifications.error('Vehicle hit detected but target is not a vehicle.')
          return
        }

        const lastAttackHtml = parser.parseFromString(lastAttackMessage.content, 'text/html')

        // Get weapon traits from weapon used in the attack
        const weaponSpecialRules = getWeaponSpecialRules(lastAttackHtml)

        const hasShields = !!actor.system.shields.max

        // If target is a vehicle we have to handle this differently
        if (actor.type === 'Vehicle') {
          // Vehicle hit locations
          const vehicleHitLocationInputs = html.find("input[name='vehicleHitLocation']")
          const vehicleHitLocation = vehicleHitLocationInputs.toArray().find((input) => input.checked)?.value || null

          if (!vehicleHitLocation) {
            ui.notifications.error('No vehicle hit location selected.')
            return
          }

          for (const breakpoint of breakpointHitLocations) {
            const { actor: updatedActor } = getTarget()

            await handleVehicleHit({
              hitData,
              appliedHits,
              extraPierce,
              damageMultiplier,
              armour: updatedActor.system.armor,
              weaponSpecialRules,
              coverLocations,
              coverPoints,
              currentBreakpoints: updatedActor.system.breakpoints,
              currentShields: updatedActor.system.shields.value,
              actor: updatedActor,
              whisperResult,
              hasShields,
              vehicleHitLocation,
              hideDamageResult,
              breakpointOverride: breakpoint,
            })
          }
        } else {
          const { actor: updatedActor } = getTarget()

          await handlePersonHit({
            hitData,
            appliedHits,
            extraPierce,
            damageMultiplier,
            armour: updatedActor.system.armor,
            weaponSpecialRules,
            coverLocations,
            coverPoints,
            currentWounds: updatedActor.system.wounds.value,
            currentShields: updatedActor.system.shields.value,
            actor: updatedActor,
            whisperResult,
            hasShields,
            hideDamageResult,
            calledShotLocation,
          })
        }
      },
    },
    cancel: {
      label: 'Cancel',
    },
  },
  // In some cases we need to dynamically inject some html into the dialog as it renders, this is because we need context of certain data points to know what to render
  render: (html) => {
    // Render cover options, this differs if the target is a vehicle or not
    const { actor } = getTarget()

    if (!actor) {
      ui.notifications.error('No target found.')
      return
    }

    const lastAttackMessage = getLastAttackFromChat()

    if (!lastAttackMessage) {
      ui.notifications.error('No attack message found in chat')
      return
    }

    const hitData = extractDataForHits(lastAttackMessage.content)

    // If target is a vehicle then we want to render some extra form elements
    if (actor.type === 'Vehicle') {
      const vehicleHitLocations = ['Front', 'Side', 'Back', 'Top', 'Bottom']
      const locationFormOptions = vehicleHitLocations.map((location) => ({ name: location.toLowerCase(), label: location }))
      const coverLocationsContainer = html.find('.cover-locations-container')

      const lastAttackHtml = parser.parseFromString(lastAttackMessage.content, 'text/html')
      const weaponSpecialRules = getWeaponSpecialRules(lastAttackHtml)

      // Cover locations
      locationFormOptions.forEach((location) => {
        const label = $(`
                    <label class="location-checkbox-label checkbox-label">
                        <input type="checkbox" name="coverLocation" value="${location.name}" />
                        ${location.label}
                    </label>`)

        coverLocationsContainer.append(label)
      })

      const vehicleHitLocationsSection = `
                <fieldset class="form-section vehicle-hit-locations-form-section">
                    <legend>Vehicle hit Location</legend>
                    <div class="vehicle-hit-locations-container">
                        <!-- Dynamically generated checkboxes will render here -->
                    </div>
                </fieldset>
            `

      // Dynamically add vehicle hit location before cover locations section
      html.find('.form .cover-form-section').before(vehicleHitLocationsSection)

      const vehicleHitLocationsContainer = html.find('.vehicle-hit-locations-container')

      // Hit direction locations
      locationFormOptions.forEach((location, index) => {
        const defaultSelection = index === 0

        const label = $(`
                    <label class="location-radio-label radio-label">
                        <input type="radio" name="vehicleHitLocation" value="${location.name}" ${defaultSelection ? 'checked' : ''} />
                        ${location.label}
                    </label>`)

        vehicleHitLocationsContainer.append(label)
      })

      const hitLocations = hitData.map((hit) => hit.damageInstances[0].location).filter((location) => !!location)

      // Breakpoint hit locations
      const breakpointHitLocations = `
                <fieldset class="form-section breakpoint-hit-locations-form-section">
                    <legend>Breakpoint hit locations</legend>
                    <div class="breakpoint-hit-locations-container">
                        <!-- Dynamically generated checkboxes will render here -->
                    </div>
                </fieldset>
            `

      html.find('.form .cover-form-section').before(breakpointHitLocations)

      const breakpointFormOptions = Object.entries(vehicleBreakpointMap).map(([key, value]) => ({ name: value, label: key }))

      const breakpointHitLocationsContainer = html.find('.breakpoint-hit-locations-container')

      breakpointFormOptions.forEach((location) => {
        const label = $(`
                    <label class="location-checkbox-label checkbox-label">
                        <input
                            type="checkbox"
                            name="breakpointHitLocation"
                            value="${location.name}"
                            ${weaponSpecialRules.blast || hitLocations.includes(location.label) ? 'checked' : ''}
                        />
                        ${location.label}
                    </label>`)

        breakpointHitLocationsContainer.append(label)
      })
    } else {
      const hitLocations = hitData.map((hit) => hit.damageInstances[0].location).filter((location) => !!location)

      if (hitLocations.length) {
        const calledShotLocationSection = `
                    <fieldset class="form-section called-shot-locations-form-section">
                        <legend>Called shot location</legend>
                        <div class="called-shot-locations-container">
                            <!-- Dynamically generated checkboxes will render here -->
                        </div>
                    </fieldset>
                `

        // Dynamically add person hit location before cover locations section
        html.find('.form .cover-form-section').before(calledShotLocationSection)

        const calledShotLocationContainer = html.find('.called-shot-locations-container')

        const calledShotLocationFormOptions = Object.entries(hitLocationMap).map(([key, _]) => ({ name: key, label: key }))

        // Person hit locations
        calledShotLocationFormOptions.forEach((location) => {
          const label = $(`
                        <label class="location-radio-label radio-label">
                            <input type="radio" name="calledShotLocation" value="${location.name}" />
                            ${location.label}
                        </label>`)

          calledShotLocationContainer.append(label)
        })
      }

      const locationFormOptions = Object.entries(hitLocationMap).map(([key, value]) => ({ name: value, label: key }))
      const coverLocationsContainer = html.find('.cover-locations-container')

      locationFormOptions.forEach((location) => {
        const label = $(`
                    <label class="location-checkbox-label checkbox-label">
                        <input type="checkbox" name="coverLocation" value="${location.name}" />
                        ${location.label}
                    </label>`)

        coverLocationsContainer.append(label)
      })
    }

    // Render hits from the last attack chat message
    const damageInstancesContainer = html.find('.damage-instances-container')

    hitData.forEach((hit) => {
      const { hitNumber, damageInstances } = hit

      const damageText = damageInstances.map(({ damage }) => damage).join(', ')
      // Pierce should be the same for all damage instances of a single hit, e.g using burst fire
      const pierce = damageInstances[0].pierce
      const hitLocation = damageInstances[0].location

      const label = $(`
                <label class="checkbox-label">
                    <input type="checkbox" name="hits" value="${hitNumber}" checked />
                    Hit ${hitNumber} || ${damageText} Damage | Pierce ${pierce} | ${hitLocation}
                </label>`)

      damageInstancesContainer.append(label)
    })
  },
}).render(true)

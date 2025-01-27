import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

const defaultMacroOptions = {
    scope: 'global',
    img: "icons/svg/dice-target.svg",
    folder: null,
    sort: 0,
    permission: {
        default: 0,
        "xAMytYBqgBcD7RDd": 3
    },
}

const damageCalculatorCommand = fs.readFileSync(path.join(__dirname, '../scripts/macros/damageCalculator.js'), 'utf-8');

const damageCalculatorMacro = {
    _id: uuidv4(),
    name: 'Damage Calculator',
    type: 'script',
    command: damageCalculatorCommand,
    flags: {
        core: {
            sourceId: `Macro.${uuidv4()}`
        }
    },
    ...defaultMacroOptions
}

const macrosDbPath = path.join(__dirname, '../packs/macros-mythic.db');

fs.writeFileSync(macrosDbPath, JSON.stringify(damageCalculatorMacro, null, 2), 'utf-8')
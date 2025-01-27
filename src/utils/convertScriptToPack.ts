import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

const damageCalculatorCommand = fs.readFileSync(path.join(__dirname, '../scripts/macros/damageCalculator.js'), 'utf-8');

const damageCalculatorMacro = {
    _id: uuidv4(),
    name: 'Damage Calculator',
    type: 'script',
    scope: 'global',
    command: damageCalculatorCommand
}

const macrosDbPath = path.join(__dirname, '../packs/macros-mythic.db');

fs.writeFileSync(macrosDbPath, JSON.stringify(damageCalculatorMacro, null, 2), 'utf-8')
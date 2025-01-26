import fs from 'fs'
import path from 'path'

const damageCalculatorCommand = fs.readFileSync(path.join(__dirname, '../scripts/macros/damageCalculator.ts'), 'utf-8');

const damageCalculatorMacro = {
    _id: 'damage-calculator',
    name: 'Damage Calculator',
    type: 'script',
    scope: 'global',
    command: damageCalculatorCommand
}

console.log('Writing macros to file')

const macrosDbPath = path.join(__dirname, '../packs/macros-mythic.db');

console.log('macrosDbPath', macrosDbPath)

fs.writeFileSync(macrosDbPath, JSON.stringify(damageCalculatorMacro, null, 2), 'utf-8')

console.log('Done writing macros to file')
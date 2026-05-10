// Checks locale files in src/translations/ against the canonical en.json.
// Reports missing keys (in en.json but not in locale) and extra keys (in locale but not in en.json).
// Exits with code 1 if any issues are found.

import { readFileSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/translations')
const en = JSON.parse(readFileSync(resolve(dir, 'en.json'), 'utf8'))
const enKeys = new Set(Object.keys(en).filter((k) => k !== '_name'))

const red = (s) => `\x1b[31m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const bold = (s) => `\x1b[1m${s}\x1b[0m`

const target = process.argv[2]
const files = target
    ? [target.endsWith('.json') ? target : `${target}.json`]
    : readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json')

let totalIssues = 0

for (const file of files) {
    const locale = JSON.parse(readFileSync(resolve(dir, file), 'utf8'))
    const localeKeys = new Set(Object.keys(locale).filter((k) => k !== '_name'))
    const name = locale['_name'] ?? file

    const missing = [...enKeys].filter((k) => !localeKeys.has(k))
    const extra = [...localeKeys].filter((k) => !enKeys.has(k))
    const issues = missing.length + extra.length

    totalIssues += issues

    if (issues === 0) {
        console.log(`${green('✓')} ${bold(name)} (${file}) — complete`)
        continue
    }

    console.log(`\n${bold(name)} (${file})`)

    if (missing.length > 0) {
        console.log(`  ${red(`${missing.length} missing key${missing.length > 1 ? 's' : ''}:`)  }`)
        for (const k of missing) console.log(`    ${red('-')} ${k}`)
    }

    if (extra.length > 0) {
        console.log(`  ${yellow(`${extra.length} extra key${extra.length > 1 ? 's' : ''}:`)}`)
        for (const k of extra) console.log(`    ${yellow('+')} ${k}`)
    }
}

if (totalIssues > 0) {
    console.log(`\n${red(`${totalIssues} issue${totalIssues > 1 ? 's' : ''} found.`)}`)
    process.exit(1)
} else {
    console.log(`\n${green('All translations are complete.')}`)
}

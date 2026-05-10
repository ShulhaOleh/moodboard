// Checks locale files in src/translations/ against the canonical en.json.
// Reports missing keys (in en.json but not in locale) and extra keys (in locale but not in en.json).
// Exits with code 1 if any issues are found.
//
// Usage:
//   node scripts/check-translations.js              # check all locales
//   node scripts/check-translations.js fr           # check one locale
//   node scripts/check-translations.js --generate fr  # generate/sync fr.json

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/translations')
const en = JSON.parse(readFileSync(resolve(dir, 'en.json'), 'utf8'))
const enKeys = Object.keys(en).filter((k) => k !== '_name')
const enKeySet = new Set(enKeys)

const red = (s) => `\x1b[31m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const bold = (s) => `\x1b[1m${s}\x1b[0m`

const generate = process.argv[2] === '--generate'
const target = generate ? process.argv[3] : process.argv[2]

if (generate) {
    if (!target) {
        console.error(red('Usage: node scripts/check-translations.js --generate <code>'))
        process.exit(1)
    }

    const code = target.replace(/\.json$/, '')
    const file = resolve(dir, `${code}.json`)
    const existing = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
    const isNew = !existsSync(file)

    const output = { _name: existing['_name'] ?? `!! ${code}` }
    let filled = 0
    let marked = 0

    for (const key of enKeys) {
        if (existing[key] !== undefined && !existing[key].startsWith('!! ')) {
            output[key] = existing[key]
            filled++
        } else {
            output[key] = `!! ${en[key]}`
            marked++
        }
    }

    writeFileSync(file, JSON.stringify(output, null, 4) + '\n', 'utf8')

    if (isNew) {
        console.log(`${green('✓')} Created ${bold(`src/translations/${code}.json`)}`)
    } else {
        console.log(`${green('✓')} Synced ${bold(`src/translations/${code}.json`)}`)
    }
    console.log(`  ${green(`${filled} keys preserved`)}`)
    if (marked > 0) console.log(`  ${yellow(`${marked} keys need translation (marked with !!)`)}`)
    process.exit(0)
}

const files = target
    ? [`${target.replace(/\.json$/, '')}.json`]
    : readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json')

let totalIssues = 0

for (const file of files) {
    const locale = JSON.parse(readFileSync(resolve(dir, file), 'utf8'))
    const localeKeys = new Set(Object.keys(locale).filter((k) => k !== '_name'))
    const name = locale['_name'] ?? file

    const missing = enKeys.filter((k) => !localeKeys.has(k))
    const untranslated = enKeys.filter((k) => localeKeys.has(k) && locale[k].startsWith('!! '))
    const extra = [...localeKeys].filter((k) => !enKeySet.has(k))
    const issues = missing.length + untranslated.length + extra.length
    const translated = enKeys.length - missing.length - untranslated.length
    const pct = Math.floor((translated / enKeys.length) * 100)
    const progress = `${translated}/${enKeys.length} keys (${pct}%)`

    totalIssues += issues

    if (issues === 0) {
        console.log(`${green('✓')} ${bold(name)} (${file}) — ${progress}`)
        continue
    }

    console.log(`\n${bold(name)} (${file}) — ${red(progress)}`)

    if (missing.length > 0) {
        console.log(`  ${red(`${missing.length} missing key${missing.length > 1 ? 's' : ''}:`)}`)
        for (const k of missing) console.log(`    ${red('-')} ${k}`)
    }

    if (untranslated.length > 0) {
        console.log(`  ${red(`${untranslated.length} untranslated key${untranslated.length > 1 ? 's' : ''}:`)}`)
        for (const k of untranslated) console.log(`    ${red('!')} ${k}`)
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

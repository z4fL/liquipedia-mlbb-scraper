// Tambah days_since_patch ke script kamu

import fs from 'fs'
import Papa from 'papaparse'
import { DateTime } from 'luxon'
import minimist from 'minimist'

const patchMap = {
  "2024-04-23": "Patch 1.8.78",
  "2024-05-27": "Patch 1.8.80",
  "2024-06-19": "Patch 1.8.92",
  "2024-07-31": "Patch 1.9.06",
  "2024-09-18": "Patch 1.9.20",
  "2024-11-05": "Patch 1.9.32",
  "2024-12-18": "Patch 1.9.42",
  "2025-02-13": "Patch 1.9.47",
  "2025-03-18": "Patch 1.9.64",
  "2025-04-22": "Patch 1.9.68",
  "2025-06-18": "Patch 1.9.91",
}

const sortedPatch = Object.entries(patchMap)
  .map(([date, patch]) => ({
    date: DateTime.fromISO(date, { zone: 'Asia/Jakarta' }),
    patch,
    rawDate: date
  }))
  .sort((a, b) => b.date - a.date)

function cleanDate(raw) {
  return raw
    .replace(';', '')
    .replace('ICT', 'Asia/Jakarta')
    .trim()
}

function parseLuxonDate(dateStr) {
  return DateTime.fromFormat(
    cleanDate(dateStr),
    "MMMM d yyyy - HH:mm z",
    { setZone: true }
  )
}

function getPatchData(dateStr) {
  const matchDate = parseLuxonDate(dateStr)
  for (const { date, patch, rawDate } of sortedPatch) {
    if (matchDate >= date) {
      const patchDate = DateTime.fromISO(rawDate, { zone: 'Asia/Jakarta' })
      const diff = matchDate.diff(patchDate, 'days').days
      return {
        patch_version: patch,
        days_since_patch: Math.floor(diff)
      }
    }
  }
  return {
    patch_version: "Unknown",
    days_since_patch: ""
  }
}

const argv = minimist(process.argv.slice(2))
const inputFile = argv._[0]

if (!fs.existsSync(inputFile)) {
  console.error(`❌ Error: File not found: ${inputFile}`)
  process.exit(1)
}
if (!inputFile.endsWith('.csv')) {
  console.error('❌ Error: Input file must be a .csv file')
  process.exit(1)
}

const extIndex = inputFile.lastIndexOf('.')
const outputFile =
  extIndex !== -1
    ? inputFile.slice(0, extIndex) + '_sorted_patch' + inputFile.slice(extIndex)
    : inputFile + '_sorted_patch'

const rawCsv = fs.readFileSync(inputFile, 'utf8')

Papa.parse(rawCsv, {
  header: true,
  skipEmptyLines: true,
  complete: (results) => {
    const sorted = results.data.sort((a, b) =>
      parseLuxonDate(a.date) - parseLuxonDate(b.date)
    )

    const updated = sorted.map(row => {
      const patchData = getPatchData(row.date)
      return {
        ...row,
        patch_version: patchData.patch_version,
        days_since_patch: patchData.days_since_patch
      }
    })

    const csvOutput = Papa.unparse(updated)
    fs.writeFileSync(outputFile, csvOutput)
    console.log(`✅ CSV sudah disortir & ditambah patch_version + days_since_patch: ${outputFile}`)
  }
})

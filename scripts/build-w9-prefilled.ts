/**
 * Generate a pre-filled blank W-9 from the official IRS template.
 * Leaves signature and date blank — user signs and dates themselves
 * in any PDF reader (Adobe Acrobat, Preview, browser, etc.).
 *
 * Inputs:
 *   data/w9-output/fw9-irs.pdf  (downloaded from irs.gov/pub/irs-pdf/fw9.pdf)
 *   data/w9-output/profile.json (gitignored; copy scripts/w9-profile.example.json)
 * Output: ~/Documents/tax/W9_prefilled.pdf  (written outside the repo)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { PDFDocument } from 'pdf-lib'

const SRC = 'data/w9-output/fw9-irs.pdf'
const PROFILE_PATH = 'data/w9-output/profile.json'
const OUT_DIR = join(homedir(), 'Documents', 'tax')
const OUT = join(OUT_DIR, 'W9_prefilled.pdf')

interface W9Profile {
  name: string
  businessName: string
  address: string
  cityStateZip: string
}

function loadProfile(): W9Profile {
  if (!existsSync(PROFILE_PATH)) {
    console.error(`Missing ${PROFILE_PATH}.`)
    console.error('Copy scripts/w9-profile.example.json to that path and fill in your details.')
    console.error('That directory is gitignored, so the file will not be committed.')
    process.exit(1)
  }
  const raw = readFileSync(PROFILE_PATH, 'utf8')
  const parsed = JSON.parse(raw) as Partial<W9Profile>
  const required: Array<keyof W9Profile> = ['name', 'businessName', 'address', 'cityStateZip']
  const missing = required.filter((k) => typeof parsed[k] !== 'string')
  if (missing.length) {
    console.error(`Profile is missing required string fields: ${missing.join(', ')}`)
    process.exit(1)
  }
  return parsed as W9Profile
}

// Per IRS W-9 instructions, a single-member LLC owned by an individual is
// "disregarded" for federal tax purposes — the owner's SSN goes on the W-9,
// NOT the entity EIN. SSN is intentionally not stored in profile.json; the
// user fills it in themselves in a PDF reader. Same for the date and signature.
const PROFILE = loadProfile()

async function main() {
  const bytes = readFileSync(SRC)
  const pdf = await PDFDocument.load(bytes)
  const form = pdf.getForm()
  const fields = form.getFields()

  console.log(`Found ${fields.length} form fields. Listing for inspection:`)
  for (const f of fields) {
    console.log(`  - ${f.constructor.name.padEnd(15)} ${f.getName()}`)
  }

  function trySet(matchPart: string | RegExp, value: string | boolean): boolean {
    const re = typeof matchPart === 'string' ? new RegExp(matchPart, 'i') : matchPart
    for (const f of fields) {
      if (!re.test(f.getName())) continue
      try {
        if (f.constructor.name === 'PDFTextField' && typeof value === 'string') {
          ;(f as unknown as { setText: (s: string) => void }).setText(value)
          console.log(`  ✓ set [${f.getName()}] = "${value}"`)
          return true
        }
        if (f.constructor.name === 'PDFCheckBox' && typeof value === 'boolean') {
          if (value) (f as unknown as { check: () => void }).check()
          console.log(`  ✓ checked [${f.getName()}]`)
          return true
        }
      } catch (e) {
        console.warn(`  ! couldn't set [${f.getName()}]: ${(e as Error).message}`)
      }
    }
    return false
  }

  // IRS W-9 (Rev. March 2024) field naming pattern:
  //   topmostSubform[0].Page1[0].f1_1[0]   = Name (line 1)
  //   topmostSubform[0].Page1[0].f1_2[0]   = Business name (line 2)
  //   topmostSubform[0].Page1[0].f1_7[0]   = Address (line 5)
  //   topmostSubform[0].Page1[0].f1_8[0]   = City/State/Zip (line 6)
  //   topmostSubform[0].Page1[0].FederalClassification[0].c1_1[0..7] = Tax class checkboxes
  //   topmostSubform[0].Page1[0].SSN[0].f1_11[0] / f1_12[0] / f1_13[0] = SSN (3 boxes)
  //   topmostSubform[0].Page1[0].EmployerID[0].f1_14[0] / f1_15[0] = EIN (2 boxes)
  console.log('\nFilling fields:')
  trySet(/f1_01\[0\]$/, PROFILE.name)                // Line 1: Name
  trySet(/f1_02\[0\]$/, PROFILE.businessName)        // Line 2: Business / disregarded entity
  trySet(/f1_07\[0\]$/, PROFILE.address)             // Line 5: Address
  trySet(/f1_08\[0\]$/, PROFILE.cityStateZip)        // Line 6: City, state, ZIP
  // 3a: Single-member LLC owned by an individual checks "Individual/sole proprietor"
  trySet(/c1_1\[0\]$/, true)                          // First checkbox (Individual/sole proprietor or SMLLC)
  // TIN intentionally left blank — user fills in their SSN by hand in a PDF reader.

  const out = await pdf.save()
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(OUT, out)
  console.log(`\nWrote ${OUT} (${(out.length / 1024).toFixed(1)} KB)`)
  console.log('User: open in any PDF reader, fill in your TIN if needed, sign + date the bottom of page 1, save.')
}

main().catch(err => { console.error(err); process.exit(1) })

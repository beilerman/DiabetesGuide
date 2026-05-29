/**
 * Re-stamp the date on an existing scanned/signed W-9 PDF using a vector overlay
 * (white rectangle + today's date drawn on top of the existing page).
 *
 * Why overlay instead of re-rendering the whole image: pdfjs/node-canvas can't
 * decode the JPEG raster stream embedded in the IRS scan. The overlay approach
 * keeps the original page bytes intact and just paints over the date area.
 *
 * Caveat: heuristic placement — the date box assumes standard W-9 layout.
 * Visually verify before sending.
 *
 * Inputs:  ~/Documents/tax/W9_Tax_Form.pdf  (scanned, signed; outside the repo)
 * Output:  ~/Documents/tax/W9_redated.pdf
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const TAX_DIR = join(homedir(), 'Documents', 'tax')
const SRC = join(TAX_DIR, 'W9_Tax_Form.pdf')
const OUT = join(TAX_DIR, 'W9_redated.pdf')

function todayMMDDYYYY(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getFullYear()}`
}

async function main() {
  const TODAY = todayMMDDYYYY()
  const bytes = readFileSync(SRC)
  const pdf = await PDFDocument.load(bytes)
  const page = pdf.getPage(0)
  const { width, height } = page.getSize()
  console.log(`Page 1 size: ${width.toFixed(1)} x ${height.toFixed(1)} pt`)

  const font = await pdf.embedFont(StandardFonts.Helvetica)

  // Heuristic location for the date field on a standard signed W-9 page 1.
  // PDF coordinate origin is BOTTOM-LEFT. The signature line sits roughly
  // 22% up from the bottom; the date is to the right of it.
  // Tune box if visually misaligned.
  const dateBox = {
    x: width * 0.72,
    y: height * 0.18,
    w: width * 0.22,
    h: height * 0.035,
  }
  // White rectangle to cover any existing date
  page.drawRectangle({
    x: dateBox.x,
    y: dateBox.y,
    width: dateBox.w,
    height: dateBox.h,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  })
  // Stamp today's date
  const fontSize = dateBox.h * 0.6
  page.drawText(TODAY, {
    x: dateBox.x + 6,
    y: dateBox.y + dateBox.h * 0.25,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  })

  // Tiny margin note so anyone reviewing knows this is a date refresh
  const noteFontSize = Math.max(7, dateBox.h * 0.30)
  page.drawText(`(date refreshed ${TODAY})`, {
    x: dateBox.x,
    y: dateBox.y - noteFontSize - 2,
    size: noteFontSize,
    font,
    color: rgb(0.55, 0.55, 0.55),
  })

  const out = await pdf.save()
  writeFileSync(OUT, out)
  console.log(`Wrote ${OUT} (${(out.length / 1024).toFixed(1)} KB)`)
  console.log(`Date stamped: ${TODAY}`)
  console.log('Open in a PDF viewer and verify the date sits on the line. If it lands wrong,')
  console.log('tweak the dateBox.x / .y coefficients in the script (currently 0.72 / 0.18).')
}

main().catch(err => { console.error(err); process.exit(1) })

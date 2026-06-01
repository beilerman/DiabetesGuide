/**
 * Test Gemini API
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')

// Get the commented key
const commentedMatch = envContent.match(/^#\s*GEMINI_API_KEY=(.+)$/m)
const apiKey = commentedMatch ? commentedMatch[1].trim() : null

if (!apiKey) {
  console.log('No GEMINI_API_KEY found in .env.local')
  process.exit(1)
}

console.log('Using API key:', apiKey.slice(0, 15) + '...')

const genAI = new GoogleGenerativeAI(apiKey)
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

async function test() {
  console.log('\nTesting Gemini API...')

  try {
    const prompt = 'Estimate nutrition for a McDonald\'s Big Mac. Return ONLY a JSON object: {"calories": X, "carbs": X, "fat": X, "protein": X}'

    console.log('Prompt:', prompt)

    const result = await model.generateContent(prompt)
    const text = result.response.text()

    console.log('\nRaw response:')
    console.log(text)

    // Try to parse
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      console.log('\nParsed JSON:')
      console.log(JSON.parse(jsonMatch[0]))
    } else {
      console.log('\nNo JSON found in response')
    }
  } catch (error: any) {
    console.log('\nError:', error.message)
    if (error.status) console.log('Status:', error.status)
    if (error.statusText) console.log('Status text:', error.statusText)
  }
}

test()

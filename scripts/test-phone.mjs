import assert from 'node:assert/strict'
import { formatBrazilianPhone, maskBrazilianPhone, normalizeBrazilianPhone } from '../dist-tests/phone.js'

const cases = [
  ['62999962632', '62999962632', '(62) 99996-2632'],
  ['5562999962632', '62999962632', '(62) 99996-2632'],
  ['6232345678', '6232345678', '(62) 3234-5678'],
  ['556232345678', '6232345678', '(62) 3234-5678'],
  ['62999', null, '62999'],
  ['+55 (62) 99996-2632 ramal ABC', '62999962632', '(62) 99996-2632'],
]

for (const [input, normalized, formatted] of cases) {
  assert.equal(normalizeBrazilianPhone(input), normalized, `normalize ${input}`)
  assert.equal(formatBrazilianPhone(input), formatted, `format ${input}`)
}

assert.equal(maskBrazilianPhone('5562999962632'), '(62) 99996-2632')
assert.equal(maskBrazilianPhone('556232345678'), '(62) 3234-5678')

console.log('Phone tests passed.')

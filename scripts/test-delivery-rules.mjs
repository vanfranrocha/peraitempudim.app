import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/services/deliveryRules.ts', import.meta.url), 'utf8')
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
})
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
const rules = await import(moduleUrl)

function state(deliveryMode, productsSubtotal, deliveryDistanceKm, hasLargePudding = false) {
  return rules.getFreeShippingState({ deliveryMode, productsSubtotal, deliveryDistanceKm, hasLargePudding })
}

function displayed(deliveryMode, productsSubtotal, deliveryDistanceKm, calculatedDeliveryFee = 8, hasLargePudding = false) {
  const freeShipping = state(deliveryMode, productsSubtotal, deliveryDistanceKm, hasLargePudding)
  return rules.getDisplayedShippingPrice({
    deliveryMode,
    calculatedDeliveryFee,
    isEligibleForFreeShipping: freeShipping.isEligibleForFreeShipping,
  })
}

assert.equal(state('entrega', 10, 2).isEligibleForFreeShipping, true)
assert.equal(displayed('entrega', 10, 2, 6), 0)

assert.equal(state('entrega', 39.99, 4).isEligibleForFreeShipping, false)
assert.equal(displayed('entrega', 39.99, 4, 8), 8)

assert.equal(state('entrega', 40, 4).isEligibleForFreeShipping, true)
assert.equal(displayed('entrega', 40, 4, 8), 0)

assert.equal(state('entrega', 40, 4.01).isEligibleForFreeShipping, false)
assert.equal(displayed('entrega', 40, 4.01, 8), 8)

assert.equal(state('entrega', 59.99, 4, true).isEligibleForFreeShipping, false)
assert.equal(displayed('entrega', 59.99, 4, 8, true), 8)

assert.equal(state('entrega', 60, 4, true).isEligibleForFreeShipping, true)
assert.equal(displayed('entrega', 60, 4, 8, true), 0)

assert.equal(state('entrega', 80, 6, true).isEligibleForFreeShipping, true)
assert.equal(displayed('entrega', 80, 6, 8, true), 0)

assert.equal(state('entrega', 80, 6.01, true).isEligibleForFreeShipping, false)
assert.equal(state('entrega', 80, 6.01, true).isOutsideFreeShippingRadius, true)
assert.equal(displayed('entrega', 80, 6.01, 11, true), 11)

assert.equal(state('entrega', 40, null).isEligibleForFreeShipping, false)
assert.equal(state('entrega', 40, null).shouldValidateAddressForFreeShipping, true)

assert.equal(state('retirada', 100, 2).isEligibleForFreeShipping, false)
assert.equal(displayed('retirada', 100, 2, 8), 0)

assert.equal(state('entrega', 55, 3).isEligibleForFreeShipping, true)
assert.equal(state('entrega', 35, 3).isEligibleForFreeShipping, false)
assert.equal(displayed('entrega', 35, 3, 8), 8)

assert.equal(state('entrega', 80, 3).isEligibleForFreeShipping, true)
assert.equal(state('entrega', 80, 8).isEligibleForFreeShipping, false)
assert.equal(displayed('entrega', 80, 8, 11), 11)

assert.equal(rules.getOrderTotal(60, 0), 60)
assert.equal(rules.getOrderTotal(55, 8), 63)

console.log('delivery rules tests passed')

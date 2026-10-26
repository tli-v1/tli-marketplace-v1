const withinRange = (value, min, max) =>
  (min === '' || value >= Number(min)) && (max === '' || value <= Number(max))

export const matchesCaseRanges = (item, ranges) => {
  const damage = [item.medicalDamageUsd, item.propertyDamageUsd, item.otherExpensesUsd, item.lostWagesUsd]
    .reduce((sum, value) => sum + (Number(value) || 0), 0)
  const docs = item.documents?.length || 0
  return withinRange(damage, ranges.damageMin, ranges.damageMax)
    && withinRange(docs, ranges.docsMin, ranges.docsMax)
}

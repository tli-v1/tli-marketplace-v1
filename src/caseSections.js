export const CASE_SECTIONS = [
  ['overview', 'Overview'],
  ['incident', 'Incident facts'],
  ['parties', 'Parties & insurance'],
  ['damages', 'Damages'],
  ['documents', 'Files & evidence'],
  ['client', 'Client & contact'],
  ['agreement', 'Lawyer-client agreement'],
]

export const activeCaseSection = (sections, { viewportHeight, scrollY, pageHeight }) => {
  if (!sections.length) return 'overview'
  // The final section may be too short to reach the reading line.
  if (scrollY > 0 && scrollY + viewportHeight >= pageHeight - 2) return sections.at(-1).id
  const readingLine = Math.min(160, viewportHeight * 0.25)
  return sections.filter(section => section.top <= readingLine).at(-1)?.id || sections[0].id
}

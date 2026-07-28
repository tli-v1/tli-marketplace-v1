export const parseValueCeiling = (range) => {
  const clean = (range || '').toString().replace(/[^0-9-]/g, '')
  const [low, high] = clean.split('-').filter(Boolean)
  const value = parseInt(high || low || '0', 10)
  return Number.isNaN(value) ? 0 : value
}

export const formatCurrency = (value) => {
  const numeric = Number(value)
  const safe = Number.isFinite(numeric) ? numeric : 0
  return `$${Math.max(Math.round(safe), 0).toLocaleString()}`
}

export const mapCaseRow = (row) => {
  const incident = row.incidents || {}
  const incidentDescription = incident.description || ''
  const damagesArray = Array.isArray(row.damages) ? row.damages : row.damages ? [row.damages] : []
  const damages = damagesArray[0] ?? {}
  const normalizedDamages = {
    injuries: damages.injuries || '',
    treatment: damages.treatment || '',
    medicalBillsUsd: Number(damages.medical_bills_usd) || 0,
    propertyDamageUsd: Number(damages.property_damage_usd) || 0,
    otherExpensesUsd: Number(damages.other_expenses_usd) || 0,
    daysMissed: Number(damages.days_missed) || 0,
    hourlyRateUsd: Number(damages.hourly_rate_usd ?? damages.daily_rate_usd) || 0,
    lostWagesUsd: Number(damages.lost_wages_usd) || 0,
    emotionalImpact: damages.emotional_impact || '',
    otherDamages: damages.other_damages || '',
    details: damages.details || '',
  }
  const totalValue =
    normalizedDamages.medicalBillsUsd +
    normalizedDamages.propertyDamageUsd +
    normalizedDamages.otherExpensesUsd +
    normalizedDamages.lostWagesUsd

  const stateCode = (incident.state_code || incident.state || '').toString().toUpperCase()
  const contact = row.case_contact?.[0] || {}

  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title:
      row.title ||
      incidentDescription.split('.').filter(Boolean)[0]?.trim() ||
      incidentDescription.slice(0, 80) ||
      'Untitled case',
    stateCode,
    state: incident.state || incident.state_code || 'Unknown',
    county: incident.city || '—',
    practiceAreas: row.practice_areas || ['Personal Injury'],
    description: incidentDescription || 'No description provided.',
    valueRange: formatCurrency(totalValue),
    status: row.status || 'review',
    statusLabel: row.status_label || row.status || 'Under review',
    urgencyDays: row.urgency_days ?? 120,
    profileCompleteness: row.profile_completeness ?? 0.5,
    incident: {
      date: incident.incident_date || new Date().toISOString(),
      city: incident.city || 'Unknown city',
      state: incident.state || 'Unknown',
      locationDetails: incident.location_details || '',
      description: incident.description || '',
    },
    medicalDamageUsd: normalizedDamages.medicalBillsUsd,
    propertyDamageUsd: normalizedDamages.propertyDamageUsd,
    otherExpensesUsd: normalizedDamages.otherExpensesUsd,
    lostWagesUsd: normalizedDamages.lostWagesUsd,
    daysMissed: normalizedDamages.daysMissed,
    hourlyRateUsd: normalizedDamages.hourlyRateUsd,
    dailyRateUsd: normalizedDamages.hourlyRateUsd,
    damages: normalizedDamages,
    parties: row.parties || [],
    caseContact: {
      fullName: contact.full_name || contact.name || '—',
      method: contact.method || '—',
      email: contact.email,
      phone: contact.phone,
    },
    documents: row.documents || [],
  }
}

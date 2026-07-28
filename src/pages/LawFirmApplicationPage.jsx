import { useState } from 'react'
import tliLogo from '../assets/tli_logo.png'
import { submitLawFirmApplication } from '../api/applications'
import ApplySection from '../components/ApplySection'
import CheckboxGroup from '../components/CheckboxGroup'
import MultiSelectDropdown from '../components/MultiSelectDropdown'
import TextInput from '../components/TextInput'

const casePreferenceOptions = [
  'High-value personal injury',
  'Auto collisions',
  'Premises liability',
  'Medical malpractice',
  'Employment disputes',
  'Products liability',
  'Mass tort / complex claims',
  'Other',
]

const initialApplication = {
  lawFirmName: '',
  primaryContactName: '',
  email: '',
  phone: '',
  website: '',
  statesServed: [],
  practiceAreas: [],
  numberOfAttorneys: '',
  preferredCaseTypes: [],
  monthlyCaseCapacity: '',
  googleBusinessProfileUrl: '',
  googleRating: '',
  largestSettlementOrVerdict: '',
  marketplaceFit: '',
  attorneysGoodStanding: '',
  goodStandingExplanation: '',
  accuracyCertified: false,
}

const LawFirmApplicationPage = ({ stateCodes, fallbackStates, practiceAreas }) => {
  const [form, setForm] = useState(initialApplication)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const stateOptions = stateCodes.length
    ? stateCodes.map((item) => ({ value: item.name || item.code, label: `${item.name} (${item.code})` }))
    : fallbackStates.map((state) => ({ value: state, label: state }))

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const toggleArrayValue = (key, value) => {
    setForm((prev) => {
      const current = new Set(prev[key])
      current.has(value) ? current.delete(value) : current.add(value)
      return { ...prev, [key]: [...current] }
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage('')

    if (!form.statesServed.length || !form.practiceAreas.length || !form.preferredCaseTypes.length) {
      setMessage('Please select at least one state, practice area, and preferred case type.')
      return
    }

    if (form.attorneysGoodStanding === 'no' && !form.goodStandingExplanation.trim()) {
      setMessage('Please explain the good standing issue before submitting.')
      return
    }

    setSubmitting(true)
    const { error } = await submitLawFirmApplication({
      law_firm_name: form.lawFirmName.trim(),
      primary_contact_name: form.primaryContactName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      website: form.website.trim(),
      states_served: form.statesServed,
      practice_areas: form.practiceAreas,
      number_of_attorneys: Number(form.numberOfAttorneys),
      preferred_case_types: form.preferredCaseTypes,
      monthly_case_capacity: Number(form.monthlyCaseCapacity),
      google_business_profile_url: form.googleBusinessProfileUrl.trim(),
      google_rating: form.googleRating ? Number(form.googleRating) : null,
      largest_settlement_or_verdict: form.largestSettlementOrVerdict.trim(),
      marketplace_fit: form.marketplaceFit.trim(),
      attorneys_good_standing: form.attorneysGoodStanding,
      good_standing_explanation: form.goodStandingExplanation.trim(),
      accuracy_certified: form.accuracyCertified,
    })
    setSubmitting(false)

    if (error) {
      setMessage(`Submission failed: ${error.message}`)
      return
    }

    setSubmitted(true)
    setMessage('Application submitted. Our team will review it and follow up by email.')
    setForm(initialApplication)
  }

  return (
    <div className="apply-shell">
      <header className="apply-topbar">
        <a className="apply-brand" href="/">
          <img src={tliLogo} alt="TLI logo" className="brand-logo" />
          <span>TLI Marketplace</span>
        </a>
        <a className="secondary-btn apply-link" href="/">
          Sign in
        </a>
      </header>

      <main className="apply-page">
        <section className="apply-intro">
          <div>
            <h1>Law firm marketplace application</h1>
            <p>Apply for access to review and receive marketplace case opportunities.</p>
          </div>
          <span className="profile-badge">Application</span>
        </section>

        <form className="apply-form" onSubmit={handleSubmit}>
          <ApplySection title="Basic Information">
            <TextInput label="Law firm name" value={form.lawFirmName} onChange={(value) => updateField('lawFirmName', value)} required />
            <TextInput label="Primary contact name" value={form.primaryContactName} onChange={(value) => updateField('primaryContactName', value)} required />
            <TextInput label="Email" type="email" value={form.email} onChange={(value) => updateField('email', value)} required />
            <TextInput label="Phone" type="tel" value={form.phone} onChange={(value) => updateField('phone', value)} required />
            <TextInput label="Website (Optional)" type="url" value={form.website} onChange={(value) => updateField('website', value)} placeholder="https://example.com" />
          </ApplySection>

          <ApplySection title="Practice Information">
            <MultiSelectDropdown
              label="States served"
              options={stateOptions}
              value={form.statesServed}
              onChange={(value) => toggleArrayValue('statesServed', value)}
              placeholder="Select states served"
            />
            <CheckboxGroup
              label="Practice Areas"
              options={practiceAreas.map((area) => ({ value: area, label: area }))}
              value={form.practiceAreas}
              onChange={(value) => toggleArrayValue('practiceAreas', value)}
            />
            <TextInput
              label="Number of attorneys"
              type="number"
              min="1"
              value={form.numberOfAttorneys}
              onChange={(value) => updateField('numberOfAttorneys', value)}
              required
            />
          </ApplySection>

          <ApplySection title="Case Preferences">
            <CheckboxGroup
              label="Types of cases you prefer"
              options={casePreferenceOptions.map((item) => ({ value: item, label: item }))}
              value={form.preferredCaseTypes}
              onChange={(value) => toggleArrayValue('preferredCaseTypes', value)}
            />
            <TextInput
              label="Approximate number of new cases you can take each month"
              type="number"
              min="0"
              value={form.monthlyCaseCapacity}
              onChange={(value) => updateField('monthlyCaseCapacity', value)}
              required
            />
          </ApplySection>

          <ApplySection title="Quality & Experience">
            <TextInput
              label="Google Business Profile URL"
              type="url"
              value={form.googleBusinessProfileUrl}
              onChange={(value) => updateField('googleBusinessProfileUrl', value)}
              placeholder="Optional"
            />
            <TextInput
              label="Approximate Google rating"
              type="number"
              min="0"
              max="5"
              step="0.1"
              value={form.googleRating}
              onChange={(value) => updateField('googleRating', value)}
              placeholder="Optional"
            />
            <TextInput
              label="Largest settlement or verdict"
              value={form.largestSettlementOrVerdict}
              onChange={(value) => updateField('largestSettlementOrVerdict', value)}
              placeholder="Optional"
            />
            <label className="form-field full">
              <span>Why do you believe your firm is a good fit for our marketplace?</span>
              <textarea
                maxLength={200}
                rows={3}
                value={form.marketplaceFit}
                onChange={(event) => updateField('marketplaceFit', event.target.value)}
                required
              />
              <small>{form.marketplaceFit.length}/200 characters</small>
            </label>
          </ApplySection>

          <ApplySection title="Verification">
            <fieldset className="radio-group full">
              <legend>Are all attorneys in good standing with their state bar?</legend>
              <label>
                <input
                  type="radio"
                  name="good-standing"
                  value="yes"
                  checked={form.attorneysGoodStanding === 'yes'}
                  onChange={(event) => updateField('attorneysGoodStanding', event.target.value)}
                  required
                />
                Yes
              </label>
              <label>
                <input
                  type="radio"
                  name="good-standing"
                  value="no"
                  checked={form.attorneysGoodStanding === 'no'}
                  onChange={(event) => updateField('attorneysGoodStanding', event.target.value)}
                />
                No
              </label>
            </fieldset>
            {form.attorneysGoodStanding === 'no' && (
              <label className="form-field full">
                <span>Please explain</span>
                <textarea
                  rows={3}
                  value={form.goodStandingExplanation}
                  onChange={(event) => updateField('goodStandingExplanation', event.target.value)}
                  required
                />
              </label>
            )}
          </ApplySection>

          <section className="apply-section">
            <label className="certify-row">
              <input
                type="checkbox"
                checked={form.accuracyCertified}
                onChange={(event) => updateField('accuracyCertified', event.target.checked)}
                required
              />
              <span>
                I certify that the information provided is accurate and understand that submission does not guarantee acceptance
                into the marketplace.
              </span>
            </label>
          </section>

          <div className="apply-actions">
            <a className="secondary-btn apply-link" href="/">
              Cancel
            </a>
            <button className="primary-btn" type="submit" disabled={submitting || submitted}>
              {submitting ? 'Submitting...' : submitted ? 'Submitted' : 'Submit application'}
            </button>
          </div>
          {message && <div className="auth-message">{message}</div>}
        </form>
      </main>
    </div>
  )
}

export default LawFirmApplicationPage

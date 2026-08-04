import { useState } from 'react'
import { submitLawFirmApplication } from '../api/applications'
import ApplySection from '../components/ApplySection'
import CheckboxGroup from '../components/CheckboxGroup'
import MultiSelectDropdown from '../components/MultiSelectDropdown'
import TextInput from '../components/TextInput'

const tliLogo = '/tli_logo.png'
const otherPracticeArea = 'Other'
const fallbackStateOptions = [
  { value: 'MO', label: 'Missouri (MO)' },
  { value: 'KS', label: 'Kansas (KS)' },
  { value: 'NE', label: 'Nebraska (NE)' },
  { value: 'IA', label: 'Iowa (IA)' },
]

const casePreferenceOptions = [
  'Can evaluate smaller personal injury cases',
  'Volume firm for routine injury claims',
  'Auto collisions',
  'Premises liability',
  'Trucking / commercial vehicle claims',
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
  otherPracticeArea: '',
  numberOfAttorneys: '',
  preferredCaseTypes: [],
  monthlyCaseCapacity: '',
  googleBusinessProfileUrl: '',
  googleRating: '',
  approximateClientsServed: '',
  clientServiceYears: '',
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
    ? stateCodes.map((item) => ({ value: item.code, label: `${item.name} (${item.code})` }))
    : fallbackStateOptions.filter((option) => fallbackStates.some((state) => option.label.startsWith(state)))
  const practiceAreaOptions = [...practiceAreas, otherPracticeArea].map((area) => ({ value: area, label: area }))
  const hasOtherPracticeArea = form.practiceAreas.includes(otherPracticeArea)

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

    if (hasOtherPracticeArea && !form.otherPracticeArea.trim()) {
      setMessage('Please enter the other practice area before submitting.')
      return
    }

    if (!form.googleBusinessProfileUrl.trim() || !form.googleRating) {
      setMessage('Please provide the Google Business Profile URL and approximate Google rating.')
      return
    }

    if (form.attorneysGoodStanding === 'no' && !form.goodStandingExplanation.trim()) {
      setMessage('Please explain the good standing issue before submitting.')
      return
    }

    const submittedPracticeAreas = form.practiceAreas.map((area) => (
      area === otherPracticeArea ? `Other: ${form.otherPracticeArea.trim()}` : area
    ))

    setSubmitting(true)
    const { error } = await submitLawFirmApplication({
      law_firm_name: form.lawFirmName.trim(),
      primary_contact_name: form.primaryContactName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      website: form.website.trim(),
      states_served: form.statesServed,
      practice_areas: submittedPracticeAreas,
      number_of_attorneys: Number(form.numberOfAttorneys),
      preferred_case_types: form.preferredCaseTypes,
      monthly_case_capacity: Number(form.monthlyCaseCapacity),
      google_business_profile_url: form.googleBusinessProfileUrl.trim(),
      google_rating: form.googleRating ? Number(form.googleRating) : null,
      approximate_clients_served: form.approximateClientsServed ? Number(form.approximateClientsServed) : null,
      client_service_years: form.clientServiceYears ? Number(form.clientServiceYears) : null,
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
              options={practiceAreaOptions}
              value={form.practiceAreas}
              onChange={(value) => toggleArrayValue('practiceAreas', value)}
            />
            {hasOtherPracticeArea && (
              <label className="form-field full other-practice-field">
                <span>Other practice area</span>
                <textarea
                  rows={2}
                  value={form.otherPracticeArea}
                  onChange={(event) => updateField('otherPracticeArea', event.target.value)}
                  placeholder="Enter additional practice area"
                  required
                />
              </label>
            )}
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
              placeholder="https://g.page/your-firm"
              required
            />
            <TextInput
              label="Approximate Google rating"
              type="number"
              min="0"
              max="5"
              step="0.1"
              value={form.googleRating}
              onChange={(value) => updateField('googleRating', value)}
              placeholder="4.8"
              required
            />
            <TextInput
              label="Approximate total clients served"
              type="number"
              min="0"
              value={form.approximateClientsServed}
              onChange={(value) => updateField('approximateClientsServed', value)}
              placeholder="Optional"
            />
            <TextInput
              label="Approximate years serving clients"
              type="number"
              min="0"
              step="0.5"
              value={form.clientServiceYears}
              onChange={(value) => updateField('clientServiceYears', value)}
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

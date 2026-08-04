import {
  addLawFirmApplicationCasePreference,
  addLawFirmApplicationPracticeArea,
  addLawFirmApplicationState,
  createLawFirmApplication,
  GoodStandingAnswer,
} from '@dataconnect/generated'

export const submitLawFirmApplication = async (application) => {
  try {
    const result = await createLawFirmApplication({
      lawFirmName: application.law_firm_name,
      primaryContactName: application.primary_contact_name,
      email: application.email,
      phone: application.phone,
      website: application.website || null,
      numberOfAttorneys: application.number_of_attorneys,
      monthlyCaseCapacity: application.monthly_case_capacity,
      googleBusinessProfileUrl: application.google_business_profile_url,
      googleRating: application.google_rating,
      approximateClientsServed: application.approximate_clients_served,
      clientServiceYears: application.client_service_years,
      marketplaceFit: application.marketplace_fit,
      attorneysGoodStanding: application.attorneys_good_standing === 'yes'
        ? GoodStandingAnswer.YES
        : GoodStandingAnswer.NO,
      goodStandingExplanation: application.good_standing_explanation || null,
    })

    const applicationId = result.data?.lawFirmApplication_insert?.id
    if (!applicationId) {
      throw new Error('Application was created but no id was returned.')
    }

    await Promise.all([
      ...application.states_served.map((stateCode) => (
        addLawFirmApplicationState({ applicationId, stateCode })
      )),
      ...application.practice_areas.map((name) => (
        addLawFirmApplicationPracticeArea({ applicationId, name })
      )),
      ...application.preferred_case_types.map((name) => (
        addLawFirmApplicationCasePreference({ applicationId, name })
      )),
    ])

    return { data: { id: applicationId }, error: null }
  } catch (error) {
    console.error('Submit law firm application error', error)
    return {
      data: null,
      error: {
        message: error?.message || 'Failed to submit application',
        code: error?.code,
      },
    }
  }
}

import { initializeApp } from 'firebase/app'
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: 'AIzaSyCboCSoLd7LM3v0pe5p2lf2qljUvNbd6Kk',
  authDomain: 'peak-bit-486121-n6.firebaseapp.com',
  projectId: 'peak-bit-486121-n6',
  storageBucket: 'peak-bit-486121-n6.firebasestorage.app',
  messagingSenderId: '207278105140',
  appId: '1:207278105140:web:38ef0959cb115cc24f2061',
  measurementId: 'G-Y0NP8509F5',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

export const analyticsPromise = isAnalyticsSupported()
  .then((supported) => (supported ? getAnalytics(app) : null))
  .catch(() => null)

import { getApp, getApps, initializeApp } from "firebase/app"
import {
  getAnalytics,
  isSupported as isAnalyticsSupported,
  type Analytics,
} from "firebase/analytics"
import { getAuth, GoogleAuthProvider } from "firebase/auth"
import { getFirestore } from "firebase/firestore"

// Exported so the user-management flow can spin up a short-lived *secondary*
// Firebase app to create accounts without disturbing the admin's session.
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

// Reuse the existing app during HMR / on the client instead of re-initializing.
export const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig)

// Auth
export const auth = getAuth(firebaseApp)
export const googleProvider = new GoogleAuthProvider()

// Database (Cloud Firestore) — ready for when we start persisting data.
export const db = getFirestore(firebaseApp)

// Analytics — only runs in the browser and only where the environment
// supports it (needs window + a valid measurementId).
export let analytics: Analytics | null = null
if (typeof window !== "undefined") {
  void isAnalyticsSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(firebaseApp)
      }
    })
    .catch(() => {
      // Analytics is optional; ignore failures (e.g. blocked by the browser).
    })
}

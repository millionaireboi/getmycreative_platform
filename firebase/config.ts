// Use the modern v9+ modular SDK for Firebase.
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
// Use the standard getFirestore function for initialization.
import { getFirestore } from "firebase/firestore";
// FIX: Import directly from the official 'firebase/storage' package. This is
// the correct way to import Firebase services in a Vite/npm project and resolves
// a critical module shadowing issue caused by a local 'firebase/storage.ts' file.
import { getStorage, ref, getDownloadURL, uploadBytesResumable } from "firebase/storage";

const logStorageUsage = async (bytes: number, path: string) => {
  try {
    const module = await import('../services/usageLogger.ts');
    await module.recordUsageEvent({
      actionType: 'storageUpload',
      modelUsed: 'firebase-storage',
      gcsBytesStored: bytes,
      extra: { path },
    });
  } catch (error) {
    console.warn('Failed to log storage usage', error);
  }
};

// --- START: ADD YOUR FIREBASE CONFIGURATION HERE ---
// Replace the placeholder values below with the configuration from your own Firebase project.
// You can find this in your Firebase project settings under "General".
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  // The storage bucket for this project's assets. For newer Firebase projects,
  // this uses the '.firebasestorage.app' domain.
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
} as const;
// --- END: ADD YOUR FIREBASE CONFIGURATION HERE ---

// Initialize Firebase with the modern v9+ syntax
const app = initializeApp(firebaseConfig);

// Initialize and export all Firebase services from this central file
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(app);

// Initialize Firestore using the standard `getFirestore` function for maximum stability.
export const db = getFirestore(app);


/**
 * Uploads a file or blob to Firebase Storage and returns its public download URL.
 * This version uses `uploadBytesResumable` to support progress tracking and better error handling.
 * @param file The file or blob to upload.
 * @param path The path in storage where the file should be saved.
 * @param onProgress An optional callback function to receive upload progress updates (0-100).
 * @returns A promise that resolves to the public download URL of the file.
 */
export const uploadFileToStorage = (
  file: File | Blob,
  path: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Generate a unique filename
    const fileName = (file instanceof File && file.name)
      ? `${Date.now()}-${file.name}`
      : `${Date.now()}-${Math.random().toString(36).substring(2)}.png`;

    const storageRef = ref(storage, `${path}/${fileName}`);
    const metadata = { contentType: file.type };

    const uploadTask = uploadBytesResumable(storageRef, file, metadata);

    // Listen for state changes, errors, and completion of the upload.
    uploadTask.on('state_changed',
      (snapshot) => {
        // Get task progress, including the number of bytes uploaded and the total number of bytes to be uploaded
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) {
            onProgress(progress);
        }
      },
      (error) => {
        console.error("Upload failed with error:", error.code, error.message);
        // A full list of error codes is available at
        // https://firebase.google.com/docs/storage/web/handle-errors
        
        // The most common cause for this is a CORS configuration issue on the GCS bucket.
        // The 'storage/unauthorized' error is thrown when the user doesn't have permission,
        // which includes failures of the CORS preflight (OPTIONS) request.
        if (error.code === 'storage/unauthorized' || error.code === 'storage/object-not-found') {
            const corsErrorMessage = "Upload failed due to a permission error. This is likely a CORS configuration issue on your Firebase Storage bucket. Please check your bucket's CORS settings to ensure your web app's origin is allowed for POST/PUT requests.";
            console.error(corsErrorMessage);
            reject(new Error(corsErrorMessage));
        } else {
            reject(error);
        }
      },
      () => {
        // Upload completed successfully, now we can get the download URL
        getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
          void logStorageUsage(uploadTask.snapshot.totalBytes, `${path}/${fileName}`);
          resolve(downloadURL);
        }).catch(reject);
      }
    );
  });
};

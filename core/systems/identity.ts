// Use standard Firebase v9+ modular SDK imports
import type { User as FirebaseUser } from 'firebase/auth';
import { User, UserRole, SubscriptionTier } from '../types/index.ts';
import { db } from '../../firebase/config.ts';
import {
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    getDocs,
    Timestamp,
    DocumentSnapshot,
    DocumentData,
    runTransaction
} from 'firebase/firestore';


const usersCollection = collection(db, 'users');

// Helper to convert Firestore doc to User object
const docToUser = (doc: DocumentSnapshot<DocumentData>): User => {
    const data = doc.data();
    if (!data) throw new Error("Document data is missing!");
    return {
        id: doc.id,
        ...data,
        createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
    } as User;
};

/**
 * Retrieves a user profile from Firestore, creating one if it doesn't exist.
 * This function is idempotent and serves as the single source of truth for user profiles.
 * It uses a Firestore Transaction to make the get-or-create operation atomic, preventing race conditions.
 *
 * @param firebaseUser The user object from Firebase Authentication.
 * @returns A promise that resolves to our application-specific User object.
 */
export const getUserProfile = async (firebaseUser: FirebaseUser): Promise<User> => {
    const userRef = doc(db, 'users', firebaseUser.uid);

    // Use a transaction to ensure atomicity of the get-or-create operation.
    return runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);

        if (userSnap.exists()) {
            return docToUser(userSnap);
        }

        // User profile doesn't exist, so create it within the transaction.
        const newUserProfile: Omit<User, 'id'> = {
            email: firebaseUser.email!,
            role: UserRole.CUSTOMER, // Default role for all new users
            tier: SubscriptionTier.FREE, // Default tier for all new users
            displayName: firebaseUser.displayName || firebaseUser.email!.split('@')[0],
            photoURL: firebaseUser.photoURL || `https://api.dicebear.com/8.x/initials/svg?seed=${firebaseUser.email!}`,
            createdAt: new Date(firebaseUser.metadata.creationTime || Date.now()),
        };

        // Assign special roles for specific users (can be managed by an admin panel)
        if (newUserProfile.email === 'admin@getmycreative.com') {
            newUserProfile.role = UserRole.ADMIN;
            newUserProfile.tier = SubscriptionTier.PRO;
        } else if (newUserProfile.email === 'designer@getmycreative.com') {
            newUserProfile.role = UserRole.DESIGNER;
            newUserProfile.tier = SubscriptionTier.PRO;
        }

        // Convert to Firestore-compatible data
        const newProfileData = {
            ...newUserProfile,
            createdAt: Timestamp.fromDate(newUserProfile.createdAt)
        };

        transaction.set(userRef, newProfileData);

        return { id: firebaseUser.uid, ...newUserProfile };
    });
};

/**
 * An explicit 'create' function which is now just a wrapper around the
 * idempotent `getUserProfile` function.
 */
export const createUserProfile = (firebaseUser: FirebaseUser): Promise<User> => {
    return getUserProfile(firebaseUser);
};

/**
 * Upgrades a user's subscription tier in Firestore.
 * @param userId The ID of the user to upgrade.
 */
export const upgradeUserToPro = async (userId: string): Promise<User | null> => {
    const userRef = doc(db, 'users', userId);
    try {
        await updateDoc(userRef, { tier: SubscriptionTier.PRO });
        const updatedUserSnap = await getDoc(userRef);
        return updatedUserSnap.exists() ? docToUser(updatedUserSnap) : null;
    } catch (error) {
        console.error("Error upgrading user to pro:", error);
        return null;
    }
};


/**
 * Updates a user's brand colors in Firestore.
 * @param userId The ID of the user to update.
 * @param colors An array of hex color strings.
 */
export const updateUserBrandColors = async (userId: string, colors: string[]): Promise<User | null> => {
    const userRef = doc(db, 'users', userId);
    try {
        await updateDoc(userRef, { brandColors: colors });
        const updatedUserSnap = await getDoc(userRef);
        return updatedUserSnap.exists() ? docToUser(updatedUserSnap) : null;
    } catch (error) {
        console.error("Error updating brand colors:", error);
        return null;
    }
};

// --- New functions for Admin Panel ---

/**
 * Retrieves all user profiles from Firestore.
 */
export const getAllUsers = async (): Promise<User[]> => {
    const querySnapshot = await getDocs(usersCollection);
    return querySnapshot.docs.map(docToUser);
};

/**
 * Updates the role of a specific user in Firestore.
 */
export const updateUserRole = async (userId: string, role: UserRole): Promise<User | null> => {
    const userRef = doc(db, 'users', userId);
    try {
        await updateDoc(userRef, { role });
        const updatedUserSnap = await getDoc(userRef);
        return updatedUserSnap.exists() ? docToUser(updatedUserSnap) : null;
    } catch (error) {
        console.error("Error updating user role:", error);
        return null;
    }
};
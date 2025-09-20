import { Template, TemplateStatus, Mark } from '../types/index.ts';
import { db } from '../../firebase/config.ts';
import { INITIAL_TEMPLATES, LEGACY_TEMPLATE_IDS, LEGACY_TEMPLATE_IMAGE_PREFIXES } from '../../constants.ts';
// Use standard Firebase v9+ modular SDK imports
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    updateDoc,
    addDoc,
    deleteDoc,
    Timestamp,
    increment,
    DocumentSnapshot,
    DocumentData,
    getDoc,
    writeBatch,
    limit
} from 'firebase/firestore';


const templatesCollection = collection(db, 'templates');
const LEGACY_TEMPLATE_ID_SET = new Set(LEGACY_TEMPLATE_IDS);

const stripLegacyTemplates = (templates: Template[]): Template[] => {
    return templates.filter(template => {
        if (!template.imageUrl) {
            return false;
        }

        if (LEGACY_TEMPLATE_ID_SET.has(template.id)) {
            return false;
        }

        const imageUrl = template.imageUrl || '';
        if (LEGACY_TEMPLATE_IMAGE_PREFIXES.some(prefix => imageUrl.startsWith(prefix))) {
            return false;
        }

        return true;
    });
};

// Helper to convert Firestore doc to Template object
const docToTemplate = (doc: DocumentSnapshot<DocumentData>): Template => {
    const data = doc.data();
    if (!data) throw new Error("Document data is missing!");
    // FIX: Add a fallback to new Date() if timestamp fields are missing.
    // This prevents a crash if a document is malformed or in a transitional state,
    // ensuring the application remains stable.
    const createdAt = (data.createdAt as Timestamp)?.toDate() || new Date();
    const updatedAt = (data.updatedAt as Timestamp)?.toDate() || new Date();
    const useCases = Array.isArray(data.useCases)
        ? data.useCases.filter((entry: unknown): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : [];

    return {
        id: doc.id,
        ...data,
        createdAt: createdAt,
        updatedAt: updatedAt,
        useCases,
    } as Template;
};

// NOTE: The initial templates data should be seeded into the Firestore 'templates' collection one time.
// This can be done with a simple script. The application now assumes this data exists in the database.

export const getPublishedTemplates = async (): Promise<Template[]> => {
    try {
        const q = query(templatesCollection, where("status", "==", TemplateStatus.PUBLISHED), where("isArchived", "==", false));
        const querySnapshot = await getDocs(q);
        const firestoreTemplates = stripLegacyTemplates(querySnapshot.docs.map(docToTemplate));

        if (firestoreTemplates.length > 0) {
            return firestoreTemplates;
        }

        const fallbackTemplates = stripLegacyTemplates(INITIAL_TEMPLATES);
        if (fallbackTemplates.length > 0) {
            console.warn("Firestore 'templates' collection is empty or unreachable. Serving limited fallback templates.");
            return fallbackTemplates;
        }

        console.warn("No published templates available after filtering legacy placeholders.");
        return [];
    } catch (error) {
        console.error("Failed to fetch templates from Firestore, serving fallback. Error:", error);
        const fallbackTemplates = stripLegacyTemplates(INITIAL_TEMPLATES);
        if (fallbackTemplates.length > 0) {
            return fallbackTemplates;
        }
        return [];
    }
};

export const getPendingTemplates = async (): Promise<Template[]> => {
    const q = query(templatesCollection, where("status", "==", TemplateStatus.PENDING_REVIEW));
    const querySnapshot = await getDocs(q);
    return stripLegacyTemplates(querySnapshot.docs.map(docToTemplate));
};

export const getTemplatesByDesigner = async (designerId: string): Promise<Template[]> => {
    const q = query(templatesCollection, where("designerId", "==", designerId));
    const querySnapshot = await getDocs(q);
    const templates = stripLegacyTemplates(querySnapshot.docs.map(docToTemplate));
    // Sort on the client to avoid needing a composite index in Firestore
    return templates.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
};

export const createTemplate = async (
    designerId: string, 
    imageUrl: string, 
    title: string,
    initialData?: { marks: Mark[], prompt: string, tags: string[], useCases?: string[] }
): Promise<Template> => {
    const now = new Date();
    const newTemplateData = {
        designerId,
        imageUrl,
        title,
        initialMarks: initialData?.marks || [],
        prompt: initialData?.prompt || '',
        tags: initialData?.tags || [],
        useCases: initialData?.useCases || [],
        category: '',
        placeholders: {
            logo: initialData?.marks?.some(m => m.type === 'image' && m.id.includes('logo')) || false,
            productImage: initialData?.marks?.some(m => m.type === 'image' && !m.id.includes('logo')) || false,
            headline: initialData?.marks?.some(m => m.type === 'text' && m.id.includes('headline')) || false,
            body: initialData?.marks?.some(m => m.type === 'text' && m.id.includes('body')) || false,
        },
        status: TemplateStatus.DRAFT,
        version: 1,
        isArchived: false,
        analytics: { uses: 0 },
        isAnalyzed: !!initialData,
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
    };

    const docRef = await addDoc(templatesCollection, newTemplateData);

    return {
        id: docRef.id,
        ...newTemplateData,
        createdAt: now,
        updatedAt: now,
    };
};

// FIX: Added missing 'trackTemplateUsage' function.
/**
 * Increments the usage count for a template.
 */
export const trackTemplateUsage = async (templateId: string): Promise<void> => {
    const templateRef = doc(db, 'templates', templateId);
    try {
        await updateDoc(templateRef, {
            'analytics.uses': increment(1)
        });
    } catch (error) {
        // It's possible the user is using a local-only fallback template
        if (error instanceof Error && error.message.includes("No document to update")) {
            console.log(`Usage tracking for local template ID "${templateId}" skipped.`);
        } else {
            console.error("Error tracking template usage:", error);
        }
    }
};

// FIX: Added missing 'updateTemplate' function.
/**
 * Updates a template document in Firestore.
 */
export const updateTemplate = async (templateId: string, updates: Partial<Omit<Template, 'id'>>): Promise<void> => {
    const templateRef = doc(db, 'templates', templateId);
    const updateData: DocumentData = {
        ...updates,
        updatedAt: Timestamp.now()
    };
    // Make sure we are not trying to save local blob URLs to firestore
    if (typeof updateData.imageUrl === 'string' && updateData.imageUrl.startsWith('blob:')) {
        delete updateData.imageUrl;
    }
    await updateDoc(templateRef, updateData);
};

// FIX: Added missing 'createTemplateVersion' function.
/**
 * Creates a new version of a template, archives the old one.
 */
export const createTemplateVersion = async (originalTemplateId: string): Promise<Template | null> => {
    const originalTemplateRef = doc(db, 'templates', originalTemplateId);
    const originalSnap = await getDoc(originalTemplateRef);

    if (!originalSnap.exists()) {
        console.error("Original template not found for versioning.");
        return null;
    }

    const originalData = originalSnap.data() as Omit<Template, 'id' | 'createdAt' | 'updatedAt'> & { createdAt: Timestamp, updatedAt: Timestamp };
    const now = new Date();

    const newVersionData = {
        ...originalData,
        parentId: originalTemplateId,
        version: originalData.version + 1,
        status: TemplateStatus.DRAFT,
        isArchived: false,
        analytics: { uses: 0 }, // Reset analytics
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
    };

    const newDocRef = await addDoc(templatesCollection, newVersionData);

    // Archive the original template
    await updateDoc(originalTemplateRef, { isArchived: true });
    
    return {
        id: newDocRef.id,
        ...newVersionData,
        createdAt: now,
        updatedAt: now,
    };
};

export const deleteTemplate = async (templateId: string): Promise<void> => {
    const templateRef = doc(db, 'templates', templateId);
    await deleteDoc(templateRef);
};

/**
 * Seeds the Firestore database with the initial set of templates from constants.ts.
 * This is a one-time operation for a new project setup.
 */
export const seedInitialTemplates = async (): Promise<string> => {
    if (INITIAL_TEMPLATES.length === 0) {
        const message = "No initial templates configured; skipping seeding.";
        console.log(message);
        return message;
    }
    // Check if templates already exist to prevent accidental overwrite.
    const q = query(templatesCollection, limit(1));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
        const message = "Database already contains templates. Seeding aborted.";
        console.log(message);
        return message;
    }

    try {
        console.log("Templates collection is empty. Seeding initial templates...");
        const batch = writeBatch(db);

        INITIAL_TEMPLATES.forEach(template => {
            const templateRef = doc(db, 'templates', template.id);
            // Convert JS Date objects to Firestore Timestamps
            const firestoreData = {
                ...template,
                createdAt: Timestamp.fromDate(template.createdAt),
                updatedAt: Timestamp.fromDate(template.updatedAt),
            };
            batch.set(templateRef, firestoreData);
        });

        await batch.commit();
        const message = `Successfully seeded ${INITIAL_TEMPLATES.length} templates.`;
        console.log(message);
        return message;
    } catch (error) {
        console.error("Error seeding templates:", error);
        if (error instanceof Error) {
            return `Error seeding templates: ${error.message}`;
        }
        return "An unknown error occurred during seeding.";
    }
};

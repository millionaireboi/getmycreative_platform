import { Project, Template, GeneratedImage } from '../types/index.ts';
import { trackTemplateUsage } from './templateStore.ts';
import { db } from '../../firebase/config.ts';
// Use standard Firebase v9+ modular SDK imports
import { 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    doc, 
    deleteDoc, 
    updateDoc,
    orderBy,
    Timestamp,
    DocumentSnapshot,
    DocumentData
} from 'firebase/firestore';


const projectsCollection = collection(db, 'projects');

// Helper to convert Firestore doc to Project object
const docToProject = (doc: DocumentSnapshot<DocumentData>): Project => {
    const data = doc.data();
    if (!data) throw new Error("Document data is missing!");

    // FIX: Add fallbacks for timestamps to prevent crashes on missing data.
    const createdAt = (data.createdAt as Timestamp)?.toDate() || new Date();
    const updatedAt = (data.updatedAt as Timestamp)?.toDate() || new Date();

    return {
        id: doc.id,
        ...data,
        createdAt: createdAt,
        updatedAt: updatedAt,
    } as Project;
};


/**
 * Creates a new project from a template and saves it to Firestore.
 */
export const createProject = async (userId: string, template: Template): Promise<Project> => {
    const now = new Date();
    const newProjectData = {
        userId,
        name: template.title || 'Untitled Project',
        templateId: template.id,
        templateImageUrl: template.imageUrl,
        basePrompt: template.prompt,
        initialMarks: template.initialMarks || [],
        history: [{
            id: template.id,
            imageUrl: template.imageUrl,
            prompt: "Original Template"
        }],
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
    };

    const docRef = await addDoc(projectsCollection, newProjectData);
    
    // Track template usage for analytics
    if (template.status !== 'draft') { // Don't track usage for custom one-off uploads
        await trackTemplateUsage(template.id);
    }
    
    return {
        id: docRef.id,
        ...newProjectData,
        createdAt: now,
        updatedAt: now,
    };
};

/**
 * Retrieves all projects for a specific user from Firestore.
 */
export const getUserProjects = async (userId: string): Promise<Project[]> => {
    const q = query(projectsCollection, where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    const projects = querySnapshot.docs.map(docToProject);
    // Sort on the client to avoid needing a composite index in Firestore
    return projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
};

/**
 * Retrieves all projects from Firestore.
 */
export const getAllProjects = async (): Promise<Project[]> => {
    const q = query(projectsCollection, orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(docToProject);
};


/**
 * Updates the version history of a project in Firestore.
 */
export const updateProjectHistory = async (projectId: string, history: GeneratedImage[]): Promise<Project | null> => {
    try {
        const projectRef = doc(db, 'projects', projectId);
        await updateDoc(projectRef, {
            history,
            updatedAt: Timestamp.now()
        });
        // For simplicity, we don't re-fetch the document here, but in a real app you might.
        return {} as Project; // Placeholder
    } catch (error) {
        console.error("Error updating project history:", error);
        return null;
    }
};

/**
 * Updates the name of a project in Firestore.
 */
export const updateProjectName = async (projectId: string, name: string): Promise<Project | null> => {
    try {
        const projectRef = doc(db, 'projects', projectId);
        await updateDoc(projectRef, {
            name,
            updatedAt: Timestamp.now()
        });
        return {} as Project; // Placeholder
    } catch (error) {
        console.error("Error updating project name:", error);
        return null;
    }
}

/**
 * Deletes a project from Firestore.
 */
export const deleteProject = async (projectId: string): Promise<void> => {
    const projectRef = doc(db, 'projects', projectId);
    await deleteDoc(projectRef);
};
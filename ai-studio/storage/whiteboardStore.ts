import type { Board, Connector } from '../types.ts';
import type { WhiteboardWorkspace } from '../../core/types/index.ts';
import {
  createUserWhiteboardWorkspace,
  getUserWhiteboardWorkspace,
  updateUserWhiteboardWorkspace,
} from '../../core/systems/projectStore.ts';

const STORAGE_PREFIX = 'aiStudio:workspace';

const getStorageKey = (userId?: string | null) => {
  const suffix = userId && userId.trim().length > 0 ? userId : 'guest';
  return `${STORAGE_PREFIX}:${suffix}`;
};

export interface StoredWorkspaceState {
  id: string | null;
  name: string;
  boards: Board[];
  connectors: Connector[];
  createdAt?: string;
  updatedAt: string;
}

const DEFAULT_WORKSPACE_NAME = 'AI Studio Workspace';
const workspacePresenceCache = new Map<string, boolean>();

const serializeWorkspace = (workspace: WhiteboardWorkspace): StoredWorkspaceState => ({
  id: workspace.id,
  name: workspace.name ?? DEFAULT_WORKSPACE_NAME,
  boards: Array.isArray(workspace.boards) ? workspace.boards : [],
  connectors: Array.isArray(workspace.connectors) ? workspace.connectors : [],
  createdAt: workspace.createdAt?.toISOString(),
  updatedAt: workspace.updatedAt?.toISOString() ?? new Date().toISOString(),
});

const readLocalState = (userId?: string | null): StoredWorkspaceState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredWorkspaceState;
    if (!parsed || !Array.isArray(parsed.boards) || !Array.isArray(parsed.connectors)) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to load AI Studio workspace from local storage:', error);
    return null;
  }
};

const writeLocalState = (userId: string | undefined | null, payload: StoredWorkspaceState) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to persist AI Studio workspace locally:', error);
  }
};

export const loadWhiteboardState = async (userId?: string | null): Promise<StoredWorkspaceState | null> => {
  if (userId && userId.trim().length > 0) {
    try {
      const workspace = await getUserWhiteboardWorkspace(userId);
      if (workspace) {
        workspacePresenceCache.set(userId, true);
        const serialized = serializeWorkspace(workspace);
        writeLocalState(userId, serialized);
        return serialized;
      }
      workspacePresenceCache.set(userId, false);
    } catch (error) {
      console.warn('Failed to load AI Studio workspace from Firestore. Falling back to local data:', error);
    }
  }

  return readLocalState(userId);
};

export const saveWhiteboardState = async (
  userId: string | undefined | null,
  data: { boards: Board[]; connectors: Connector[]; name?: string }
): Promise<void> => {
  const payload: StoredWorkspaceState = {
    id: userId ?? 'guest',
    name: data.name && data.name.trim().length > 0 ? data.name : DEFAULT_WORKSPACE_NAME,
    boards: data.boards,
    connectors: data.connectors,
    updatedAt: new Date().toISOString(),
  };

  writeLocalState(userId, payload);

  if (!userId || userId.trim().length === 0) {
    return;
  }

  const hasWorkspace = workspacePresenceCache.get(userId);
  try {
    if (hasWorkspace) {
      await updateUserWhiteboardWorkspace(userId, {
        boards: data.boards,
        connectors: data.connectors,
        name: payload.name,
      });
    } else {
      await createUserWhiteboardWorkspace(userId, {
        boards: data.boards,
        connectors: data.connectors,
        name: payload.name,
      });
      workspacePresenceCache.set(userId, true);
    }
  } catch (error) {
    console.warn('Failed to persist AI Studio workspace to Firestore. Local draft remains available:', error);
  }
};

export const clearWhiteboardState = (userId?: string | null) => {
  if (userId) {
    workspacePresenceCache.delete(userId);
  }
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(getStorageKey(userId));
  } catch (error) {
    console.warn('Failed to clear AI Studio workspace:', error);
  }
};

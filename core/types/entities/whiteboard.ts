import type { Board, Connector } from '../../../ai-studio/types.ts';

export interface WhiteboardWorkspace {
  id: string;
  userId: string;
  name: string;
  boards: Board[];
  connectors: Connector[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WhiteboardWorkspacePayload {
  boards: Board[];
  connectors: Connector[];
  name?: string;
}

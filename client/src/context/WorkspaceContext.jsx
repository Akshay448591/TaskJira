import { createContext, useContext } from 'react';
export const WorkspaceCtx = createContext(null);
export const useWorkspace = () => useContext(WorkspaceCtx);

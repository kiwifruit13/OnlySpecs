import { contextBridge, ipcRenderer } from 'electron';

export interface EditorData {
  id: string;
  name: string;
  content: string;
  filePath?: string;
}

const electronAPI = {
  // Load all saved editors
  loadAllEditors: (): Promise<EditorData[]> => ipcRenderer.invoke('editor:load-all'),

  // Save a single editor
  saveEditor: (editor: EditorData): Promise<void> => ipcRenderer.invoke('editor:save', editor),

  // Save all editors
  saveAllEditors: (editors: EditorData[]): Promise<void> => ipcRenderer.invoke('editor:save-all', editors),

  // Rename an editor
  renameEditor: (id: string, newName: string): Promise<void> => ipcRenderer.invoke('editor:rename', id, newName),

  // Delete an editor
  deleteEditor: (id: string): Promise<void> => ipcRenderer.invoke('editor:delete', id),

  // Save editor order
  saveOrder: (order: string[]): Promise<void> => ipcRenderer.invoke('editor:save-order', order),

  // Get next index for untitled naming
  getNextIndex: (): Promise<number> => ipcRenderer.invoke('editor:get-next-index'),

  // Increment next index
  incrementNextIndex: (): Promise<number> => ipcRenderer.invoke('editor:increment-next-index'),

  // PTY Terminal APIs
  createTerminal: (sessionId: string, cwd?: string): Promise<{ pid: number }> =>
    ipcRenderer.invoke('terminal:create', sessionId, cwd),

  writeTerminal: (sessionId: string, data: string): Promise<void> =>
    ipcRenderer.invoke('terminal:write', sessionId, data),

  resizeTerminal: (sessionId: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke('terminal:resize', sessionId, cols, rows),

  killTerminal: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke('terminal:kill', sessionId),

  // Listen for terminal data
  onTerminalData: (sessionId: string, callback: (data: string) => void) => {
    const listener = (_event: any, data: string) => callback(data);
    ipcRenderer.on(`terminal:data-${sessionId}`, listener);
    return () => ipcRenderer.removeListener(`terminal:data-${sessionId}`, listener);
  },

  // Listen for terminal exit
  onTerminalExit: (sessionId: string, callback: (exitCode: number, signal: number) => void) => {
    const listener = (_event: any, data: { exitCode: number; signal: number }) =>
      callback(data.exitCode, data.signal);
    ipcRenderer.once(`terminal:exit-${sessionId}`, listener);
    return () => ipcRenderer.removeListener(`terminal:exit-${sessionId}`, listener);
  },

  // GitHub repository import
  importGithubRepo: (repoUrl: string, summarizeSpecs: string): Promise<{ success: boolean; repoPath?: string; instructionsPath?: string; output?: string; error?: string }> =>
    ipcRenderer.invoke('github:clone-and-process', repoUrl, summarizeSpecs),

  // Listen for GitHub import progress
  onGithubProgress: (callback: (message: string) => void): (() => void) => {
    const listener = (_event: any, message: string) => callback(message);
    ipcRenderer.on('github:progress', listener);
    return () => ipcRenderer.removeListener('github:progress', listener);
  },

  // Configuration APIs
  loadConfig: (): Promise<{ apiKey: string; baseUrl: string; lastProjectPath: string }> =>
    ipcRenderer.invoke('config:load'),

  saveConfig: (config: { apiKey: string; baseUrl: string; lastProjectPath?: string }): Promise<void> =>
    ipcRenderer.invoke('config:save', config),

  // Read file content
  readFile: (filePath: string): Promise<{ success: boolean; content?: string; error?: string }> =>
    ipcRenderer.invoke('fs:readFile', filePath),

  // Write file content
  writeFile: (filePath: string, content: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),

  // Select directory
  selectDirectory: (): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('fs:selectDirectory'),

  // Read directory
  readDirectory: (dirPath: string): Promise<{ success: boolean; entries?: Array<{ name: string; path: string; isDirectory: boolean }>; error?: string }> =>
    ipcRenderer.invoke('fs:readDirectory', dirPath),

  // Create a new project
  createProject: (): Promise<{ success: boolean; projectPath?: string; error?: string }> =>
    ipcRenderer.invoke('project:create'),

  // Delete file
  deleteFile: (filePath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('fs:deleteFile', filePath),

  // Create directory
  createDirectory: (dirPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('fs:createDirectory', dirPath),

  // Check if path exists
  pathExists: (path: string): Promise<{ exists: boolean }> =>
    ipcRenderer.invoke('fs:exists', path),
};

export interface ElectronAPIType {
  loadAllEditors(): Promise<EditorData[]>;
  saveEditor(editor: EditorData): Promise<void>;
  saveAllEditors(editors: EditorData[]): Promise<void>;
  renameEditor(id: string, newName: string): Promise<void>;
  deleteEditor(id: string): Promise<void>;
  saveOrder(order: string[]): Promise<void>;
  getNextIndex(): Promise<number>;
  incrementNextIndex(): Promise<number>;
  createTerminal(sessionId: string, cwd?: string): Promise<{ pid: number }>;
  writeTerminal(sessionId: string, data: string): Promise<void>;
  resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void>;
  killTerminal(sessionId: string): Promise<void>;
  onTerminalData(sessionId: string, callback: (data: string) => void): () => void;
  onTerminalExit(sessionId: string, callback: (exitCode: number, signal: number) => void): () => void;
  importGithubRepo(repoUrl: string, summarizeSpecs: string): Promise<{ success: boolean; repoPath?: string; instructionsPath?: string; output?: string; error?: string }>;
  onGithubProgress(callback: (message: string) => void): () => void;
  loadConfig(): Promise<{ apiKey: string; baseUrl: string; lastProjectPath: string }>;
  saveConfig(config: { apiKey: string; baseUrl: string; lastProjectPath?: string }): Promise<void>;
  readFile(filePath: string): Promise<{ success: boolean; content?: string; error?: string }>;
  writeFile(filePath: string, content: string): Promise<{ success: boolean; error?: string }>;
  selectDirectory(): Promise<{ success: boolean; path?: string; error?: string }>;
  readDirectory(dirPath: string): Promise<{ success: boolean; entries?: Array<{ name: string; path: string; isDirectory: boolean }>; error?: string }>;
  createProject(): Promise<{ success: boolean; projectPath?: string; error?: string }>;
  deleteFile(filePath: string): Promise<{ success: boolean; error?: string }>;
  createDirectory(dirPath: string): Promise<{ success: boolean; error?: string }>;
  pathExists(path: string): Promise<{ exists: boolean }>;
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

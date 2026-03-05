import { EditorData } from '../../preload';

export interface EditorState {
  id: string;
  name: string;
  content: string;
  monacoInstance?: any;
  isDirty: boolean;
  domElement?: HTMLElement;
}

declare global {
  interface Window {
    monaco: any;
  }
}

export class EditorStateManager {
  private editors: EditorState[] = [];
  private listeners: Set<(editors: EditorState[]) => void> = new Set();
  private autoSaveTimer: Map<string, NodeJS.Timeout> = new Map();
  private readonly AUTO_SAVE_DELAY = 500;
  private loadPromise: Promise<void> | null = null;

  constructor() {
    this.loadPromise = this.loadFromStorage();
  }

  /**
   * Wait for initial load to complete
   */
  async waitForLoad(): Promise<void> {
    if (this.loadPromise) {
      await this.loadPromise;
      this.loadPromise = null;
    }
    // If already loaded, this just returns immediately
  }

  // Subscribe to state changes
  subscribe(listener: (editors: EditorState[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener([...this.editors]));
  }

  // Load editors from file system
  async loadFromStorage(): Promise<void> {
    try {
      const loadedEditors = await window.electronAPI.loadAllEditors();
      this.editors = loadedEditors.map(e => ({
        ...e,
        isDirty: false,
      }));
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to load editors:', error);
    }
  }

  // Create a new editor
  async createEditor(name?: string): Promise<EditorState> {
    const id = this.generateId();

    let editorName: string;
    if (name) {
      editorName = name;
    } else {
      const nextIndex = await window.electronAPI.incrementNextIndex();
      editorName = `untitled-${nextIndex}`;
    }

    const newEditor: EditorState = {
      id,
      name: editorName,
      content: '',
      isDirty: true,
    };

    // Add to the beginning (left side) instead of end (right side)
    this.editors.unshift(newEditor);
    this.notifyListeners();

    // Auto-save new editor
    this.scheduleAutoSave(id);

    return newEditor;
  }

  // Remove an editor
  async removeEditor(id: string): Promise<void> {
    const index = this.editors.findIndex(e => e.id === id);
    if (index === -1) return;

    const editor = this.editors[index];

    // Dispose Monaco instance if exists
    if (editor.monacoInstance) {
      editor.monacoInstance.dispose();
    }

    this.editors.splice(index, 1);
    this.notifyListeners();

    // Delete from file system
    try {
      await window.electronAPI.deleteEditor(id);
    } catch (error) {
      console.error('Failed to delete editor:', error);
    }
  }

  // Rename an editor
  async renameEditor(id: string, newName: string): Promise<void> {
    const editor = this.editors.find(e => e.id === id);
    if (!editor) return;

    editor.name = newName;
    editor.isDirty = true;
    this.notifyListeners();

    // Save to file system
    try {
      await window.electronAPI.renameEditor(id, newName);
      editor.isDirty = false;
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to rename editor:', error);
    }
  }

  // Reorder editors
  reorderEditors(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.editors.length ||
        toIndex < 0 || toIndex >= this.editors.length) {
      return;
    }

    const [removed] = this.editors.splice(fromIndex, 1);
    this.editors.splice(toIndex, 0, removed);
    this.notifyListeners();

    // Save order to file system
    const order = this.editors.map(e => e.id);
    window.electronAPI.saveOrder(order).catch(error => {
      console.error('Failed to save order:', error);
    });
  }

  // Get editor by ID
  getEditor(id: string): EditorState | undefined {
    return this.editors.find(e => e.id === id);
  }

  // Get editor by index
  getEditorAt(index: number): EditorState | undefined {
    return this.editors[index];
  }

  // Get all editors
  getAllEditors(): EditorState[] {
    return [...this.editors];
  }

  // Get editor count
  getEditorCount(): number {
    return this.editors.length;
  }

  // Update editor content
  updateEditorContent(id: string, content: string): void {
    const editor = this.editors.find(e => e.id === id);
    if (!editor) return;

    editor.content = content;
    editor.isDirty = true;
    this.notifyListeners();

    // Schedule auto-save
    this.scheduleAutoSave(id);
  }

  // Schedule auto-save with debouncing
  private scheduleAutoSave(id: string): void {
    // Clear existing timer
    const existingTimer = this.autoSaveTimer.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.saveEditor(id);
    }, this.AUTO_SAVE_DELAY);

    this.autoSaveTimer.set(id, timer);
  }

  // Save a single editor
  async saveEditor(id: string): Promise<void> {
    const editor = this.editors.find(e => e.id === id);
    if (!editor || !editor.isDirty) return;

    try {
      await window.electronAPI.saveEditor({
        id: editor.id,
        name: editor.name,
        content: editor.content,
      });
      editor.isDirty = false;
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to save editor:', error);
    }
  }

  // Save all editors
  async saveAllEditors(): Promise<void> {
    try {
      const editorsToSave = this.editors.map(e => ({
        id: e.id,
        name: e.name,
        content: e.content,
      }));
      await window.electronAPI.saveAllEditors(editorsToSave);
      this.editors.forEach(e => e.isDirty = false);
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to save editors:', error);
    }
  }

  // Set Monaco instance for an editor
  setMonacoInstance(id: string, instance: any): void {
    const editor = this.editors.find(e => e.id === id);
    if (editor) {
      editor.monacoInstance = instance;
    }
  }

  // Set DOM element for an editor
  setDomElement(id: string, element: HTMLElement): void {
    const editor = this.editors.find(e => e.id === id);
    if (editor) {
      editor.domElement = element;
    }
  }

  // Generate unique ID
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Clean up (dispose all Monaco instances)
  disposeAll(): void {
    this.editors.forEach(editor => {
      if (editor.monacoInstance) {
        editor.monacoInstance.dispose();
      }
    });
    this.autoSaveTimer.forEach(timer => clearTimeout(timer));
    this.autoSaveTimer.clear();
  }
}

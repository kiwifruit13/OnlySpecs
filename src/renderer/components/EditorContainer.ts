import { EditorState } from '../state/EditorStateManager';
import { EditorWithTerminal } from './EditorWithTerminal';
import { ThemeManager } from '../state/ThemeManager';

// Configuration
const DEFAULT_EDITOR_WIDTH = 850;
const MIN_EDITOR_WIDTH = 300;

export class EditorContainer {
  private container: HTMLElement;
  private editorsWrapper!: HTMLElement;
  private onContentChange: (id: string, content: string) => void;
  private onGenerateFromSpecs?: (id: string) => void;
  private onReviewAndTest?: (id: string) => void;
  private onModifySpecsDoc?: (id: string) => void;
  private themeManager: ThemeManager;
  private editorElements: Map<string, HTMLElement> = new Map();
  private editorWithTerminals: Map<string, EditorWithTerminal> = new Map();
  private resizeHandles: Map<string, HTMLElement> = new Map();
  private editorWidths: Map<string, number> = new Map();
  private monaco: any;
  private isMonacoLoaded = false;
  private isResizing: boolean = false;
  private currentResizingEditor: string | null = null;
  private startX: number = 0;
  private startWidth: number = 0;
  private editorOrder: string[] = [];
  private compareSelected: Set<string> = new Set();
  private previewSelected: Set<string> = new Set();
  private compareStates: Map<string, { original: any; content: string }> = new Map();
  private stateManager: any = null;
  private onPreviewToggle: (id: string) => void = (id: string) => {
    // Default implementation - will be overridden
    console.log('[Preview] Toggle preview for', id);
  };
  private diffModels: Map<string, { original: any; modified: any }> = new Map();

  setStateManager(stateManager: any): void {
    this.stateManager = stateManager;
  }

  constructor(
    container: HTMLElement,
    options: {
      onContentChange: (id: string, content: string) => void;
      onGenerateFromSpecs?: (id: string) => void;
      onReviewAndTest?: (id: string) => void;
      onModifySpecsDoc?: (id: string) => void;
      themeManager: ThemeManager;
    }
  ) {
    this.container = container;
    this.onContentChange = options.onContentChange;
    this.themeManager = options.themeManager;
    this.onGenerateFromSpecs = options.onGenerateFromSpecs;
    this.onReviewAndTest = options.onReviewAndTest;
    this.onModifySpecsDoc = options.onModifySpecsDoc;

    this.render();
    this.loadMonaco();
  }

  private render(): void {
    this.container.className = 'editor-container';
    this.container.innerHTML = '';

    this.editorsWrapper = document.createElement('div');
    this.editorsWrapper.className = 'editors-wrapper';
    this.container.appendChild(this.editorsWrapper);
  }

  private async loadMonaco(): Promise<void> {
    if (this.isMonacoLoaded) return;

    const checkMonaco = () => {
      return new Promise<void>((resolve) => {
        if (typeof window !== 'undefined' && (window as any).monaco) {
          this.monaco = (window as any).monaco;
          this.isMonacoLoaded = true;
          resolve();
        } else {
          setTimeout(() => checkMonaco().then(resolve), 50);
        }
      });
    };

    await checkMonaco();
  }

  renderEditors(editors: EditorState[]): void {
    this.editorOrder = editors.map(e => e.id);

    const currentIds = new Set(this.editorElements.keys());
    const newIds = new Set(editors.map(e => e.id));

    // Remove editors that no longer exist
    for (const id of currentIds) {
      if (!newIds.has(id)) {
        this.removeEditorElement(id);
        this.compareSelected.delete(id);
        this.compareStates.delete(id);
      }
    }

    // Add or update editors
    editors.forEach((editor, index) => {
      if (!this.editorElements.has(editor.id)) {
        this.createEditorElement(editor, index, editors.length);
      } else {
        const wrapper = this.editorElements.get(editor.id);
        if (wrapper && wrapper.parentElement) {
          const currentIndex = Array.from(this.editorsWrapper.children).indexOf(wrapper);
          if (currentIndex !== index) {
            this.moveEditorToPosition(wrapper, index);
          }
        }
      }
    });

    // Update all compare states
    this.updateAllCompareStates();
  }

  private handleCompareToggle(id: string): void {
    const editorWithTerminal = this.editorWithTerminals.get(id);
    if (!editorWithTerminal) return;

    if (this.compareSelected.has(id)) {
      // Unselect
      this.compareSelected.delete(id);
      this.revertToNormalEditor(id);
    } else {
      // Select
      if (this.compareSelected.size < 2) {
        this.compareSelected.add(id);

        // If 2 selected, make sure both have state saved before showing diffs
        if (this.compareSelected.size === 2) {
          // Save state for BOTH selected editors before showing diff
          const selectedIds = Array.from(this.compareSelected);
          for (const editorId of selectedIds) {
            this.saveEditorCompareState(editorId);
          }

          const [id1, id2] = selectedIds;
          const state1 = this.compareStates.get(id1);
          const state2 = this.compareStates.get(id2);

          console.log('[Compare] Both selected, checking states...');
          console.log('[Compare] State1 for', id1, ':', state1?.content ? 'exists with content' : 'MISSING or empty', 'content length:', state1?.content?.length || 0);
          console.log('[Compare] State2 for', id2, ':', state2?.content ? 'exists with content' : 'MISSING or empty', 'content length:', state2?.content?.length || 0);

          if (state1?.content && state2?.content) {
            this.showDiffMode();
          } else {
            console.error('[Compare] Cannot show diff - missing state or content for one or both editors');
            // Don't keep the second checkbox checked if we can't show diff
            this.compareSelected.delete(id);
            this.updateAllCompareStates();
          }
        }
      }
    }

    // Update all checkbox states
    this.updateAllCompareStates();
  }

  private saveEditorCompareState(id: string): void {
    const editorWithTerminal = this.editorWithTerminals.get(id);
    if (!editorWithTerminal) {
      console.warn('[Compare] EditorWithTerminal not found for', id);
      return;
    }

    // Try to get content from Monaco instance first
    const currentInstance = editorWithTerminal.getMonacoInstance();
    let content = '';

    if (currentInstance) {
      try {
        content = currentInstance.getValue();
        console.log('[Compare] Got content from Monaco for', id, 'length:', content.length);
      } catch (e) {
        console.warn('[Compare] Failed to get content from Monaco for', id, e);
        content = '';
      }
    }

    // Always fallback to state manager content if Monaco didn't work
    if (!content && this.stateManager) {
      const editors = this.stateManager.getAllEditors();
      const editor = editors.find((e: any) => e.id === id);
      if (editor) {
        content = editor.content || '';
        console.log('[Compare] Got content from state manager for', id, 'length:', content.length);
      }
    }

    this.compareStates.set(id, {
      original: currentInstance,
      content: content,
    });

    console.log('[Compare] Saved state for', id, 'content length:', content.length);
  }

  private handlePreviewToggle(id: string): void {
    const editorWithTerminal = this.editorWithTerminals.get(id);
    if (!editorWithTerminal) return;

    const isChecked = this.previewSelected.has(id);

    if (isChecked) {
      // Unchecking preview - remove from preview set
      this.previewSelected.delete(id);
    } else {
      // Checking preview - add to preview set
      this.previewSelected.add(id);

      // When enabling preview, remove from compare mode
      if (this.compareSelected.has(id)) {
        this.compareSelected.delete(id);

        // If we had 2 selected and we're removing one, we need to exit diff mode for both
        if (this.compareSelected.size === 1) {
          // Get the remaining selected editor
          const remainingId = Array.from(this.compareSelected)[0];
          this.revertToNormalEditor(remainingId);
        }

        this.revertToNormalEditor(id);
      }
    }

    // Update all states
    this.updateAllCompareStates();
  }

  private updateAllCompareStates(): void {
    this.editorWithTerminals.forEach((editorWithTerminal, id) => {
      const isSelected = this.compareSelected.has(id);
      const isPreviewActive = this.previewSelected.has(id);

      // Disable compare if preview is active or if 2 already selected
      const isDisabled = isPreviewActive || (this.compareSelected.size >= 2 && !isSelected);

      editorWithTerminal.updateCompareState(isDisabled, isSelected);
      editorWithTerminal.updatePreviewState(this.previewSelected.has(id));
    });
  }

  private showDiffMode(): void {
    if (this.compareSelected.size !== 2 || !this.monaco) return;

    // Ensure Monaco is loaded
    if (!this.isMonacoLoaded) {
      console.error('[Compare] Monaco not loaded, cannot show diff');
      return;
    }

    const selectedIds = Array.from(this.compareSelected);
    const [id1, id2] = selectedIds;
    const editor1 = this.editorWithTerminals.get(id1);
    const editor2 = this.editorWithTerminals.get(id2);

    if (!editor1 || !editor2) return;

    const state1 = this.compareStates.get(id1);
    const state2 = this.compareStates.get(id2);

    if (!state1 || !state2) return;

    if (!state1.content || !state2.content) {
      console.error('[Compare] Missing content for diff:', state1.content?.length, state2.content?.length);
      return;
    }

    const monacoTheme = this.themeManager ? this.themeManager.getMonacoTheme() : 'vs-dark';

    console.log('[Compare] Creating diff editors with content lengths:', state1.content.length, state2.content.length);

    // Create diff editors for both
    this.createDiffEditor(id1, id2, state1.content, state2.content, false, monacoTheme);
    this.createDiffEditor(id2, id1, state2.content, state1.content, true, monacoTheme);
  }

  private createDiffEditor(
    targetId: string,
    otherId: string,
    originalContent: string,
    modifiedContent: string,
    isInline: boolean,
    theme: string
  ): void {
    const editorWithTerminal = this.editorWithTerminals.get(targetId);
    if (!editorWithTerminal) return;

    const monacoContainer = editorWithTerminal.getMonacoContainer();
    if (!monacoContainer) return;

    // Clear existing content and dispose old instances
    const oldInstance = editorWithTerminal.getMonacoInstance();
    if (oldInstance) {
      oldInstance.dispose();
    }

    const oldDiffEditor = editorWithTerminal.getDiffEditorInstance();
    if (oldDiffEditor) {
      oldDiffEditor.dispose();
    }

    // Dispose old models if they exist
    const oldModels = this.diffModels.get(targetId);
    if (oldModels) {
      if (oldModels.original) oldModels.original.dispose();
      if (oldModels.modified) oldModels.modified.dispose();
    }

    monacoContainer.innerHTML = '';

    console.log('[Compare] Creating diff editor with content lengths:', originalContent.length, modifiedContent.length);

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      if (!this.monaco || !monacoContainer.isConnected) {
        console.error('[Compare] Monaco or container not ready');
        return;
      }

      // Create models with unique URIs
      const originalUri = this.monaco.Uri.parse(`file://${targetId}-${Date.now()}-original`);
      const modifiedUri = this.monaco.Uri.parse(`file://${targetId}-${Date.now()}-modified`);

      const originalModel = this.monaco.editor.createModel(originalContent, 'plaintext', originalUri);
      const modifiedModel = this.monaco.editor.createModel(modifiedContent, 'plaintext', modifiedUri);

      // Store models for later disposal
      this.diffModels.set(targetId, { original: originalModel, modified: modifiedModel });

      console.log('[Compare] Models created');

      // Create diff editor
      const diffEditor = this.monaco.editor.createDiffEditor(monacoContainer, {
        theme: theme,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 14,
        lineNumbers: 'on',
        wordWrap: 'on',
        tabSize: 2,
        readOnly: true,
        renderSideBySide: !isInline,
        enableSplitViewResizing: false,
        renderOverviewRuler: true,
        diffWordWrap: 'on',
        diffAlgorithm: 'smart',
        ignoreTrimWhitespace: false,
        renderWhitespace: 'selection',
        renderLineHighlight: 'all',
        renderMarginRevertIcon: true,
        originalEditable: false,
        modifiedEditable: false,
        enforceCodeAlignment: true,
      });

      // Set the model
      diffEditor.setModel({
        original: originalModel,
        modified: modifiedModel,
      });

      // Force update
      diffEditor.updateOptions({ renderSideBySide: !isInline });

      console.log('[Compare] Diff editor created and model set for', targetId);

      editorWithTerminal.setDiffEditorInstance(diffEditor);
      editorWithTerminal.setOriginalEditorInstance(null);
      // CRITICAL: Don't set monacoInstance to null! This causes the state manager
      // to think there's no instance and try to create a new one, breaking the diff.
      // Instead, keep the diff editor as the monacoInstance so it's tracked.
      editorWithTerminal.setMonacoInstance(diffEditor);
    });
  }

  private revertToNormalEditor(id: string): void {
    const editorWithTerminal = this.editorWithTerminals.get(id);
    if (!editorWithTerminal || !this.monaco) return;

    const state = this.compareStates.get(id);
    const monacoTheme = this.themeManager ? this.themeManager.getMonacoTheme() : 'vs-dark';

    // Dispose diff editor
    const diffEditor = editorWithTerminal.getDiffEditorInstance();
    if (diffEditor) {
      diffEditor.dispose();
      editorWithTerminal.setDiffEditorInstance(null);
    }

    // Dispose diff models
    const models = this.diffModels.get(id);
    if (models) {
      if (models.original) models.original.dispose();
      if (models.modified) models.modified.dispose();
      this.diffModels.delete(id);
    }

    // Recreate normal editor
    const monacoContainer = editorWithTerminal.getMonacoContainer();
    if (!monacoContainer) return;

    monacoContainer.innerHTML = '';

    const content = state?.content || '';
    const editor = this.monaco.editor.create(monacoContainer, {
      value: content,
      language: 'plaintext',
      theme: monacoTheme,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 14,
      lineNumbers: 'on',
      wordWrap: 'on',
      tabSize: 2,
    });

    editor.onDidChangeModelContent(() => {
      const newContent = editor.getValue();
      this.onContentChange(id, newContent);
    });

    editorWithTerminal.setMonacoInstance(editor);
    editorWithTerminal.setOriginalEditorInstance(editor);

    // CRITICAL: Update the state manager's Monaco instance reference
    if (this.stateManager) {
      this.stateManager.setMonacoInstance(id, editor);
      console.log('[Compare] Updated state manager Monaco instance for', id);
    }
  }

  private createEditorElement(editor: EditorState, index: number, totalEditors: number): void {
    const editorWrapper = document.createElement('div');
    editorWrapper.className = 'editor-wrapper';
    editorWrapper.dataset.id = editor.id;

    const width = this.editorWidths.get(editor.id) || DEFAULT_EDITOR_WIDTH;
    // Set both width and flex-basis to ensure the width is respected
    editorWrapper.style.width = `${width}px`;
    editorWrapper.style.flexBasis = `${width}px`;
    editorWrapper.style.maxWidth = `${width}px`;
    editorWrapper.style.minWidth = `${width}px`;

    // Check if this editor is selected for compare
    const isSelected = this.compareSelected.has(editor.id);
    const isPreviewSelected = this.previewSelected.has(editor.id);

    // Disable compare if preview is active or if 2 already selected and this one isn't selected
    const isCompareDisabled = isPreviewSelected || (this.compareSelected.size >= 2 && !isSelected);

    // Create EditorWithTerminal component
    const editorWithTerminal = new EditorWithTerminal(
      editor.id,
      editor.name,
      editorWrapper,
      {
        onContentChange: this.onContentChange,
        onCompareToggle: (id) => this.handleCompareToggle(id),
        onPreviewToggle: (id) => this.handlePreviewToggle(id),
        onGenerateFromSpecs: this.onGenerateFromSpecs,
        onReviewAndTest: this.onReviewAndTest,
        onModifySpecsDoc: this.onModifySpecsDoc,
        themeManager: this.themeManager,
        isCompareDisabled: isCompareDisabled,
        isCompareSelected: isSelected,
        isPreviewSelected: isPreviewSelected,
      }
    );

    this.editorWithTerminals.set(editor.id, editorWithTerminal);
    this.editorElements.set(editor.id, editorWrapper);

    // Add resize handle
    if (index < totalEditors - 1) {
      const resizeHandle = this.createResizeHandle(editor.id);
      editorWrapper.appendChild(resizeHandle);
      this.resizeHandles.set(editor.id, resizeHandle);
    }

    const children = Array.from(this.editorsWrapper.children);
    if (children[index]) {
      this.editorsWrapper.insertBefore(editorWrapper, children[index]);
    } else {
      this.editorsWrapper.appendChild(editorWrapper);
    }
  }

  private createResizeHandle(editorId: string): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.dataset.editorId = editorId;

    handle.addEventListener('mousedown', (e) => this.startResize(e, editorId));

    return handle;
  }

  private startResize(e: MouseEvent, editorId: string): void {
    e.preventDefault();
    e.stopPropagation();
    this.isResizing = true;
    this.currentResizingEditor = editorId;
    this.startX = e.clientX;

    const wrapper = this.editorElements.get(editorId);
    if (wrapper) {
      this.startWidth = wrapper.offsetWidth;
    }

    document.addEventListener('mousemove', this.handleResizeMove);
    document.addEventListener('mouseup', this.handleResizeEnd);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  private handleResizeMove = (e: MouseEvent): void => {
    if (!this.isResizing || !this.currentResizingEditor) return;

    const deltaX = e.clientX - this.startX;
    const newWidth = Math.max(MIN_EDITOR_WIDTH, this.startWidth + deltaX);

    const wrapper = this.editorElements.get(this.currentResizingEditor);
    if (wrapper) {
      // Set all width-related properties to ensure the width is respected
      wrapper.style.width = `${newWidth}px`;
      wrapper.style.flexBasis = `${newWidth}px`;
      wrapper.style.maxWidth = `${newWidth}px`;
      wrapper.style.minWidth = `${newWidth}px`;
      this.editorWidths.set(this.currentResizingEditor, newWidth);
    }
  };

  private handleResizeEnd = (): void => {
    if (!this.isResizing) return;

    this.isResizing = false;
    this.currentResizingEditor = null;

    document.removeEventListener('mousemove', this.handleResizeMove);
    document.removeEventListener('mouseup', this.handleResizeEnd);

    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  private moveEditorToPosition(element: HTMLElement, newIndex: number): void {
    const children = Array.from(this.editorsWrapper.children);

    let editorIndex = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      if (!child.classList.contains('resize-handle')) {
        if (editorIndex === newIndex) {
          if (children[i] !== element) {
            this.editorsWrapper.insertBefore(element, children[i]);
          }
          return;
        }
        editorIndex++;
      }
    }

    this.editorsWrapper.appendChild(element);
  }

  private removeEditorElement(id: string): void {
    const element = this.editorElements.get(id);
    if (element) {
      const editorWithTerminal = this.editorWithTerminals.get(id);
      if (editorWithTerminal) {
        editorWithTerminal.dispose();
      }

      this.resizeHandles.delete(id);
      this.editorWidths.delete(id);
      this.editorWithTerminals.delete(id);

      element.remove();
      this.editorElements.delete(id);
    }
  }

  createMonacoEditor(id: string, content: string, language: string = 'plaintext', theme: string = 'vs-dark'): any {
    const editorWithTerminal = this.editorWithTerminals.get(id);
    if (!editorWithTerminal || !this.monaco) return null;

    // Skip if already has a diff editor (in compare mode)
    if (editorWithTerminal.getDiffEditorInstance()) {
      console.log('[Compare] Skipping Monaco creation, diff editor exists for', id);
      return null;
    }

    // Skip if already has a valid Monaco instance
    if (editorWithTerminal.getMonacoInstance()) {
      console.log('[Compare] Monaco instance already exists for', id);
      return editorWithTerminal.getMonacoInstance();
    }

    const monacoContainer = editorWithTerminal.getMonacoContainer();
    if (!monacoContainer) return null;

    if (monacoContainer.hasChildNodes()) {
      console.log('[Compare] Container has children, skipping Monaco creation for', id);
      return null;
    }

    const editor = this.monaco.editor.create(monacoContainer, {
      value: content,
      language: 'plaintext',
      theme: theme,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 14,
      lineNumbers: 'on',
      wordWrap: 'on',
      tabSize: 2,
    });

    editor.onDidChangeModelContent(() => {
      const newContent = editor.getValue();
      this.onContentChange(id, newContent);
    });

    editorWithTerminal.setMonacoInstance(editor);
    editorWithTerminal.setOriginalEditorInstance(editor);

    return editor;
  }

  updateMonacoEditor(id: string, editorInstance: any, content: string): void {
    if (!editorInstance) return;

    const currentValue = editorInstance.getValue();
    if (currentValue !== content) {
      editorInstance.setValue(content);
    }
  }

  disposeMonacoEditor(id: string, editorInstance: any): void {
    if (editorInstance) {
      editorInstance.dispose();
    }

    const editorWithTerminal = this.editorWithTerminals.get(id);
    if (editorWithTerminal) {
      const monacoContainer = editorWithTerminal.getMonacoContainer();
      if (monacoContainer) {
        monacoContainer.innerHTML = '';
      }
    }
  }

  getEditorWithTerminal(id: string): EditorWithTerminal | undefined {
    return this.editorWithTerminals.get(id);
  }

  scrollToEditor(id: string): void {
    const wrapper = this.editorElements.get(id);
    if (wrapper) {
      wrapper.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }

  updateEditorTheme(id: string, theme: 'light' | 'dark'): void {
    const editorWithTerminal = this.editorWithTerminals.get(id);
    if (editorWithTerminal) {
      editorWithTerminal.setTheme(theme);
    }
  }

  updateAllEditorsTheme(theme: 'light' | 'dark'): void {
    this.editorWithTerminals.forEach((editorWithTerminal) => {
      editorWithTerminal.setTheme(theme);
    });
  }

  async waitForMonaco(): Promise<void> {
    await this.loadMonaco();
  }
}

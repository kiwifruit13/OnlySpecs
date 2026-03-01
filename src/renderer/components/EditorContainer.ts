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
  private compareStates: Map<string, { original: any; content: string }> = new Map();
  private stateManager: any = null;

  setStateManager(stateManager: any): void {
    this.stateManager = stateManager;
  }

  constructor(
    container: HTMLElement,
    options: {
      onContentChange: (id: string, content: string) => void;
      themeManager: ThemeManager;
    }
  ) {
    this.container = container;
    this.onContentChange = options.onContentChange;
    this.themeManager = options.themeManager;

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
        // Save current editor state before switching to diff mode
        const currentInstance = editorWithTerminal.getMonacoInstance();
        if (currentInstance) {
          const content = currentInstance.getValue();
          this.compareStates.set(id, {
            original: currentInstance,
            content: content,
          });
        }

        // If 2 selected, show diffs
        if (this.compareSelected.size === 2) {
          this.showDiffMode();
        }
      }
    }

    // Update all checkbox states
    this.updateAllCompareStates();
  }

  private updateAllCompareStates(): void {
    this.editorWithTerminals.forEach((editorWithTerminal, id) => {
      const isSelected = this.compareSelected.has(id);
      const isDisabled = this.compareSelected.size >= 2 && !isSelected;
      editorWithTerminal.updateCompareState(isDisabled, isSelected);
    });
  }

  private showDiffMode(): void {
    if (this.compareSelected.size !== 2 || !this.monaco) return;

    const selectedIds = Array.from(this.compareSelected);
    const [id1, id2] = selectedIds;
    const editor1 = this.editorWithTerminals.get(id1);
    const editor2 = this.editorWithTerminals.get(id2);

    if (!editor1 || !editor2) return;

    const state1 = this.compareStates.get(id1);
    const state2 = this.compareStates.get(id2);

    if (!state1 || !state2) return;

    const monacoTheme = this.themeManager ? this.themeManager.getMonacoTheme() : 'vs-dark';

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

    // Clear existing content
    monacoContainer.innerHTML = '';

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
    });

    const originalModel = this.monaco.editor.createModel(originalContent, 'plaintext');
    const modifiedModel = this.monaco.editor.createModel(modifiedContent, 'plaintext');

    diffEditor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });

    editorWithTerminal.setDiffEditorInstance(diffEditor);
    editorWithTerminal.setOriginalEditorInstance(null);
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
    // Disable if 2 already selected and this one isn't selected
    const isDisabled = this.compareSelected.size >= 2 && !isSelected;

    // Create EditorWithTerminal component
    const editorWithTerminal = new EditorWithTerminal(
      editor.id,
      editor.name,
      editorWrapper,
      {
        onContentChange: this.onContentChange,
        onCompareToggle: (id) => this.handleCompareToggle(id),
        themeManager: this.themeManager,
        isCompareDisabled: isDisabled,
        isCompareSelected: isSelected,
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

    const monacoContainer = editorWithTerminal.getMonacoContainer();
    if (!monacoContainer) return null;

    if (monacoContainer.hasChildNodes()) {
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

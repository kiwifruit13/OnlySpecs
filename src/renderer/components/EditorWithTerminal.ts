import { Terminal } from './Terminal';
import { ThemeManager } from '../state/ThemeManager';
import { marked } from 'marked';

export interface EditorWithTerminalOptions {
  onContentChange: (id: string, content: string) => void;
  onCompareToggle: (id: string) => void;
  onPreviewToggle: (id: string) => void;
  onGenerateFromSpecs?: (id: string) => void;
  onReviewAndTest?: (id: string) => void;
  onModifySpecsDoc?: (id: string) => void;
  themeManager: ThemeManager;
  isCompareDisabled: boolean;
  isCompareSelected: boolean;
  isPreviewSelected: boolean;
}

interface TerminalInstance {
  terminal: Terminal;
  container: HTMLElement;
  sessionId: string;
  id: string;
}

export class EditorWithTerminal {
  private container: HTMLElement;
  private editorElement!: HTMLElement;
  private previewElement!: HTMLElement;
  private previewResizeHandle!: HTMLElement;
  private terminalsContainer!: HTMLElement;
  private terminalsWrapper!: HTMLElement;
  private terminalToggle!: HTMLElement;
  private addTerminalBtn!: HTMLElement;
  private terminalResizeHandle!: HTMLElement;
  private compareCheckbox!: HTMLInputElement;
  private compareLabel!: HTMLElement;
  private previewCheckbox!: HTMLInputElement;
  private previewLabel!: HTMLElement;
  private isTerminalExpanded: boolean = false;
  private isPreviewMode: boolean = false;
  private isResizingTerminal: boolean = false;
  private resizeStartY: number = 0;
  private resizeStartHeight: number = 0;

  // Store terminal heights per editor
  private static terminalHeights = new Map<string, number>();
  private readonly DEFAULT_TERMINAL_HEIGHT_PERCENT = 50; // 50% of container height
  private onContentChange: (id: string, content: string) => void;
  private onCompareToggle: (id: string) => void;
  private onPreviewToggle: (id: string) => void;
  private onGenerateFromSpecs?: (id: string) => void;
  private onReviewAndTest?: (id: string) => void;
  private onModifySpecsDoc?: (id: string) => void;
  private themeManager: ThemeManager;
  private monacoInstance: any = null;
  private diffEditorInstance: any = null;
  private originalEditorInstance: any = null;
  private editorId: string = '';

  // Multiple terminals support
  private terminals: Map<string, TerminalInstance> = new Map();
  private nextTerminalId: number = 0;

  // Current working directory for terminals
  private cwd: string | undefined;

  // Calculate default height as 50% of container
  private calculateDefaultHeight(): number {
    const containerHeight = this.container.offsetHeight || 600; // Fallback if container not ready
    return Math.floor(containerHeight * this.DEFAULT_TERMINAL_HEIGHT_PERCENT / 100);
  }

  // Store terminal state
  private static terminalStates = new Map<string, boolean>();

  // Store preview width state (percentage)
  private static previewWidths = new Map<string, number>();
  private previewWidth: number = 50; // Default 50%

  // Resize state
  private isResizing: boolean = false;
  private resizeStartX: number = 0;
  private resizeStartWidth: number = 0;

  // Generate a unique terminal ID
  private generateTerminalId(): string {
    return `${this.editorId}-terminal-${this.nextTerminalId++}`;
  }

  constructor(
    id: string,
    name: string,
    container: HTMLElement,
    options: EditorWithTerminalOptions
  ) {
    this.container = container;
    this.onContentChange = options.onContentChange;
    this.onCompareToggle = options.onCompareToggle;
    this.onPreviewToggle = options.onPreviewToggle;
    this.onGenerateFromSpecs = options.onGenerateFromSpecs;
    this.onReviewAndTest = options.onReviewAndTest;
    this.onModifySpecsDoc = options.onModifySpecsDoc;
    this.themeManager = options.themeManager;
    this.editorId = id;

    // Restore terminal state for this editor, default to expanded (true) for new editors
    this.isTerminalExpanded = EditorWithTerminal.terminalStates.get(id) ?? true;
    this.isPreviewMode = options.isPreviewSelected || false;

    // Restore preview width state
    this.previewWidth = EditorWithTerminal.previewWidths.get(id) || 50;

    this.render(id, name, options.isCompareDisabled, options.isCompareSelected, options.isPreviewSelected);
    this.setupTerminalToggle(id);
    this.setupCompareCheckbox(id);
    this.setupPreviewCheckbox(id);
    this.setupPreviewResize();

    // Create initial terminal if expanded by default
    if (this.isTerminalExpanded && this.terminals.size === 0) {
      // Use setTimeout to ensure the DOM is ready
      setTimeout(() => {
        this.addNewTerminal();
      }, 10);
    }
  }

  private render(id: string, name: string, isCompareDisabled: boolean, isCompareSelected: boolean, isPreviewSelected: boolean): void {
    this.container.className = 'editor-with-terminal';
    this.container.innerHTML = '';

    // Action buttons section
    const actionButtonsSection = document.createElement('div');
    actionButtonsSection.className = 'action-buttons-section';

    if (this.onGenerateFromSpecs) {
      const generateBtn = document.createElement('button');
      generateBtn.className = 'action-btn action-btn-generate';
      generateBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM7 4h2v4H7V4zm0 5h2v2H7V9z"/>
        </svg>
        <span>Generate from Specs</span>
      `;
      generateBtn.addEventListener('click', () => {
        if (this.onGenerateFromSpecs) {
          this.onGenerateFromSpecs(id);
        }
      });
      actionButtonsSection.appendChild(generateBtn);
    }

    if (this.onReviewAndTest) {
      const reviewBtn = document.createElement('button');
      reviewBtn.className = 'action-btn action-btn-review';
      reviewBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 16A8 8 0 118 0a8 8 0 010 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 110-2 1 1 0 010 2z"/>
        </svg>
        <span>Review and Test</span>
      `;
      reviewBtn.addEventListener('click', () => {
        if (this.onReviewAndTest) {
          this.onReviewAndTest(id);
        }
      });
      actionButtonsSection.appendChild(reviewBtn);
    }

    if (this.onModifySpecsDoc) {
      const modifyBtn = document.createElement('button');
      modifyBtn.className = 'action-btn action-btn-modify';
      modifyBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.5 1a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM11 2h3v1h-1v4l-1 2v5h-2v-5l-1-2V3h-1V2h3zM3.5 4a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM1 5h3v1H3v4l-1 2v5H0v-5l-1-2V6h1V5zm0 8H0v1h1v-1zm10 0h-1v1h1v-1z"/>
        </svg>
        <span>Modify Specs Doc</span>
      `;
      modifyBtn.addEventListener('click', () => {
        if (this.onModifySpecsDoc) {
          this.onModifySpecsDoc(id);
        }
      });
      actionButtonsSection.appendChild(modifyBtn);
    }

    // Compare and Preview checkbox section (at the top)
    const checkboxesSection = document.createElement('div');
    checkboxesSection.className = 'checkboxes-section';

    // Compare checkbox
    this.compareCheckbox = document.createElement('input');
    this.compareCheckbox.type = 'checkbox';
    this.compareCheckbox.className = 'compare-checkbox';
    this.compareCheckbox.id = `compare-${id}`;
    this.compareCheckbox.checked = isCompareSelected;
    // Disable based on both the isCompareDisabled parameter and preview state
    this.compareCheckbox.disabled = isCompareDisabled || isPreviewSelected;

    this.compareLabel = document.createElement('label');
    this.compareLabel.className = 'compare-checkbox-label';
    (this.compareLabel as HTMLLabelElement).htmlFor = `compare-${id}`;
    this.compareLabel.textContent = 'Compare';

    // Preview checkbox
    this.previewCheckbox = document.createElement('input');
    this.previewCheckbox.type = 'checkbox';
    this.previewCheckbox.className = 'preview-checkbox';
    this.previewCheckbox.id = `preview-${id}`;
    this.previewCheckbox.checked = isPreviewSelected;

    this.previewLabel = document.createElement('label');
    this.previewLabel.className = 'preview-checkbox-label';
    (this.previewLabel as HTMLLabelElement).htmlFor = `preview-${id}`;
    this.previewLabel.textContent = 'Preview';

    checkboxesSection.appendChild(this.compareCheckbox);
    checkboxesSection.appendChild(this.compareLabel);
    checkboxesSection.appendChild(this.previewCheckbox);
    checkboxesSection.appendChild(this.previewLabel);

    // Create a wrapper for editor and preview to be side by side
    const editorPreviewWrapper = document.createElement('div');
    editorPreviewWrapper.className = 'editor-preview-wrapper';

    // Preview section (hidden by default) - LEFT SIDE
    this.previewElement = document.createElement('div');
    this.previewElement.className = 'preview-section';
    this.previewElement.dataset.id = id;
    this.previewElement.style.display = isPreviewSelected ? 'block' : 'none';
    this.previewElement.style.flex = isPreviewSelected ? `0 0 ${this.previewWidth}%` : '0 0 0%';

    // Preview resize handle
    this.previewResizeHandle = document.createElement('div');
    this.previewResizeHandle.className = 'preview-resize-handle';
    this.previewResizeHandle.style.display = isPreviewSelected ? 'block' : 'none';

    // Editor section - RIGHT SIDE
    this.editorElement = document.createElement('div');
    this.editorElement.className = 'editor-section';
    this.editorElement.dataset.id = id;
    // Editor takes full width when preview is not active
    this.editorElement.style.flex = isPreviewSelected ? `0 0 ${100 - this.previewWidth}%` : '1 1 auto';

    const monacoContainer = document.createElement('div');
    monacoContainer.className = 'monaco-container';
    monacoContainer.dataset.editorId = id;
    this.editorElement.appendChild(monacoContainer);

    // Add preview, resize handle, and editor to the wrapper (preview on left, editor on right)
    editorPreviewWrapper.appendChild(this.previewElement);
    editorPreviewWrapper.appendChild(this.previewResizeHandle);
    editorPreviewWrapper.appendChild(this.editorElement);

    // Terminal toggle button section
    const toggleSection = document.createElement('div');
    toggleSection.className = 'terminal-toggle-section';

    this.terminalToggle = document.createElement('button');
    this.terminalToggle.className = 'terminal-toggle-btn';
    this.terminalToggle.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        <path d="M6 8L1 3h10L6 8z"/>
      </svg>
      <span>Terminal</span>
    `;
    this.terminalToggle.title = this.isTerminalExpanded ? 'Hide Terminal' : 'Show Terminal';

    // Set active state and icon rotation if expanded by default
    if (this.isTerminalExpanded) {
      this.terminalToggle.classList.add('active');
      const icon = this.terminalToggle.querySelector('svg');
      if (icon) {
        icon.style.transform = 'rotate(180deg)';
      }
    }

    // Add terminal button
    this.addTerminalBtn = document.createElement('button');
    this.addTerminalBtn.className = 'add-terminal-btn';
    this.addTerminalBtn.innerHTML = '+';
    this.addTerminalBtn.title = 'Add New Terminal';
    this.addTerminalBtn.style.display = this.isTerminalExpanded ? 'flex' : 'none';

    toggleSection.appendChild(this.terminalToggle);
    toggleSection.appendChild(this.addTerminalBtn);

    // Terminal resize handle
    this.terminalResizeHandle = document.createElement('div');
    this.terminalResizeHandle.className = 'terminal-resize-handle';
    this.terminalResizeHandle.style.display = this.isTerminalExpanded ? 'block' : 'none';

    // Terminals container (initially hidden)
    this.terminalsContainer = document.createElement('div');
    this.terminalsContainer.className = 'terminals-container';
    this.terminalsContainer.style.display = this.isTerminalExpanded ? 'flex' : 'none';

    // Load saved height or calculate default (50% of container)
    const savedHeight = EditorWithTerminal.terminalHeights.get(id);
    const defaultHeight = savedHeight || this.calculateDefaultHeight();
    this.terminalsContainer.style.height = `${defaultHeight}px`;
    this.terminalsContainer.style.flex = 'none';

    // Terminals wrapper for horizontal layout
    this.terminalsWrapper = document.createElement('div');
    this.terminalsWrapper.className = 'terminals-wrapper';
    this.terminalsContainer.appendChild(this.terminalsWrapper);

    // Assemble
    this.container.appendChild(actionButtonsSection);
    this.container.appendChild(checkboxesSection);
    this.container.appendChild(editorPreviewWrapper);
    this.container.appendChild(toggleSection);
    this.container.appendChild(this.terminalResizeHandle);
    this.container.appendChild(this.terminalsContainer);

    // Set up resize handlers
    this.setupTerminalResize();
  }

  private setupTerminalToggle(id: string): void {
    this.terminalToggle.addEventListener('click', () => {
      this.toggleTerminalsPanel(id);
    });

    this.addTerminalBtn.addEventListener('click', () => {
      this.addNewTerminal();
    });
  }

  private setupTerminalResize(): void {
    this.terminalResizeHandle.addEventListener('mousedown', (e) => {
      this.startTerminalResize(e);
    });

    document.addEventListener('mousemove', (e) => {
      this.handleTerminalResizeMove(e);
    });

    document.addEventListener('mouseup', () => {
      this.handleTerminalResizeEnd();
    });
  }

  private startTerminalResize(e: MouseEvent): void {
    e.preventDefault();
    this.isResizingTerminal = true;
    this.resizeStartY = e.clientY;
    this.resizeStartHeight = this.terminalsContainer.offsetHeight;

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    this.terminalResizeHandle.classList.add('active');
  }

  private handleTerminalResizeMove(e: MouseEvent): void {
    if (!this.isResizingTerminal) return;

    const deltaY = this.resizeStartY - e.clientY; // Negative because dragging up increases height

    // Calculate max height as 90% of the container's available space
    const containerHeight = this.container.offsetHeight;
    const maxHeight = Math.floor(containerHeight * 0.9);

    const newHeight = Math.max(
      100, // min height
      Math.min(maxHeight, this.resizeStartHeight + deltaY) // max height: 90% of container
    );

    this.setTerminalHeight(newHeight);
  }

  private handleTerminalResizeEnd(): void {
    if (!this.isResizingTerminal) return;

    this.isResizingTerminal = false;

    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    this.terminalResizeHandle.classList.remove('active');

    // Save height
    const height = this.terminalsContainer.offsetHeight;
    EditorWithTerminal.terminalHeights.set(this.editorId, height);

    // Trigger fit on all terminals
    this.terminals.forEach((terminalInstance) => {
      setTimeout(() => {
        (terminalInstance.terminal as any).fit?.();
      }, 10);
    });
  }

  private setTerminalHeight(height: number): void {
    this.terminalsContainer.style.height = `${height}px`;
  }

  private toggleTerminalsPanel(id: string): void {
    this.isTerminalExpanded = !this.isTerminalExpanded;
    EditorWithTerminal.terminalStates.set(id, this.isTerminalExpanded);

    // Update button
    this.terminalToggle.title = this.isTerminalExpanded ? 'Hide Terminal' : 'Show Terminal';
    this.terminalToggle.classList.toggle('active', this.isTerminalExpanded);

    // Update icon rotation
    const icon = this.terminalToggle.querySelector('svg');
    if (icon) {
      icon.style.transform = this.isTerminalExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    // Show/hide terminals container and add button
    if (this.isTerminalExpanded) {
      this.terminalsContainer.style.display = 'flex';
      this.terminalResizeHandle.style.display = 'block';
      this.addTerminalBtn.style.display = 'flex';

      // Create initial terminal if none exist
      if (this.terminals.size === 0) {
        this.addNewTerminal();
      }
    } else {
      this.terminalsContainer.style.display = 'none';
      this.terminalResizeHandle.style.display = 'none';
      this.addTerminalBtn.style.display = 'none';
    }

    // Trigger resize event for Monaco to adjust
    window.dispatchEvent(new Event('resize'));
  }

  private setupCompareCheckbox(id: string): void {
    this.compareCheckbox.addEventListener('change', () => {
      this.onCompareToggle(id);
    });
  }

  private setupPreviewCheckbox(id: string): void {
    this.previewCheckbox.addEventListener('change', async () => {
      const isChecked = this.previewCheckbox.checked;

      // Update local state first
      this.isPreviewMode = isChecked;

      // Show/hide preview panel (keep editor visible)
      if (isChecked) {
        this.previewElement.style.display = 'block';
        this.previewResizeHandle.style.display = 'block';
        // Apply the stored width
        this.updatePreviewWidth();
        // Render markdown content
        this.updatePreviewContent();
      } else {
        this.previewElement.style.display = 'none';
        this.previewResizeHandle.style.display = 'none';
        // Editor takes full width when preview is hidden
        this.editorElement.style.flex = '1 1 auto';
      }

      // Then trigger preview toggle callback to update parent state
      // By this point, this.isPreviewMode is already updated, so updatePreviewState
      // won't change the checkbox state
      this.onPreviewToggle(id);
    });
  }

  private setupPreviewResize(): void {
    this.previewResizeHandle.addEventListener('mousedown', (e) => {
      this.isResizing = true;
      this.resizeStartX = e.clientX;
      this.resizeStartWidth = this.previewWidth;

      document.addEventListener('mousemove', this.handleResizeMove);
      document.addEventListener('mouseup', this.handleResizeEnd);

      e.preventDefault();
      e.stopPropagation();
    });
  }

  private handleResizeMove = (e: MouseEvent): void => {
    if (!this.isResizing) return;

    const wrapper = this.previewResizeHandle.parentElement;
    if (!wrapper) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const deltaX = e.clientX - this.resizeStartX;
    const deltaPercent = (deltaX / wrapperRect.width) * 100;

    let newWidth = this.resizeStartWidth + deltaPercent;

    // Constrain width between 10% and 90%
    newWidth = Math.max(10, Math.min(90, newWidth));

    this.previewWidth = newWidth;
    EditorWithTerminal.previewWidths.set(this.editorId, this.previewWidth);

    this.updatePreviewWidth();
  };

  private handleResizeEnd = (): void => {
    if (!this.isResizing) return;

    this.isResizing = false;
    document.removeEventListener('mousemove', this.handleResizeMove);
    document.removeEventListener('mouseup', this.handleResizeEnd);
  };

  private updatePreviewWidth(): void {
    this.previewElement.style.flex = `0 0 ${this.previewWidth}%`;
    this.editorElement.style.flex = `0 0 ${100 - this.previewWidth}%`;
  }

  /**
   * Update the preview content with current editor content rendered as markdown
   */
  updatePreviewContent(): void {
    if (!this.isPreviewMode) return;

    // Get current content from Monaco editor
    const content = this.getCurrentEditorContent();

    // Render markdown
    const htmlContent = marked.parse(content);

    // Update preview element
    this.previewElement.innerHTML = htmlContent as string;
  }

  /**
   * Get the current content from the Monaco editor
   */
  private getCurrentEditorContent(): string {
    // Try to get content from Monaco instance
    if (this.monacoInstance) {
      try {
        // Check if it's a diff editor or normal editor
        if (this.monacoInstance.getEditor) {
          // It's a diff editor, get modified content
          const modifiedEditor = this.monacoInstance.getModifiedEditor();
          if (modifiedEditor) {
            return modifiedEditor.getValue();
          }
        } else {
          // It's a normal editor
          return this.monacoInstance.getValue();
        }
      } catch (e) {
        console.warn('[Preview] Failed to get content from Monaco:', e);
      }
    }

    return '';
  }

  private toggleTerminals(id: string): void {
    this.isTerminalExpanded = !this.isTerminalExpanded;
    EditorWithTerminal.terminalStates.set(id, this.isTerminalExpanded);

    // Update button
    this.terminalToggle.title = this.isTerminalExpanded ? 'Hide Terminal' : 'Show Terminal';
    this.terminalToggle.classList.toggle('active', this.isTerminalExpanded);

    // Update icon rotation
    const icon = this.terminalToggle.querySelector('svg');
    if (icon) {
      icon.style.transform = this.isTerminalExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    // Show/hide terminals container and add button
    if (this.isTerminalExpanded) {
      this.terminalsContainer.style.display = 'flex';
      this.addTerminalBtn.style.display = 'flex';

      // Create initial terminal if none exist
      if (this.terminals.size === 0) {
        this.addNewTerminal();
      }
    } else {
      this.terminalsContainer.style.display = 'none';
      this.addTerminalBtn.style.display = 'none';
    }

    // Trigger resize event for Monaco to adjust
    window.dispatchEvent(new Event('resize'));
  }

  private addNewTerminal(cwd?: string): void {
    const terminalId = this.generateTerminalId();
    const sessionId = `terminal-${terminalId}`;

    // Use provided cwd or fallback to stored cwd
    const terminalCwd = cwd || this.cwd;

    // Create terminal container
    const terminalContainer = document.createElement('div');
    terminalContainer.className = 'terminal-item';
    terminalContainer.dataset.terminalId = terminalId;

    // Terminal header with close button
    const header = document.createElement('div');
    header.className = 'terminal-item-header';

    const title = document.createElement('span');
    title.className = 'terminal-item-title';
    title.textContent = `Terminal ${this.nextTerminalId}`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'terminal-item-close';
    closeBtn.innerHTML = '×';
    closeBtn.title = 'Close Terminal';
    closeBtn.addEventListener('click', () => {
      this.removeTerminal(terminalId);
    });

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Terminal content
    const terminalContent = document.createElement('div');
    terminalContent.className = 'terminal-item-content';

    terminalContainer.appendChild(header);
    terminalContainer.appendChild(terminalContent);

    // Add to wrapper
    this.terminalsWrapper.appendChild(terminalContainer);

    // Create terminal instance (without header since we have our own)
    const terminal = new Terminal(terminalContent, this.themeManager.getCurrentTheme(), false, this.cwd);

    // Store terminal instance
    this.terminals.set(terminalId, {
      terminal,
      container: terminalContainer,
      sessionId,
      id: terminalId
    });

    // Fit after a short delay
    setTimeout(() => {
      terminal.fit();
    }, 100);
  }

  private removeTerminal(terminalId: string): void {
    const terminalInstance = this.terminals.get(terminalId);
    if (!terminalInstance) return;

    // Dispose terminal
    terminalInstance.terminal.dispose();

    // Remove from DOM
    terminalInstance.container.remove();

    // Remove from map
    this.terminals.delete(terminalId);

    // If no terminals left, collapse the terminal section
    if (this.terminals.size === 0) {
      this.isTerminalExpanded = false;
      EditorWithTerminal.terminalStates.set(this.editorId, false);
      this.terminalsContainer.style.display = 'none';
      this.terminalResizeHandle.style.display = 'none';
      this.addTerminalBtn.style.display = 'none';
      this.terminalToggle.classList.remove('active');
      const icon = this.terminalToggle.querySelector('svg');
      if (icon) {
        icon.style.transform = 'rotate(0deg)';
      }
      this.terminalToggle.title = 'Show Terminal';
    }

    // Trigger resize event for Monaco to adjust
    window.dispatchEvent(new Event('resize'));
  }

  updateCompareState(isDisabled: boolean, isSelected: boolean): void {
    // The isDisabled parameter already accounts for preview mode (calculated in EditorContainer)
    // so we don't need to check this.isPreviewMode here
    this.compareCheckbox.disabled = isDisabled;
    this.compareCheckbox.checked = isSelected;
  }

  updatePreviewState(isSelected: boolean): void {
    // Only update if the state is different to avoid overwriting user input
    if (this.previewCheckbox.checked !== isSelected) {
      this.previewCheckbox.checked = isSelected;
    }

    // Always update isPreviewMode to stay in sync
    const wasPreviewMode = this.isPreviewMode;
    this.isPreviewMode = isSelected;

    // Only update visibility if the mode actually changed
    if (wasPreviewMode !== isSelected) {
      if (isSelected) {
        this.previewElement.style.display = 'block';
        this.previewResizeHandle.style.display = 'block';
        this.updatePreviewWidth();
        this.updatePreviewContent();
      } else {
        this.previewElement.style.display = 'none';
        this.previewResizeHandle.style.display = 'none';
        this.editorElement.style.flex = '1 1 auto';
      }
    }
  }

  getContainer(): HTMLElement {
    return this.container;
  }

  getMonacoContainer(): HTMLElement {
    return this.editorElement.querySelector('.monaco-container') as HTMLElement;
  }

  getPreviewContainer(): HTMLElement {
    return this.previewElement;
  }

  setMonacoInstance(instance: any): void {
    this.monacoInstance = instance;
  }

  getMonacoInstance(): any {
    return this.monacoInstance;
  }

  setDiffEditorInstance(instance: any): void {
    this.diffEditorInstance = instance;
  }

  getDiffEditorInstance(): any {
    return this.diffEditorInstance;
  }

  async runCommandInTerminal(command: string, cwd?: string): Promise<string> {
    // Update cwd if provided
    if (cwd) {
      this.cwd = cwd;
    }

    // Ensure terminal section is expanded
    if (!this.isTerminalExpanded) {
      this.isTerminalExpanded = true;
      EditorWithTerminal.terminalStates.set(this.editorId, true);
      this.terminalsContainer.style.display = 'block';
      this.terminalResizeHandle.style.display = 'block';
      this.addTerminalBtn.style.display = 'flex';
      this.terminalToggle.classList.add('active');
    }

    // Always create a new terminal for running commands
    this.addNewTerminal();
    // Wait for terminal to be created
    await new Promise(resolve => setTimeout(resolve, 150));

    // Get the newly created terminal (last in the map)
    const newTerminal = Array.from(this.terminals.values()).pop();
    if (newTerminal && window.electronAPI) {
      // Focus the terminal
      newTerminal.terminal.focus();
      // Write the command to the terminal
      await window.electronAPI.writeTerminal(newTerminal.sessionId, command + '\r');
      // Return the sessionId so caller can listen for terminal exit
      return newTerminal.sessionId;
    }
    throw new Error('Failed to create terminal');
  }

  setOriginalEditorInstance(instance: any): void {
    this.originalEditorInstance = instance;
  }

  getOriginalEditorInstance(): any {
    return this.originalEditorInstance;
  }

  getEditorId(): string {
    return this.editorId;
  }

  getCwd(): string | undefined {
    return this.cwd;
  }

  setCwd(cwd: string): void {
    this.cwd = cwd;
  }

  setTheme(theme: 'light' | 'dark'): void {
    // Update all terminal themes
    this.terminals.forEach((terminalInstance) => {
      terminalInstance.terminal.setTheme(theme);
    });

    // Update Monaco editor theme
    if (this.monacoInstance) {
      this.monacoInstance.updateOptions({
        theme: theme === 'dark' ? 'vs-dark' : 'vs'
      });
    }

    // Update diff editor theme
    if (this.diffEditorInstance) {
      this.diffEditorInstance.updateOptions({
        theme: theme === 'dark' ? 'vs-dark' : 'vs'
      });
    }
  }

  dispose(): void {
    // Dispose all terminals
    this.terminals.forEach((terminalInstance) => {
      terminalInstance.terminal.dispose();
    });
    this.terminals.clear();

    if (this.diffEditorInstance) {
      this.diffEditorInstance.dispose();
      this.diffEditorInstance = null;
    }
    if (this.monacoInstance) {
      this.monacoInstance.dispose();
      this.monacoInstance = null;
    }
  }

  isTerminalVisible(): boolean {
    return this.isTerminalExpanded && this.terminals.size > 0;
  }
}

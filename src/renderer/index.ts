import { TabBar } from './components/TabBar';
import { Toolbar } from './components/Toolbar';
import { EditorContainer } from './components/EditorContainer';
import { Modal } from './components/Modal';
import { SettingsModal } from './components/SettingsModal';
import { Terminal } from './components/Terminal';
import { FileExplorer } from './components/FileExplorer';
import { ResizablePanel } from './components/ResizablePanel';
import { EditorStateManager, EditorState } from './state/EditorStateManager';
import { ThemeManager } from './state/ThemeManager';
import { SettingsManager } from './state/SettingsManager';
import { summarizeSpecs } from '../prompts/summarizeSpecs';

class App {
  private stateManager: EditorStateManager;
  private themeManager: ThemeManager;
  private settingsManager: SettingsManager;
  private toolbar: Toolbar;
  private tabBar: TabBar;
  private editorContainer: EditorContainer;
  private fileExplorer: FileExplorer | null = null;
  private resizablePanel: ResizablePanel | null = null;
  private settingsModal: SettingsModal | null = null;
  private unsubscribe: () => void;
  private themeUnsubscribe: () => void;
  private settingsUnsubscribe: () => void;
  private currentModal: Modal | null = null;
  private resultsModal: Modal | null = null;
  private githubImportTerminal: Terminal | null = null;

  // Summarize specs prompt
  private readonly summarizeSpecs = summarizeSpecs;

  constructor() {
    this.stateManager = new EditorStateManager();
    this.themeManager = new ThemeManager();
    this.settingsManager = new SettingsManager();

    // Initialize settings modal
    this.settingsModal = new SettingsModal(
      (config) => this.handleSettingsChange(config),
      this.settingsManager.getConfig()
    );

    // Initialize UI components
    const fileExplorerContainer = document.getElementById('file-explorer')!;
    const fileExplorerResizeHandle = document.getElementById('file-explorer-resize-handle')!;
    const toolbarContainer = document.getElementById('toolbar')!;
    const tabBarContainer = document.getElementById('tab-bar')!;
    const editorContainerElement = document.getElementById('editor-container')!;

    // Initialize File Explorer
    this.fileExplorer = new FileExplorer(fileExplorerContainer, {
      onFileSelect: (filePath) => this.handleFileSelect(filePath),
      themeManager: this.themeManager,
    });

    // Initialize Resizable Panel
    this.resizablePanel = new ResizablePanel(
      fileExplorerContainer,
      fileExplorerResizeHandle
    );

    this.toolbar = new Toolbar(toolbarContainer, {
      onToggleTheme: () => this.handleToggleTheme(),
      onGetSpecs: () => this.handleGetSpecs(),
      onOpenSettings: () => this.handleOpenSettings(),
    });

    this.tabBar = new TabBar(tabBarContainer, {
      onNewTab: () => this.handleNewTab(),
      onSelectTab: (id) => this.handleSelectTab(id),
      onCloseTab: (id) => this.handleCloseTab(id),
      onReorder: (fromIndex, toIndex) => this.handleReorder(fromIndex, toIndex),
      onRename: (id, name) => this.handleRename(id, name),
    });

    this.editorContainer = new EditorContainer(editorContainerElement, {
      onContentChange: (id, content) => this.handleContentChange(id, content),
      onGenerateFromSpecs: (id) => this.handleGenerateFromSpecs(id),
      onReviewAndTest: (id) => this.handleReviewAndTest(id),
      onModifySpecsDoc: (id) => this.handleModifySpecsDoc(id),
      themeManager: this.themeManager,
    });
    this.editorContainer.setStateManager(this.stateManager);

    // Subscribe to state changes
    this.unsubscribe = this.stateManager.subscribe((editors) => {
      this.render(editors);
    });

    // Subscribe to theme changes
    this.themeUnsubscribe = this.themeManager.subscribe((theme) => {
      this.handleThemeChange(theme);
    });

    // Subscribe to settings changes
    this.settingsUnsubscribe = this.settingsManager.subscribe((config) => {
      if (this.settingsModal) {
        this.settingsModal.updateCurrentConfig(config);
      }
    });

    // Set up keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Auto-save on window close
    window.addEventListener('beforeunload', () => {
      this.stateManager.saveAllEditors();
      this.stateManager.disposeAll();
    });

    // Update initial theme icon
    this.toolbar.updateThemeButtonIcon();
  }

  async init(): Promise<void> {
    // Wait for Monaco to load
    await this.waitForMonaco();

    // Wait for EditorContainer to be ready with Monaco
    await this.editorContainer.waitForMonaco();

    // Wait for editor state to be loaded from storage
    await this.stateManager.waitForLoad();

    // Initialize settings manager and load config from file
    await this.settingsManager.initialize();

    // Initial render with loaded editors
    this.render(this.stateManager.getAllEditors());
  }

  private async waitForMonaco(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (typeof (window as any).monaco !== 'undefined') {
        resolve();
        return;
      }

      // Wait for Monaco to be loaded from CDN (via loader.js in HTML)
      const checkInterval = setInterval(() => {
        if (typeof (window as any).require !== 'undefined') {
          clearInterval(checkInterval);

          // Configure Monaco loader
          (window as any).require.config({
            paths: {
              'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs'
            }
          });

          // Load Monaco
          (window as any).require(['vs/editor/editor.main'], () => {
            resolve();
          });
        }
      }, 50);
    });
  }

  private render(editors: EditorState[]): void {
    // Update tab bar
    this.tabBar.renderTabs(editors);

    // Update editor container
    this.editorContainer.renderEditors(editors);

    // Manage Monaco instances
    this.manageMonacoInstances(editors);
  }

  private manageMonacoInstances(editors: EditorState[]): void {
    editors.forEach((editor) => {
      // Skip if the instance is a diff editor (in compare mode)
      // Diff editors are managed separately
      const editorWithTerminal = this.editorContainer.getEditorWithTerminal(editor.id);
      if (editorWithTerminal && editorWithTerminal.getDiffEditorInstance()) {
        console.log('[App] Skipping Monaco management for diff editor:', editor.id);
        return;
      }

      // Create Monaco instance for all editors (not just visible ones)
      // Monaco is efficient enough with automaticLayout to handle 100+ instances
      if (!editor.monacoInstance) {
        const monacoInstance = this.editorContainer.createMonacoEditor(
          editor.id,
          editor.content,
          editor.name,
          this.themeManager.getMonacoTheme()
        );

        if (monacoInstance) {
          this.stateManager.setMonacoInstance(editor.id, monacoInstance);
        }
      } else {
        // Update content if needed - but NOT for diff editors
        const currentContent = editor.monacoInstance.getValue();
        if (currentContent !== editor.content) {
          // Content changed externally, update editor
          // Only do this not during user editing
          this.editorContainer.updateMonacoEditor(editor.id, editor.monacoInstance, editor.content);
        }
      }
    });
  }

  private getEditorElement(id: string): HTMLElement | null {
    return document.querySelector(`.editor-item[data-id="${id}"]`);
  }


  private async handleNewTab(): Promise<void> {
    const editor = await this.stateManager.createEditor();
    // Scroll to the new editor
    setTimeout(() => {
      this.editorContainer.scrollToEditor(editor.id);
    }, 100);
  }

  private handleSelectTab(id: string): void {
    this.editorContainer.scrollToEditor(id);
  }

  private async handleCloseTab(id: string): Promise<void> {
    await this.stateManager.removeEditor(id);
  }

  private handleReorder(fromIndex: number, toIndex: number): void {
    this.stateManager.reorderEditors(fromIndex, toIndex);
  }

  private handleRename(id: string, newName: string): void {
    this.stateManager.renameEditor(id, newName);
  }

  private handleGenerateFromSpecs(id: string): void {
    console.log('[App] Generate from Specs for editor:', id);
    // TODO: Implement generate from specs functionality
    // This could open a modal or trigger a Claude prompt
    alert('Generate from Specs functionality will be implemented here.\n\nEditor ID: ' + id);
  }

  private handleReviewAndTest(id: string): void {
    console.log('[App] Review and Test for editor:', id);
    // TODO: Implement review and test functionality
    // This could run tests, review code, etc.
    alert('Review and Test functionality will be implemented here.\n\nEditor ID: ' + id);
  }

  private handleModifySpecsDoc(id: string): void {
    console.log('[App] Modify Specs Doc for editor:', id);
    // TODO: Implement modify specs doc functionality
    // This could open a modal to edit the specs document
    alert('Modify Specs Doc functionality will be implemented here.\n\nEditor ID: ' + id);
  }

  private async handleFileSelect(filePath: string): Promise<void> {
    if (!window.electronAPI) {
      console.error('[App] electronAPI not available');
      return;
    }

    const result = await window.electronAPI.readFile(filePath);
    if (result.success && result.content !== undefined) {
      // Create a new editor with the file content
      const fileName = filePath.split('/').pop() || filePath;
      const newEditor = await this.stateManager.createEditor(fileName);
      this.stateManager.updateEditorContent(newEditor.id, result.content);
    } else {
      console.error('[App] Failed to read file:', result.error);
    }
  }

  private handleContentChange(id: string, content: string): void {
    this.stateManager.updateEditorContent(id, content);

    // Update preview if this editor is in preview mode
    const editorWithTerminal = this.editorContainer.getEditorWithTerminal(id);
    if (editorWithTerminal) {
      editorWithTerminal.updatePreviewContent();
    }
  }

  private handleToggleTheme(): void {
    this.themeManager.toggleTheme();
  }

  private handleGetSpecs(): void {
    // Create modal content
    const content = document.createElement('div');
    content.innerHTML = `
      <div style="margin-bottom: 20px;">
        <p style="color: var(--text-secondary); margin-bottom: 16px;">Select a source to import specifications:</p>
        <div id="spec-source-selection" style="display: flex; flex-direction: column; gap: 12px;">
          <label class="spec-source-option" data-source="github">
            <input type="radio" name="spec-source" value="github" style="margin: 0;">
            <div>
              <div style="font-weight: 500; color: var(--text-primary);">GitHub Repository</div>
              <div style="font-size: 12px; color: var(--text-secondary);">Import specs from a GitHub repository URL</div>
            </div>
          </label>
          <label class="spec-source-option" data-source="file">
            <input type="radio" name="spec-source" value="file" style="margin: 0;">
            <div>
              <div style="font-weight: 500; color: var(--text-primary);">Local File</div>
              <div style="font-size: 12px; color: var(--text-secondary);">Import specs from a local file on your computer</div>
            </div>
          </label>
          <label class="spec-source-option" data-source="url">
            <input type="radio" name="spec-source" value="url" style="margin: 0;">
            <div>
              <div style="font-weight: 500; color: var(--text-primary);">URL</div>
              <div style="font-size: 12px; color: var(--text-secondary);">Import specs from a direct URL</div>
            </div>
          </label>
        </div>

        <div id="github-input-section" style="display: none; margin-top: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text-primary);">
            GitHub Repository URL:
          </label>
          <input
            type="text"
            id="github-url-input"
            placeholder="https://github.com/username/repo"
            style="width: 100%; padding: 10px 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 14px; box-sizing: border-box;"
          />
          <p style="font-size: 12px; color: var(--text-secondary); margin-top: 8px;">
            Enter the GitHub repository URL to clone and analyze with Claude CLI
          </p>
        </div>

        <div id="processing-indicator" style="display: none; margin-top: 20px;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
            <div class="spinner"></div>
            <div style="flex: 1;">
              <div style="font-weight: 500; color: var(--text-primary);">Processing Repository...</div>
            </div>
          </div>
          <div style="margin-top: 16px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text-primary); font-size: 13px;">
              Progress Log:
            </label>
            <div
              id="processing-log"
              style="width: 100%; height: 300px; padding: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; line-height: 1.6; overflow-y: auto; white-space: pre-wrap; box-sizing: border-box;"
            ></div>
          </div>
        </div>
      </div>
    `;

    // Add styles for radio options
    const style = document.createElement('style');
    style.textContent = `
      .spec-source-option {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: var(--bg-primary);
        border-radius: 8px;
        cursor: pointer;
        border: 1px solid var(--border-color);
        transition: all 0.2s;
      }
      .spec-source-option:hover {
        border-color: var(--accent-color);
        background: var(--bg-tertiary);
      }
      .spec-source-option input:checked + div {
        color: var(--accent-color);
      }
      .spinner {
        width: 20px;
        height: 20px;
        border: 2px solid var(--accent-color);
        border-top-color: transparent;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      #processing-log {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .log-timestamp {
        color: var(--text-secondary);
        font-size: 11px;
      }
      .log-prefix {
        font-weight: bold;
        margin-right: 6px;
      }
      .log-message {
        color: var(--text-primary);
      }
      .log-info .log-prefix {
        color: var(--accent-color);
      }
      .log-success .log-prefix {
        color: #4ec9b0;
      }
      .log-success .log-message {
        color: #4ec9b0;
      }
      .log-error .log-prefix {
        color: #f48771;
      }
      .log-error .log-message {
        color: #f48771;
      }
    `;
    content.appendChild(style);

    // Handle radio button changes
    const githubSection = content.querySelector('#github-input-section') as HTMLElement;
    const radioButtons = content.querySelectorAll('input[name="spec-source"]');

    radioButtons.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.value === 'github') {
          githubSection.style.display = 'block';
        } else {
          githubSection.style.display = 'none';
        }
      });
    });

    // Create and show modal
    this.currentModal = new Modal({
      title: 'Get Specs from...',
      content: content,
      onConfirm: async () => {
        const selected = content.querySelector('input[name="spec-source"]:checked') as HTMLInputElement;
        if (selected?.value === 'github') {
          await this.handleGithubImport(content);
        }
      },
      onCancel: () => {
        this.currentModal = null;
      },
      confirmText: 'Import',
      cancelText: 'Cancel',
      width: '600px',
      closeOnConfirm: false, // Don't close modal when Import is clicked
    });

    this.currentModal.open();
  }

  private handleOpenSettings(): void {
    if (this.settingsModal) {
      this.settingsModal.open();
    }
  }

  private async handleSettingsChange(config: { apiKey?: string; baseUrl?: string }): Promise<void> {
    await this.settingsManager.updateConfig(config);
    console.log('[Settings] Config updated:', this.settingsManager.getConfig());
  }

  private async handleGithubImport(content: HTMLElement): Promise<void> {
    const urlInput = content.querySelector('#github-url-input') as HTMLInputElement;
    const processingIndicator = content.querySelector('#processing-indicator') as HTMLElement;
    const selectionSection = content.querySelector('#spec-source-selection') as HTMLElement;
    const githubSection = content.querySelector('#github-input-section') as HTMLElement;
    const modalFooter = content.parentElement?.querySelector('.modal-footer') as HTMLElement;
    const processingLog = content.querySelector('#processing-log') as HTMLElement;

    const repoUrl = urlInput.value.trim();

    // Validate input
    if (!repoUrl) {
      if (processingLog) {
        processingLog.textContent = 'Error: Please enter a GitHub repository URL\n';
      }
      this.showErrorInModal('Please enter a GitHub repository URL', processingLog, modalFooter);
      return;
    }

    // Validate GitHub URL
    if (!repoUrl.includes('github.com')) {
      if (processingLog) {
        processingLog.textContent = 'Error: Please enter a valid GitHub repository URL\n';
      }
      this.showErrorInModal('Please enter a valid GitHub repository URL', processingLog, modalFooter);
      return;
    }

    // Hide form elements and show processing indicator
    selectionSection.style.display = 'none';
    githubSection.style.display = 'none';
    if (modalFooter) {
      modalFooter.style.display = 'none';
    }
    processingIndicator.style.display = 'block';

    // Initialize the log
    if (processingLog) {
      const timestamp = new Date().toLocaleTimeString();
      processingLog.innerHTML = `<div class="log-info"><span class="log-timestamp">[${timestamp}]</span> <span class="log-prefix">→</span> <span class="log-message">Starting GitHub import...</span></div><div class="log-info"><span class="log-timestamp">[${timestamp}]</span> <span class="log-prefix">→</span> <span class="log-message">Repository URL: ${this.escapeHtml(repoUrl)}</span></div>`;
    }

    // Listen for progress updates
    const progressUnsubscribe = window.electronAPI.onGithubProgress((message) => {
      console.log('[GitHub Import Progress]', message);
      if (processingLog) {
        const timestamp = new Date().toLocaleTimeString();
        // Detect message type for styling
        let messageClass = 'log-info';
        let prefix = '→';
        if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
          messageClass = 'log-error';
          prefix = '❌';
        } else if (message.toLowerCase().includes('success') || message.toLowerCase().includes('complete') || message.toLowerCase().includes('✓')) {
          messageClass = 'log-success';
          prefix = '✓';
        }

        const logEntry = `<div class="${messageClass}"><span class="log-timestamp">[${timestamp}]</span> <span class="log-prefix">${prefix}</span> <span class="log-message">${this.escapeHtml(message)}</span></div>`;
        processingLog.innerHTML += logEntry;
        // Auto-scroll to bottom
        processingLog.scrollTop = processingLog.scrollHeight;
      }
    });

    try {
      console.log('[GitHub Import] Starting import process');
      // Check if electronAPI exists
      if (!window.electronAPI) {
        const error = 'electronAPI is not available';
        console.error('[GitHub Import]', error);
        throw new Error(error);
      }

      // Check if importGithubRepo function exists
      if (typeof window.electronAPI.importGithubRepo !== 'function') {
        const error = 'importGithubRepo function is not available';
        console.error('[GitHub Import]', error);
        throw new Error(error);
      }

      console.log('[GitHub Import] Calling importGithubRepo...');

      // Call the import function (non-blocking)
      const resultPromise = window.electronAPI.importGithubRepo(repoUrl, this.summarizeSpecs);

      console.log('[GitHub Import] Waiting for result...');

      // Wait for completion with timeout (10 hours)
      const timeoutMs = 36000000; // 10 hours
      const result = await Promise.race([
        resultPromise,
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            const errorMsg = 'Operation timed out after 10 hours';
            console.error('[GitHub Import]', errorMsg);
            reject(new Error(errorMsg));
          }, timeoutMs);
        })
      ]);

      console.log('[GitHub Import] Result received:', result ? 'Success' : 'No result');
      progressUnsubscribe();

      if (!result) {
        const error = 'No result returned from import function';
        console.error('[GitHub Import]', error);
        throw new Error(error);
      }

      if (result.success && result.repoPath) {
        console.log('[GitHub Import] Repo cloned successfully! Creating terminal...');
        // Log success message
        if (processingLog) {
          const timestamp = new Date().toLocaleTimeString();
          processingLog.innerHTML += `<div class="log-success"><span class="log-timestamp">[${timestamp}]</span> <span class="log-prefix">✓</span> <span class="log-message">Repository cloned successfully!</span></div>`;
          processingLog.innerHTML += `<div class="log-info"><span class="log-timestamp">[${timestamp}]</span> <span class="log-prefix">→</span> <span class="log-message">Working directory: ${this.escapeHtml(result.repoPath)}</span></div>`;
          processingLog.innerHTML += `<div class="log-info"><span class="log-timestamp">[${timestamp}]</span> <span class="log-prefix">→</span> <span class="log-message">Starting terminal for Claude analysis...</span></div>`;
          processingLog.scrollTop = processingLog.scrollHeight;
        }

        // Hide processing log and show terminal
        if (processingLog) {
          processingLog.style.display = 'none';
        }

        // Create terminal container
        const terminalContainer = document.createElement('div');
        terminalContainer.className = 'github-import-terminal-container';
        terminalContainer.style.height = '400px';
        terminalContainer.style.marginTop = '20px';

        // Add terminal header
        const terminalHeader = document.createElement('div');
        terminalHeader.className = 'terminal-header';
        terminalHeader.innerHTML = `<span class="terminal-title">Terminal - Claude Analysis</span>`;
        terminalContainer.appendChild(terminalHeader);

        // Add terminal xterm container
        const terminalXterm = document.createElement('div');
        terminalXterm.className = 'terminal-xterm';
        terminalXterm.style.height = '360px';
        terminalContainer.appendChild(terminalXterm);

        // Add terminal to modal content
        content.appendChild(terminalContainer);

        // Create terminal instance
        this.githubImportTerminal = new Terminal(
          terminalContainer,
          this.themeManager.getCurrentTheme()
        );

        // Store repo path for later use
        (terminalContainer as any).dataset.repoPath = result.repoPath;

        // Listen for terminal exit to read the output file
        const terminalExitUnsubscribe = window.electronAPI.onTerminalExit(
          this.githubImportTerminal.sessionId,
          async (exitCode: number, signal: number) => {
            console.log('[GitHub Import] Terminal exited with code:', exitCode, 'signal:', signal);

            // Read the output file
            const outputPath = `${result.repoPath}/output_specs.md`;
            console.log('[GitHub Import] Reading output from:', outputPath);

            if (window.electronAPI) {
              const fileResult = await window.electronAPI.readFile(outputPath);

              if (fileResult.success && fileResult.content) {
                console.log('[GitHub Import] Output file read successfully, length:', fileResult.content.length);

                // Create new editor with the specs immediately
                const newEditorName = `Specs - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
                const newEditor = await this.stateManager.createEditor(newEditorName);
                this.stateManager.updateEditorContent(newEditor.id, fileResult.content);

                // Close the modal and clean up immediately
                if (this.currentModal) {
                  this.currentModal.close();
                  this.currentModal = null;
                }

                // Clean up terminal
                if (this.githubImportTerminal) {
                  this.githubImportTerminal.dispose();
                  this.githubImportTerminal = null;
                }
              } else {
                console.error('[GitHub Import] Failed to read output file:', fileResult.error);
                const timestamp = new Date().toLocaleTimeString();
                if (processingLog) {
                  processingLog.style.display = 'block';
                  processingLog.innerHTML += `<div class="log-error"><span class="log-timestamp">[${timestamp}]</span> <span class="log-prefix">❌</span> <span class="log-message">Failed to read output_specs.md: ${this.escapeHtml(fileResult.error || 'Unknown error')}</span></div>`;
                  processingLog.innerHTML += `<div class="log-info"><span class="log-timestamp">[${timestamp}]</span> <span class="log-prefix">→</span> <span class="log-message">Please check the terminal output above for any errors.</span></div>`;
                  processingLog.scrollTop = processingLog.scrollHeight;
                }
              }
            }

            terminalExitUnsubscribe();
          }
        );

        // Wait a bit for terminal to initialize, then send commands
        setTimeout(async () => {
          // CD to the repo directory and run claude, then exit automatically
          const commands = `cd "${result.repoPath}" && claude --dangerously-skip-permissions -p "please read the task doc at summarize_specs_instructions.md and output the final markdown doc. do not ask any questions, do the task in headless mode." && exit\r`;
          if (window.electronAPI) {
            await window.electronAPI.writeTerminal(this.githubImportTerminal!.sessionId, commands);
          }
        }, 1000);

      } else if (result.success && result.output) {
        console.log('[GitHub Import] Success! Showing results...');
        // Log success message
        if (processingLog) {
          const timestamp = new Date().toLocaleTimeString();
          processingLog.innerHTML += `<div class="log-success"><span class="log-timestamp">[${timestamp}]</span> <span class="log-prefix">✓</span> <span class="log-message">Import completed successfully!</span></div><div class="log-success"><span class="log-timestamp">[${timestamp}]</span> <span class="log-prefix">✓</span> <span class="log-message">Preparing to display results...</span></div>`;
          processingLog.scrollTop = processingLog.scrollHeight;
        }
        // Show results in the same modal
        this.showResultsInModal(content, result.output);
      } else {
        const errorMsg = result.error || 'Unknown error occurred';
        console.error('[GitHub Import]', errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error: any) {
      const errorText = error.message || 'Unknown error';
      console.error('[GitHub Import] Exception caught:', errorText);
      if (processingLog) {
        const timestamp = new Date().toLocaleTimeString();
        processingLog.innerHTML += `<div class="log-error"><span class="log-timestamp">[${timestamp}]</span> <span class="log-prefix">❌</span> <span class="log-message">ERROR: ${this.escapeHtml(errorText)}</span></div>`;
        processingLog.scrollTop = processingLog.scrollHeight;
      }

      progressUnsubscribe();

      this.showErrorInModal(
        `Error: ${error.message || 'Unknown error'}`,
        processingLog,
        modalFooter,
        () => {
          // Reset modal state
          selectionSection.style.display = 'flex';
          githubSection.style.display = 'block';
          processingIndicator.style.display = 'none';
        }
      );
    }
  }

  private showErrorInModal(
    errorMessage: string,
    processingLog: HTMLElement | null,
    modalFooter: HTMLElement | null,
    onReset?: () => void
  ): void {
    console.error('[Modal Error]', errorMessage);
    if (processingLog) {
      const timestamp = new Date().toLocaleTimeString();
      processingLog.innerHTML += `<div class="log-error"><span class="log-timestamp">[${timestamp}]</span> <span class="log-prefix">❌</span> <span class="log-message">${this.escapeHtml(errorMessage)}</span></div>`;
      processingLog.scrollTop = processingLog.scrollHeight;
    }

    // Show retry/close buttons
    if (modalFooter) {
      modalFooter.style.display = 'flex';
      modalFooter.innerHTML = '';

      if (onReset) {
        const retryBtn = document.createElement('button');
        retryBtn.className = 'modal-btn modal-btn-cancel';
        retryBtn.textContent = 'Try Again';
        retryBtn.addEventListener('click', () => {
          onReset();
        });
        modalFooter.appendChild(retryBtn);
      }

      const closeBtn = document.createElement('button');
      closeBtn.className = 'modal-btn modal-btn-confirm';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', () => {
        if (this.currentModal) {
          this.currentModal.close();
          this.currentModal = null;
        }
      });
      modalFooter.appendChild(closeBtn);
    }
  }

  private showResultsInModal(modalContent: HTMLElement, output: string): void {
    // Clear the modal content and show results
    const modalDialog = modalContent.closest('.modal-dialog') as HTMLElement;
    if (!modalDialog) return;

    modalDialog.innerHTML = `
      <div class="modal-header">
        <h2 class="modal-title">Generated Specifications</h2>
        <button class="modal-close-btn" id="modal-close-x">&times;</button>
      </div>
      <div class="modal-content" style="padding: 0;">
        <div style="padding: 20px; background: var(--bg-primary);">
          <p style="color: var(--text-secondary); margin-bottom: 12px;">Specifications have been generated successfully:</p>
          <textarea
            id="specs-output"
            readonly
            style="width: 100%; min-height: 400px; max-height: 600px; padding: 16px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-primary); font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 13px; line-height: 1.6; resize: vertical; white-space: pre-wrap; overflow-y: auto; box-sizing: border-box;"
          >${output.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
        </div>
      </div>
      <div class="modal-footer" style="display: flex;">
        <button class="modal-btn modal-btn-cancel" id="modal-close-btn">Close</button>
        <button class="modal-btn modal-btn-confirm" id="copy-specs-btn">Copy to Clipboard</button>
      </div>
    `;

    // Add close functionality
    const closeXBtn = modalDialog.querySelector('#modal-close-x');
    const closeBtn = modalDialog.querySelector('#modal-close-btn');
    const closeModal = () => {
      if (this.currentModal) {
        this.currentModal.close();
        this.currentModal = null;
      }
    };

    if (closeXBtn) closeXBtn.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    // Add copy functionality
    const copyBtn = modalDialog.querySelector('#copy-specs-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(output);
          const btn = copyBtn as HTMLButtonElement;
          btn.textContent = 'Copied!';
          btn.disabled = true;
          setTimeout(() => {
            btn.textContent = 'Copy to Clipboard';
            btn.disabled = false;
          }, 2000);
        } catch (err) {
          alert('Failed to copy to clipboard');
        }
      });
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private handleThemeChange(theme: 'light' | 'dark'): void {
    // Update Monaco theme for all active editors
    const editors = this.stateManager.getAllEditors();
    const monaco = (window as any).monaco;

    if (monaco) {
      editors.forEach((editor) => {
        if (editor.monacoInstance) {
          monaco.editor.setTheme(this.themeManager.getMonacoTheme());
        }
      });
    }

    // Update all editor terminals theme
    this.editorContainer.updateAllEditorsTheme(theme);

    // Update theme icon
    this.toolbar.updateThemeButtonIcon();
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + T: New tab
      if ((e.ctrlKey || e.metaKey) && e.key === 't' && !e.shiftKey) {
        e.preventDefault();
        this.handleNewTab();
      }

      // Ctrl/Cmd + Shift + T: Toggle theme
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        this.handleToggleTheme();
      }

      // Ctrl/Cmd + W: Close current tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        // Find focused/active tab and close it
        const activeElement = document.activeElement;
        const editorItem = activeElement?.closest('.editor-item');
        if (editorItem) {
          const id = editorItem.getAttribute('data-id');
          if (id) this.handleCloseTab(id);
        }
      }

      // Ctrl/Cmd + S: Save all
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.stateManager.saveAllEditors();
      }
    });
  }

  destroy(): void {
    this.unsubscribe();
    this.themeUnsubscribe();
    this.settingsUnsubscribe();
    this.stateManager.disposeAll();
  }
}

// Initialize app when DOM is ready
let app: App;

document.addEventListener('DOMContentLoaded', async () => {
  app = new App();
  await app.init();
});

// Handle hot module replacement in development
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    if (app) {
      app.destroy();
    }
    app = new App();
    app.init();
  });
}

export { App };

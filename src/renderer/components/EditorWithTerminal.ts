import { Terminal } from './Terminal';
import { ThemeManager } from '../state/ThemeManager';

export interface EditorWithTerminalOptions {
  onContentChange: (id: string, content: string) => void;
  themeManager: ThemeManager;
}

export class EditorWithTerminal {
  private container: HTMLElement;
  private editorElement!: HTMLElement;
  private terminalContainer!: HTMLElement;
  private terminal: Terminal | null = null;
  private terminalToggle!: HTMLElement;
  private isTerminalExpanded: boolean = false;
  private onContentChange: (id: string, content: string) => void;
  private themeManager: ThemeManager;
  private monacoInstance: any = null;

  // Store terminal state
  private static terminalStates = new Map<string, boolean>();

  constructor(
    id: string,
    name: string,
    container: HTMLElement,
    options: EditorWithTerminalOptions
  ) {
    this.container = container;
    this.onContentChange = options.onContentChange;
    this.themeManager = options.themeManager;

    // Restore terminal state for this editor
    this.isTerminalExpanded = EditorWithTerminal.terminalStates.get(id) || false;

    this.render(id, name);
    this.setupTerminalToggle(id);
  }

  private render(id: string, name: string): void {
    this.container.className = 'editor-with-terminal';
    this.container.innerHTML = '';

    // Editor section
    this.editorElement = document.createElement('div');
    this.editorElement.className = 'editor-section';
    this.editorElement.dataset.id = id;

    const monacoContainer = document.createElement('div');
    monacoContainer.className = 'monaco-container';
    monacoContainer.dataset.editorId = id;
    this.editorElement.appendChild(monacoContainer);

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

    toggleSection.appendChild(this.terminalToggle);

    // Terminal section (initially hidden)
    this.terminalContainer = document.createElement('div');
    this.terminalContainer.className = 'terminal-section';
    this.terminalContainer.style.display = this.isTerminalExpanded ? 'flex' : 'none';

    // Assemble
    this.container.appendChild(this.editorElement);
    this.container.appendChild(toggleSection);
    this.container.appendChild(this.terminalContainer);
  }

  private setupTerminalToggle(id: string): void {
    this.terminalToggle.addEventListener('click', () => {
      this.toggleTerminal(id);
    });
  }

  private toggleTerminal(id: string): void {
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

    // Show/hide terminal
    if (this.isTerminalExpanded) {
      this.terminalContainer.style.display = 'flex';
      if (!this.terminal) {
        this.terminal = new Terminal(this.terminalContainer, this.themeManager.getCurrentTheme());
        // Trigger a fit after a short delay
        setTimeout(() => {
          if (this.terminal) {
            (this.terminal as any).fit();
          }
        }, 100);
      }
    } else {
      this.terminalContainer.style.display = 'none';
    }

    // Trigger resize event for Monaco to adjust
    window.dispatchEvent(new Event('resize'));
  }

  getMonacoContainer(): HTMLElement {
    return this.editorElement.querySelector('.monaco-container') as HTMLElement;
  }

  setMonacoInstance(instance: any): void {
    this.monacoInstance = instance;
  }

  getMonacoInstance(): any {
    return this.monacoInstance;
  }

  setTheme(theme: 'light' | 'dark'): void {
    if (this.terminal) {
      this.terminal.setTheme(theme);
    }
  }

  dispose(): void {
    if (this.terminal) {
      this.terminal.dispose();
      this.terminal = null;
    }
  }

  isTerminalVisible(): boolean {
    return this.isTerminalExpanded;
  }
}

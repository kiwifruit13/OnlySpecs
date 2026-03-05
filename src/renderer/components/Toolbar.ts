export class Toolbar {
  private container: HTMLElement;
  private themeToggleBtn!: HTMLElement;
  private onToggleTheme: () => void;
  private onGetSpecs: () => void;
  private onOpenSettings: () => void;

  constructor(
    container: HTMLElement,
    options: {
      onToggleTheme: () => void;
      onGetSpecs?: () => void;
      onOpenSettings?: () => void;
    }
  ) {
    this.container = container;
    this.onToggleTheme = options.onToggleTheme;
    this.onGetSpecs = options.onGetSpecs || (() => {});
    this.onOpenSettings = options.onOpenSettings || (() => {});

    this.render();
  }

  private render(): void {
    this.container.className = 'toolbar';
    this.container.innerHTML = '';

    // App title
    const title = document.createElement('div');
    title.className = 'toolbar-title';
    title.textContent = 'OnlySpecs';
    this.container.appendChild(title);

    // Right side controls
    const controls = document.createElement('div');
    controls.className = 'toolbar-controls';

    // Create New Project button
    const newProjectBtn = this.createNewProjectBtn();
    controls.appendChild(newProjectBtn);

    // Get Specs button
    const getSpecsBtn = this.createGetSpecsBtn();
    controls.appendChild(getSpecsBtn);

    // Settings button
    const settingsBtn = this.createSettingsBtn();
    controls.appendChild(settingsBtn);

    // Theme toggle button
    this.themeToggleBtn = this.createThemeToggleBtn();
    controls.appendChild(this.themeToggleBtn);

    this.container.appendChild(controls);
  }

  private createNewProjectBtn(): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'new-project-btn';
    btn.textContent = 'Create a new project';
    btn.title = 'Create a new project';

    // Plus icon
    const icon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>`;

    btn.innerHTML = icon + 'Create a new project';

    btn.addEventListener('click', () => {
      // TODO: Implement create new project functionality
    });

    return btn;
  }

  private createGetSpecsBtn(): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'get-specs-btn';
    btn.textContent = 'Get Specs from...';
    btn.title = 'Import specifications from external sources';

    btn.addEventListener('click', () => {
      this.onGetSpecs();
    });

    return btn;
  }

  private createSettingsBtn(): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'settings-btn';
    btn.title = 'Settings';

    // Settings/gear icon
    const icon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>`;

    btn.innerHTML = icon;
    btn.addEventListener('click', () => {
      this.onOpenSettings();
    });

    return btn;
  }

  private createThemeToggleBtn(): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'theme-toggle-btn';
    btn.title = 'Toggle theme (Ctrl/Cmd + Shift + T)';

    // Sun icon for light mode
    const sunIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>`;

    // Moon icon for dark mode
    const moonIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>`;

    btn.innerHTML = moonIcon; // Default to moon (dark mode)
    btn.addEventListener('click', () => {
      this.onToggleTheme();
      this.updateThemeIcon(btn);
    });

    return btn;
  }

  private updateThemeIcon(btn: HTMLElement): void {
    const currentTheme = document.documentElement.getAttribute('data-theme');

    // Moon icon for dark mode, Sun for light mode
    const moonIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>`;

    const sunIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>`;

    btn.innerHTML = currentTheme === 'light' ? sunIcon : moonIcon;
  }

  updateThemeButtonIcon(): void {
    this.updateThemeIcon(this.themeToggleBtn);
  }
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
  expanded?: boolean;
}

export interface FileExplorerOptions {
  onFileSelect?: (filePath: string) => void;
  onFileDelete?: (filePath: string) => void;
  onRootChange?: (rootPath: string) => void;
  themeManager?: any;
}

export class FileExplorer {
  private container: HTMLElement;
  private options: FileExplorerOptions;
  private currentRoot: string | null = null;
  private fileTree: FileEntry[] = [];
  private onFileSelect?: (filePath: string) => void;
  private onFileDelete?: (filePath: string) => void;
  private onRootChange?: (rootPath: string) => void;

  constructor(container: HTMLElement, options: FileExplorerOptions = {}) {
    this.container = container;
    this.options = options;
    this.onFileSelect = options.onFileSelect;
    this.onFileDelete = options.onFileDelete;
    this.onRootChange = options.onRootChange;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="file-explorer">
        <div class="file-explorer-header">
          <div class="file-explorer-title">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/>
            </svg>
            <span>File Explorer</span>
          </div>
          <button class="file-explorer-open-btn" title="Open Folder">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 4v10a1 1 0 001 1h12a1 1 0 001-1V4H1zm1-2h12a2 2 0 012 2v10a2 2 0 01-2 2H2a2 2 0 01-2-2V4a2 2 0 012-2z"/>
            </svg>
          </button>
        </div>
        <div class="file-explorer-content">
          <div class="file-explorer-empty">
            <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" style="opacity: 0.3;">
              <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/>
            </svg>
            <p>No folder opened</p>
            <button class="file-explorer-open-big-btn">Open Folder</button>
          </div>
        </div>
      </div>
    `;

    // Set up event listeners
    const openBtn = this.container.querySelector('.file-explorer-open-btn');
    const openBigBtn = this.container.querySelector('.file-explorer-open-big-btn');

    openBtn?.addEventListener('click', () => this.openFolder());
    openBigBtn?.addEventListener('click', () => this.openFolder());
  }

  private async openFolder(): Promise<void> {
    if (!window.electronAPI) {
      console.error('[FileExplorer] electronAPI not available');
      return;
    }

    const result = await window.electronAPI.selectDirectory();
    if (result.success && result.path) {
      this.currentRoot = result.path;
      await this.loadDirectory(result.path);
      if (this.onRootChange) {
        this.onRootChange(result.path);
      }
    }
  }

  private async loadDirectory(dirPath: string): Promise<void> {
    if (!window.electronAPI) {
      console.error('[FileExplorer] electronAPI not available');
      return;
    }

    const result = await window.electronAPI.readDirectory(dirPath);
    if (result.success && result.entries) {
      this.fileTree = result.entries.map(entry => ({
        ...entry,
        expanded: false,
        children: []
      }));
      this.renderTree();
      this.updateHeader();
    }
  }

  private async expandDirectory(entry: FileEntry): Promise<void> {
    if (!window.electronAPI) {
      console.error('[FileExplorer] electronAPI not available');
      return;
    }

    const result = await window.electronAPI.readDirectory(entry.path);
    if (result.success && result.entries) {
      entry.children = result.entries.map(child => ({
        ...child,
        expanded: false,
        children: []
      }));
      entry.expanded = true;
      this.renderTree();
    }
  }

  private collapseDirectory(entry: FileEntry): void {
    entry.expanded = false;
    this.renderTree();
  }

  private updateHeader(): void {
    const title = this.container.querySelector('.file-explorer-title span');
    if (title && this.currentRoot) {
      const parts = this.currentRoot.split('/');
      title.textContent = parts.length > 3 ? `.../${parts.slice(-2).join('/')}` : this.currentRoot;
    }
  }

  public async loadProjectRoot(rootPath: string): Promise<void> {
    this.currentRoot = rootPath;
    await this.loadDirectory(rootPath);
    if (this.onRootChange) {
      this.onRootChange(rootPath);
    }
  }

  public async refresh(): Promise<void> {
    if (!this.currentRoot) return;
    await this.loadDirectory(this.currentRoot);
  }

  public getCurrentRoot(): string | null {
    return this.currentRoot;
  }

  private renderTree(): void {
    const content = this.container.querySelector('.file-explorer-content') as HTMLElement;
    if (!content) return;

    if (this.fileTree.length === 0) {
      content.innerHTML = `
        <div class="file-explorer-empty">
          <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" style="opacity: 0.3;">
            <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/>
          </svg>
          <p>Empty folder</p>
        </div>
      `;
      return;
    }

    content.innerHTML = `<ul class="file-tree">${this.renderEntries(this.fileTree)}</ul>`;

    // Add event listeners
    this.attachTreeListeners(content);
  }

  private renderEntries(entries: FileEntry[], depth: number = 0): string {
    return entries.map(entry => this.renderEntry(entry, depth)).join('');
  }

  private isSpecsFile(name: string): boolean {
    return /^specs_v\d+\.md$/i.test(name);
  }

  private renderEntry(entry: FileEntry, depth: number): string {
    const indent = depth * 16;
    const icon = entry.isDirectory
      ? `<svg class="file-icon folder-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/>
        </svg>`
      : `<svg class="file-icon file-icon-default" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z"/>
        </svg>`;

    const chevron = entry.isDirectory
      ? `<svg class="chevron ${entry.expanded ? 'expanded' : ''}" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M4.5 3l3 3-3 3V3z"/>
        </svg>`
      : '<span class="chevron-placeholder"></span>';

    // Add delete icon for specs files and folders
    const showDeleteIcon = entry.isDirectory || this.isSpecsFile(entry.name);
    const deleteIcon = showDeleteIcon
      ? `<button class="file-delete-btn" title="${entry.isDirectory ? 'Delete folder' : 'Delete file'}" data-path="${this.escapeHtml(entry.path)}" data-is-directory="${entry.isDirectory}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
        </button>`
      : '';

    const children = entry.isDirectory && entry.expanded && entry.children
      ? `<ul class="nested-children">${this.renderEntries(entry.children, depth + 1)}</ul>`
      : '';

    return `
      <li class="file-tree-item ${entry.expanded ? 'expanded' : ''}" data-path="${this.escapeHtml(entry.path)}" data-is-directory="${entry.isDirectory}">
        <div class="file-tree-item-content" style="padding-left: ${indent + 8}px">
          <span class="file-tree-toggle">${chevron}</span>
          <span class="file-tree-icon">${icon}</span>
          <span class="file-tree-name">${this.escapeHtml(entry.name)}</span>
          ${deleteIcon}
        </div>
        ${children}
      </li>
    `;
  }

  private attachTreeListeners(container: HTMLElement): void {
    // Toggle directory expand/collapse
    container.querySelectorAll('.file-tree-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = (toggle as HTMLElement).closest('.file-tree-item') as HTMLElement;
        if (!item) return;

        const path = item.dataset.path;
        const isDirectory = item.dataset.isDirectory === 'true';

        if (isDirectory && path) {
          const entry = this.findEntry(this.fileTree, path);
          if (entry) {
            if (entry.expanded) {
              this.collapseDirectory(entry);
            } else {
              this.expandDirectory(entry);
            }
          }
        }
      });
    });

    // File/folder selection
    container.querySelectorAll('.file-tree-item-content').forEach(content => {
      content.addEventListener('click', (e) => {
        const item = (content as HTMLElement).closest('.file-tree-item') as HTMLElement;
        if (!item) return;

        const path = item.dataset.path;
        const isDirectory = item.dataset.isDirectory === 'true';

        // Remove active class from all items
        container.querySelectorAll('.file-tree-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        if (!path) return;

        if (isDirectory) {
          const entry = this.findEntry(this.fileTree, path);
          if (entry) {
            if (entry.expanded) {
              this.collapseDirectory(entry);
            } else {
              this.expandDirectory(entry);
            }
          }
          return;
        }

        if (this.onFileSelect) {
          this.onFileSelect(path);
        }
      });
    });

    // Delete button for specs files and folders
    container.querySelectorAll('.file-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const filePath = (btn as HTMLElement).dataset.path;
        const isDirectory = (btn as HTMLElement).dataset.isDirectory === 'true';
        if (filePath) {
          this.handleDelete(filePath, isDirectory);
        }
      });
    });
  }

  private async handleDelete(filePath: string, isDirectory: boolean): Promise<void> {
    const fileName = filePath.split('/').pop() || filePath;
    const itemType = isDirectory ? 'folder' : 'file';
    const warningText = isDirectory
      ? `\n\nThis will permanently delete the folder and all files inside it.`
      : `\n\nThis will permanently delete the file from the folder.`;

    const confirmed = confirm(`Are you sure you want to delete "${fileName}"?${warningText}`);

    if (!confirmed) return;

    if (!window.electronAPI) {
      console.error('[FileExplorer] electronAPI not available');
      return;
    }

    let result;
    if (isDirectory) {
      result = await window.electronAPI.deleteFolder(filePath);
    } else {
      result = await window.electronAPI.deleteFile(filePath);
    }

    if (result.success) {
      // Notify parent about the deletion
      if (this.onFileDelete) {
        this.onFileDelete(filePath);
      }
      // Refresh the file tree
      await this.refresh();
    } else {
      alert(`Failed to delete ${itemType}: ${result.error || 'Unknown error'}`);
    }
  }

  private findEntry(entries: FileEntry[], path: string): FileEntry | undefined {
    for (const entry of entries) {
      if (entry.path === path) return entry;
      if (entry.children) {
        const found = this.findEntry(entry.children, path);
        if (found) return found;
      }
    }
    return undefined;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  public setTheme(theme: 'light' | 'dark'): void {
    // Theme is handled by CSS variables
  }
}

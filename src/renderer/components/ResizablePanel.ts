export class ResizablePanel {
  private panel: HTMLElement;
  private resizeHandle: HTMLElement;
  private isResizing: boolean = false;
  private startX: number = 0;
  private startWidth: number = 0;

  // Storage key for saving width
  private readonly STORAGE_KEY = 'file-explorer-width';

  constructor(container: HTMLElement, resizeHandle: HTMLElement) {
    this.resizeHandle = resizeHandle;

    // Find the actual panel element with the file-explorer class
    const panelElement = container.querySelector('.file-explorer') as HTMLElement;
    if (panelElement) {
      this.panel = panelElement;
    } else {
      // Fallback to container if inner element not found
      this.panel = container;
    }

    // Load saved width
    this.loadWidth();

    // Set up event listeners
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.resizeHandle.addEventListener('mousedown', this.startResize.bind(this));
    document.addEventListener('mousemove', this.handleResizeMove.bind(this));
    document.addEventListener('mouseup', this.handleResizeEnd.bind(this));

    // Handle window resize
    window.addEventListener('resize', () => {
      // Ensure panel width doesn't exceed window bounds
      const maxWidth = window.innerWidth * 0.6;
      const currentWidth = this.panel.offsetWidth;
      if (currentWidth > maxWidth) {
        this.setWidth(maxWidth);
      }
    });
  }

  private startResize(e: MouseEvent): void {
    e.preventDefault();
    this.isResizing = true;
    this.startX = e.clientX;
    this.startWidth = this.panel.offsetWidth;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    this.resizeHandle.classList.add('resizing');
  }

  private handleResizeMove(e: MouseEvent): void {
    if (!this.isResizing) return;

    const deltaX = e.clientX - this.startX;
    const newWidth = Math.max(
      150, // min width
      Math.min(600, this.startWidth + deltaX) // max width
    );

    this.setWidth(newWidth);
  }

  private handleResizeEnd(): void {
    if (!this.isResizing) return;

    this.isResizing = false;

    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    this.resizeHandle.classList.remove('resizing');

    // Save width to localStorage
    this.saveWidth();
  }

  private setWidth(width: number): void {
    this.panel.style.width = `${width}px`;
  }

  private saveWidth(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, this.panel.offsetWidth.toString());
    } catch (e) {
      // Ignore storage errors
    }
  }

  private loadWidth(): void {
    try {
      const savedWidth = localStorage.getItem(this.STORAGE_KEY);
      if (savedWidth) {
        const width = parseInt(savedWidth, 10);
        if (width >= 150 && width <= 600) {
          this.setWidth(width);
        }
      }
    } catch (e) {
      // Ignore storage errors
    }
  }

  public getWidth(): number {
    return this.panel.offsetWidth;
  }

  public setWidthExplicitly(width: number): void {
    this.setWidth(Math.max(150, Math.min(600, width)));
    this.saveWidth();
  }
}

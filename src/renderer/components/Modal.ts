export interface ModalOptions {
  title: string;
  content: HTMLElement;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  width?: string;
  closeOnConfirm?: boolean; // New option to control if modal closes on confirm
}

export class Modal {
  private overlay!: HTMLElement;
  private dialog!: HTMLElement;
  private isOpen: boolean = false;
  private onCancel?: () => void;

  constructor(options: ModalOptions) {
    this.onCancel = options.onCancel;
    this.create(options);
  }

  private create(options: ModalOptions): void {
    // Overlay backdrop
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';

    // Dialog container
    this.dialog = document.createElement('div');
    this.dialog.className = 'modal-dialog';
    if (options.width) {
      this.dialog.style.width = options.width;
    }

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';

    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = options.title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', () => {
      if (options.onCancel) options.onCancel();
      this.close();
    });

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Content
    const content = document.createElement('div');
    content.className = 'modal-content';
    content.appendChild(options.content);

    // Footer (optional)
    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    if (options.onCancel || options.onConfirm) {
      if (options.onCancel) {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'modal-btn modal-btn-cancel';
        cancelBtn.textContent = options.cancelText || 'Cancel';
        cancelBtn.addEventListener('click', () => {
          if (options.onCancel) options.onCancel();
          this.close();
        });
        footer.appendChild(cancelBtn);
      }

      if (options.onConfirm) {
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'modal-btn modal-btn-confirm';
        confirmBtn.textContent = options.confirmText || 'OK';
        confirmBtn.addEventListener('click', async () => {
          if (options.onConfirm) await options.onConfirm();
          // Only close if closeOnConfirm is true or not specified (default true for backward compatibility)
          if (options.closeOnConfirm !== false) {
            this.close();
          }
        });
        footer.appendChild(confirmBtn);
      }
    }

    // Assemble
    this.dialog.appendChild(header);
    this.dialog.appendChild(content);
    if (options.onCancel || options.onConfirm) {
      this.dialog.appendChild(footer);
    }

    this.overlay.appendChild(this.dialog);

    // Close on backdrop click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        if (options.onCancel) options.onCancel();
        this.close();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.isOpen) {
      if (this.onCancel) this.onCancel();
      this.close();
    }
  };

  open(): void {
    if (this.isOpen) return;

    document.body.appendChild(this.overlay);
    this.isOpen = true;

    // Trigger animation
    requestAnimationFrame(() => {
      this.overlay.classList.add('modal-open');
      this.dialog.classList.add('modal-dialog-open');
    });

    // Focus first input if exists
    const firstInput = this.dialog.querySelector('input, button, select, textarea');
    if (firstInput) {
      (firstInput as HTMLElement).focus();
    }
  }

  close(): void {
    if (!this.isOpen) return;

    this.overlay.classList.remove('modal-open');
    this.dialog.classList.remove('modal-dialog-open');

    // Remove from DOM after animation
    setTimeout(() => {
      if (this.overlay.parentNode) {
        document.body.removeChild(this.overlay);
      }
      this.isOpen = false;
    }, 200);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    if (this.overlay.parentNode) {
      document.body.removeChild(this.overlay);
    }
  }
}

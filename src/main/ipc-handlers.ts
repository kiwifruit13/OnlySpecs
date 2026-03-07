import { ipcMain, dialog } from 'electron';
import { createRequire } from 'module';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { IPty } from 'node-pty';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pty = require('node-pty') as typeof import('node-pty');

export interface EditorData {
  id: string;
  name: string;
  content: string;
}

export interface Metadata {
  order: string[];
  nextIndex: number;
}

export interface AppConfig {
  apiKey: string;
  baseUrl: string;
  lastProjectPath: string;
}

interface NewProjectResult {
  success: boolean;
  projectPath?: string;
  error?: string;
}

const EDITORS_DIR = path.join(os.homedir(), 'Documents', 'OnlySpecs', 'editors');
const METADATA_FILE = path.join(EDITORS_DIR, 'metadata.json');
const CONFIG_DIR = path.join(os.homedir(), 'Documents', 'OnlySpecs');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  baseUrl: 'https://api.anthropic.com',
  lastProjectPath: '',
};

async function ensureConfigDir() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create config directory:', error);
  }
}

async function ensureEditorsDir() {
  try {
    await fs.mkdir(EDITORS_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create editors directory:', error);
  }
}

async function getMetadata(): Promise<Metadata> {
  await ensureEditorsDir();
  try {
    const content = await fs.readFile(METADATA_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Create default metadata if doesn't exist
    const metadata: Metadata = { order: [], nextIndex: 1 };
    await fs.writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2));
    return metadata;
  }
}

async function saveMetadata(metadata: Metadata): Promise<void> {
  await ensureEditorsDir();
  await fs.writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2));
}

async function getConfig(): Promise<AppConfig> {

  const cleanEnv = { ...process.env };
  delete cleanEnv.NODE_OPTIONS;
  delete cleanEnv.VSCODE_INSPECTOR_OPTIONS;

  // add the cleanEnv to env attribute so that any child processes spawned by the SDK will have the correct environment variables
  await ensureConfigDir();
  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    let result =  { ...DEFAULT_CONFIG, ...parsed };
    //result.env = cleanEnv;
    return result;
  } catch {
    // Create default config if doesn't exist
    await fs.writeFile(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }
}

async function saveConfig(config: AppConfig): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function registerIpcHandlers() {
  // Load all editors
  ipcMain.handle('editor:load-all', async (): Promise<EditorData[]> => {
    await ensureEditorsDir();
    const metadata = await getMetadata();
    const editors: EditorData[] = [];

    for (const id of metadata.order) {
      try {
        const filePath = path.join(EDITORS_DIR, `${id}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        const editorData = JSON.parse(content) as EditorData;
        editors.push(editorData);
      } catch (error) {
        console.error(`Failed to load editor ${id}:`, error);
      }
    }

    return editors;
  });

  // Save single editor
  ipcMain.handle('editor:save', async (_event, editorData: EditorData): Promise<void> => {
    await ensureEditorsDir();
    const filePath = path.join(EDITORS_DIR, `${editorData.id}.json`);

    // Update metadata to include this editor if not present
    const metadata = await getMetadata();
    if (!metadata.order.includes(editorData.id)) {
      metadata.order.push(editorData.id);
      await saveMetadata(metadata);
    }

    await fs.writeFile(filePath, JSON.stringify(editorData, null, 2));
  });

  // Save all editors
  ipcMain.handle('editor:save-all', async (_event, editors: EditorData[]): Promise<void> => {
    await ensureEditorsDir();
    const metadata = await getMetadata();

    // Update metadata order
    metadata.order = editors.map(e => e.id);
    metadata.nextIndex = Math.max(metadata.nextIndex, editors.length + 1);
    await saveMetadata(metadata);

    // Save each editor
    for (const editor of editors) {
      const filePath = path.join(EDITORS_DIR, `${editor.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(editor, null, 2));
    }
  });

  // Rename editor
  ipcMain.handle('editor:rename', async (_event, id: string, newName: string): Promise<void> => {
    await ensureEditorsDir();
    const filePath = path.join(EDITORS_DIR, `${id}.json`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const editorData = JSON.parse(content) as EditorData;
      editorData.name = newName;
      await fs.writeFile(filePath, JSON.stringify(editorData, null, 2));
    } catch (error) {
      console.error(`Failed to rename editor ${id}:`, error);
      throw error;
    }
  });

  // Delete editor
  ipcMain.handle('editor:delete', async (_event, id: string): Promise<void> => {
    await ensureEditorsDir();
    const filePath = path.join(EDITORS_DIR, `${id}.json`);

    try {
      await fs.unlink(filePath);

      // Remove from metadata
      const metadata = await getMetadata();
      metadata.order = metadata.order.filter(editorId => editorId !== id);
      await saveMetadata(metadata);
    } catch (error) {
      console.error(`Failed to delete editor ${id}:`, error);
      throw error;
    }
  });

  // Save editor order (after reordering)
  ipcMain.handle('editor:save-order', async (_event, order: string[]): Promise<void> => {
    const metadata = await getMetadata();
    metadata.order = order;
    await saveMetadata(metadata);
  });

  // Get next index for naming
  ipcMain.handle('editor:get-next-index', async (): Promise<number> => {
    const metadata = await getMetadata();
    return metadata.nextIndex;
  });

  // Increment and save next index
  ipcMain.handle('editor:increment-next-index', async (): Promise<number> => {
    const metadata = await getMetadata();
    const index = metadata.nextIndex;
    metadata.nextIndex++;
    await saveMetadata(metadata);
    return index;
  });

  // PTY Terminal management
  const ptySessions = new Map<string, IPty>();

  // Create a new PTY session
  ipcMain.handle('terminal:create', async (_event, sessionId: string, cwd?: string): Promise<{ pid: number }> => {
    const shell = process.env.SHELL || '/bin/bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: cwd || os.homedir(),
      env: process.env as { [key: string]: string },
    });

    ptySessions.set(sessionId, ptyProcess);

    // Send data back to renderer when PTY emits data
    ptyProcess.onData((data) => {
      _event.sender.send(`terminal:data-${sessionId}`, data);
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      _event.sender.send(`terminal:exit-${sessionId}`, { exitCode, signal });
      ptySessions.delete(sessionId);
    });

    return { pid: ptyProcess.pid };
  });

  // Write to PTY
  ipcMain.handle('terminal:write', async (_event, sessionId: string, data: string): Promise<void> => {
    const ptyProcess = ptySessions.get(sessionId);
    if (ptyProcess) {
      ptyProcess.write(data);
    }
  });

  // Resize PTY
  ipcMain.handle('terminal:resize', async (_event, sessionId: string, cols: number, rows: number): Promise<void> => {
    const ptyProcess = ptySessions.get(sessionId);
    if (ptyProcess) {
      ptyProcess.resize(cols, rows);
    }
  });

  // Kill PTY
  ipcMain.handle('terminal:kill', async (_event, sessionId: string): Promise<void> => {
    const ptyProcess = ptySessions.get(sessionId);
    if (ptyProcess) {
      ptyProcess.kill();
      ptySessions.delete(sessionId);
    }
  });

  // Cleanup all PTY sessions on app quit
  ipcMain.on('terminal:cleanup', () => {
    for (const [sessionId, ptyProcess] of ptySessions) {
      ptyProcess.kill();
    }
    ptySessions.clear();
  });

  // Clone GitHub repository and prepare for analysis
  ipcMain.handle('github:clone-and-process', async (event, repoUrl: string, summarizeSpecs: string): Promise<{ success: boolean; repoPath?: string; instructionsPath?: string; output?: string; error?: string }> => {
    const { spawn } = require('child_process');
    const { execSync } = require('child_process');
    const path = require('path');
    const os = require('os');
    const fs = require('fs/promises');

    // Helper function to send progress updates
    const sendProgress = (message: string) => {
      console.log('[GitHub Import]', message);
      if (event && event.sender) {
        try {
          event.sender.send('github:progress', message);
        } catch (err) {
          console.error('[GitHub Import] Failed to send progress:', err);
        }
      }
    };

    // Helper function to send error
    const sendError = (message: string) => {
      console.error('[GitHub Import]', message);
      sendProgress('Error: ' + message);
    };

    try {
      // Validate inputs
      if (!repoUrl || typeof repoUrl !== 'string') {
        throw new Error('Invalid repository URL');
      }

      if (!summarizeSpecs || typeof summarizeSpecs !== 'string') {
        throw new Error('Invalid summarize specs');
      }

      // Check if git is available
      sendProgress('Checking for git...');
      try {
        execSync('git --version', { encoding: 'utf8' });
      } catch (err) {
        throw new Error('Git is not installed or not accessible. Please ensure git is installed and available in your PATH.');
      }

      // Check if claude is available
      sendProgress('Checking for Claude CLI...');
      try {
        execSync('claude --version', { encoding: 'utf8' });
      } catch (err) {
        throw new Error('Claude CLI is not installed or not accessible. Please ensure Claude CLI is installed and available in your PATH.');
      }

      // Create temporary directory in user's home under OnlySpecs/tmp
      sendProgress('Creating temporary directory...');
      const baseTempDir = path.join(os.homedir(), 'Documents', 'OnlySpecs', 'tmp');
      await fs.mkdir(baseTempDir, { recursive: true });
      const tempDir = path.join(baseTempDir, `onlyspecs-${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });
      console.log('[GitHub Import] Temp dir created:', tempDir);

      // Extract repo name from URL (handle various GitHub URL formats)
      let repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'repo';
      if (!repoName) {
        throw new Error('Could not extract repository name from URL');
      }

      // Clone the repository
      sendProgress('Cloning repository from GitHub...');
      console.log(`[GitHub Import] Cloning ${repoUrl} into ${tempDir}...`);

      await new Promise<void>((resolve, reject) => {
        const cloneProcess = spawn('git', ['clone', repoUrl, repoName], {
          cwd: tempDir,
          env: { ...process.env },
          shell: false,
        });

        let cloneError = '';
        cloneProcess.stderr?.on('data', (data) => {
          const msg = data.toString();
          cloneError += msg;
          console.log('[Git Clone stderr]', msg);
          // Send to progress log - git clone outputs to stderr
          const trimmedMsg = msg.trim();
          if (trimmedMsg && !trimmedMsg.includes('Done')) {
            sendProgress(`Git: ${trimmedMsg}`);
          }
        });

        cloneProcess.stdout?.on('data', (data) => {
          const msg = data.toString();
          console.log('[Git Clone stdout]', msg);
          // Send to progress log
          const trimmedMsg = msg.trim();
          if (trimmedMsg) {
            sendProgress(`Git: ${trimmedMsg}`);
          }
        });

        cloneProcess.on('close', (code) => {
          console.log(`[Git Clone] Process exited with code ${code}`);
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Git clone failed with exit code ${code}: ${cloneError}`));
          }
        });

        cloneProcess.on('error', (error) => {
          console.error('[Git Clone] Process error:', error);
          reject(new Error(`Failed to start git process: ${error.message}`));
        });
      });

      const repoPath = path.join(tempDir, repoName);
      sendProgress(`Repository cloned to ${repoName}`);
      console.log('[GitHub Import] Repo path:', repoPath);

      // Verify repo was cloned
      try {
        await fs.access(repoPath);
      } catch (err) {
        throw new Error(`Repository directory not found after clone: ${repoPath}`);
      }

      // Create summarize_specs_instructions.md
      sendProgress('Creating specification instructions...');
      const instructionsPath = path.join(repoPath, 'summarize_specs_instructions.md');
      await fs.writeFile(instructionsPath, summarizeSpecs, 'utf-8');
      console.log('[GitHub Import] Instructions file created at:', instructionsPath);

      sendProgress('Repository ready for analysis!');
      sendProgress(`Working directory: ${repoPath}`);

      // Return success with the working directory path
      // The renderer will create a terminal and run claude CLI
      return {
        success: true,
        repoPath: repoPath,
        instructionsPath: instructionsPath,
      };

    } catch (error: any) {
      console.error('[GitHub Import] Exception:', error);
      sendError(error.message || 'Unknown error occurred');

      return {
        success: false,
        error: error.message || 'Unknown error occurred',
      };
    }
  });

  // Load app configuration
  ipcMain.handle('config:load', async (): Promise<AppConfig> => {
    return await getConfig();
  });

  // Save app configuration
  ipcMain.handle('config:save', async (_event, config: AppConfig): Promise<void> => {
    await saveConfig(config);
  });

  // Read file content
  ipcMain.handle('fs:readFile', async (_event, filePath: string): Promise<{ success: boolean; content?: string; error?: string }> => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return { success: true, content };
    } catch (error: any) {
      console.error('[FS] Error reading file:', error);
      return { success: false, error: error.message || 'Failed to read file' };
    }
  });

  // Write file content
  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await fs.writeFile(filePath, content, 'utf-8');
      return { success: true };
    } catch (error: any) {
      console.error('[FS] Error writing file:', error);
      return { success: false, error: error.message || 'Failed to write file' };
    }
  });

  // Select directory
  ipcMain.handle('fs:selectDirectory', async (): Promise<{ success: boolean; path?: string; error?: string }> => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select a folder to explore'
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'No directory selected' };
      }

      return { success: true, path: result.filePaths[0] };
    } catch (error: any) {
      console.error('[FS] Error selecting directory:', error);
      return { success: false, error: error.message || 'Failed to select directory' };
    }
  });

  // Create a new project in a selected folder
  ipcMain.handle('project:create', async (): Promise<NewProjectResult> => {
    try {
      const selectResult = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select a folder for the new project',
      });

      if (selectResult.canceled || selectResult.filePaths.length === 0) {
        return { success: false, error: 'No directory selected' };
      }

      const projectPath = selectResult.filePaths[0];

      const readmeContent = [
        '# OnlySpecs Project',
        '',
        'This project is organized by specification versions and matching implementation versions.',
        '',
        '## Structure',
        '',
        '- `specs_v0001.md`, `specs_v0002.md`, ...',
        '- `code_v0001/`, `code_v0002/`, ...',
        '',
        '## Workflow',
        '',
        '1. Read a specs file (`specs_vXXXX.md`).',
        '2. Implement the code in the corresponding `code_vXXXX/` folder.',
        '3. Create the next specs version when requirements evolve.',
        '',
      ].join('\n');

      const licenseContent = [
        'MIT License',
        '',
        'Copyright (c) 2026',
        '',
        'Permission is hereby granted, free of charge, to any person obtaining a copy',
        'of this software and associated documentation files (the "Software"), to deal',
        'in the Software without restriction, including without limitation the rights',
        'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
        'copies of the Software, and to permit persons to whom the Software is',
        'furnished to do so, subject to the following conditions:',
        '',
        'The above copyright notice and this permission notice shall be included in all',
        'copies or substantial portions of the Software.',
        '',
        'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
        'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
        'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
        'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
        'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
        'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE',
        'SOFTWARE.',
        '',
      ].join('\n');

      const specsTemplate = [
        '# Specifications v0001',
        '',
        '## Overview',
        '- Describe the product goal and target users.',
        '',
        '## Functional Requirements',
        '- FR-1:',
        '- FR-2:',
        '',
        '## Non-functional Requirements',
        '- Performance:',
        '- Reliability:',
        '- Security:',
        '',
        '## Acceptance Criteria',
        '- [ ] Criterion 1',
        '- [ ] Criterion 2',
        '',
      ].join('\n');

      await fs.writeFile(path.join(projectPath, 'README.md'), readmeContent, 'utf-8');
      await fs.writeFile(path.join(projectPath, 'LICENSE'), licenseContent, 'utf-8');
      await fs.writeFile(path.join(projectPath, 'specs_v0001.md'), specsTemplate, 'utf-8');

      return { success: true, projectPath };
    } catch (error: any) {
      console.error('[Project] Error creating project:', error);
      return { success: false, error: error.message || 'Failed to create project' };
    }
  });

  // Read directory
  ipcMain.handle('fs:readDirectory', async (_event, dirPath: string): Promise<{ success: boolean; entries?: Array<{ name: string; path: string; isDirectory: boolean }>; error?: string }> => {
    try {
      const entries: Array<{ name: string; path: string; isDirectory: boolean }> = [];

      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        // Skip hidden files and directories
        if (item.name.startsWith('.')) {
          continue;
        }

        const fullPath = path.join(dirPath, item.name);
        entries.push({
          name: item.name,
          path: fullPath,
          isDirectory: item.isDirectory()
        });
      }

      // Sort: directories first, then files, both alphabetically
      entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return { success: true, entries };
    } catch (error: any) {
      console.error('[FS] Error reading directory:', error);
      return { success: false, error: error.message || 'Failed to read directory' };
    }
  });

  // Delete file
  ipcMain.handle('fs:deleteFile', async (_event, filePath: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await fs.unlink(filePath);
      console.log('[FS] File deleted:', filePath);
      return { success: true };
    } catch (error: any) {
      console.error('[FS] Error deleting file:', error);
      return { success: false, error: error.message || 'Failed to delete file' };
    }
  });

  // Create directory
  ipcMain.handle('fs:createDirectory', async (_event, dirPath: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      console.log('[FS] Directory created:', dirPath);
      return { success: true };
    } catch (error: any) {
      console.error('[FS] Error creating directory:', error);
      return { success: false, error: error.message || 'Failed to create directory' };
    }
  });

  // Check if path exists
  ipcMain.handle('fs:exists', async (_event, path: string): Promise<{ exists: boolean }> => {
    try {
      await fs.access(path);
      return { exists: true };
    } catch {
      return { exists: false };
    }
  });

}

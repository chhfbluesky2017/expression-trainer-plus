process.env.LANG = 'zh_CN.UTF-8';
process.env.LC_ALL = 'zh_CN.UTF-8';

if (process.platform === 'win32') {
  const cp = require('child_process');
  cp.execSync('chcp 65001 >nul 2>&1');
  process.stdout.write('\u001b[39;49m');
}

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args) => {
  const output = args.map(arg => {
    if (typeof arg === 'string') {
      return Buffer.from(arg, 'utf-8').toString('utf-8');
    }
    return arg;
  });
  originalLog.apply(console, output);
};

console.warn = (...args) => {
  const output = args.map(arg => {
    if (typeof arg === 'string') {
      return Buffer.from(arg, 'utf-8').toString('utf-8');
    }
    return arg;
  });
  originalWarn.apply(console, output);
};

console.error = (...args) => {
  const output = args.map(arg => {
    if (typeof arg === 'string') {
      return Buffer.from(arg, 'utf-8').toString('utf-8');
    }
    return arg;
  });
  originalError.apply(console, output);
};

const { app, BrowserWindow, ipcMain, session, Menu, globalShortcut, clipboard, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const { initASR, feedAudio, stopRecognition } = require('./lib/asr');
const { loadLexicon, analyzeText } = require('./lib/lexicon');
const { sendFeedback, sendReport, sendPolish } = require('./lib/ai-feedback');

let mainWindow;
let settingsWindow;
let promptEditorWindow;
let ballWindow = null;
let asrReady = false;
let ollamaProcess = null;
let ollamaAutoStartDone = false;

// Custom prompt 文件路径
function getCustomPromptPath() {
  return path.join(app.getPath('userData'), 'custom-prompt.json');
}

function loadCustomPrompt() {
  const p = getCustomPromptPath();
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch(e) { return null; }
  }
  return null;
}

function saveCustomPrompt(data) {
  fs.writeFileSync(getCustomPromptPath(), JSON.stringify(data, null, 2));
}

// 设置文件路径
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  }
  return {
    provider: 'deepseek',
    apiKey: '',
    model: 'deepseek-chat',
    ollamaUrl: 'http://localhost:11434',
    customEndpoint: '',
    customModel: ''
  };
}

function saveSettings(settings) {
  const settingsPath = getSettingsPath();
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

let windowStateDebounce = null;

function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  const windowStatePath = getWindowStatePath();
  if (fs.existsSync(windowStatePath)) {
    try {
      return JSON.parse(fs.readFileSync(windowStatePath, 'utf-8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

function saveWindowState(state) {
  if (windowStateDebounce) clearTimeout(windowStateDebounce);
  windowStateDebounce = setTimeout(() => {
    const windowStatePath = getWindowStatePath();
    fs.writeFileSync(windowStatePath, JSON.stringify(state, null, 2));
  }, 300);
}

function getWindowState(states, windowName, defaults) {
  const saved = states[windowName];
  if (!saved) return defaults;
  return {
    x: (saved.x !== undefined && saved.x !== null) ? saved.x : defaults.x,
    y: (saved.y !== undefined && saved.y !== null) ? saved.y : defaults.y,
    width: (saved.width && saved.width >= defaults.minWidth) ? saved.width : defaults.width,
    height: (saved.height && saved.height >= defaults.minHeight) ? saved.height : defaults.height,
    isMaximized: saved.isMaximized || false
  };
}

function createMenu() {
  const menuTemplate = [
    {
      label: '文件',
      submenu: [
        {
          label: '保存报告',
          accelerator: 'Ctrl+S',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('save-report');
            }
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'Ctrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Shift+Ctrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'Ctrl+X', role: 'cut' },
        { label: '复制', accelerator: 'Ctrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'Ctrl+V', role: 'paste' },
        { label: '全选', accelerator: 'Ctrl+A', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '切换主题',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('toggle-theme');
            }
          }
        },
        { type: 'separator' },
        { label: '重新加载', accelerator: 'Ctrl+R', role: 'reload' },
        {
          label: '开发者工具',
          accelerator: 'Ctrl+Shift+I',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.openDevTools();
            }
          }
        }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '最大化', role: 'maximize' },
        { type: 'separator' },
        { label: '关闭', role: 'close' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              title: '关于',
              message: '表达训练器',
              detail: '版本: 1.0.0\n\n一款帮助提升表达能力的AI训练工具'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

function createMainWindow() {
  const allStates = loadWindowState();
  const defaults = { x: null, y: null, width: 1200, height: 800, minWidth: 800, minHeight: 600 };
  const state = getWindowState(allStates, 'mainWindow', defaults);

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    backgroundColor: '#000000',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.setFullScreenable(true);

  if (state.isMaximized) {
    mainWindow.maximize();
  }

  const updateMainWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const bounds = mainWindow.getBounds();
    const newState = { ...allStates };
    newState.mainWindow = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: mainWindow.isMaximized()
    };
    saveWindowState(newState);
  };

  mainWindow.on('resize', updateMainWindowState);
  mainWindow.on('move', updateMainWindowState);
  mainWindow.on('maximize', updateMainWindowState);
  mainWindow.on('unmaximize', updateMainWindowState);

  mainWindow.on('closed', () => {
    updateMainWindowState();
    mainWindow = null;
  });
}

function createPromptEditorWindow() {
  if (promptEditorWindow) {
    promptEditorWindow.focus();
    return;
  }

  const allStates = loadWindowState();
  const defaults = { x: null, y: null, width: 720, height: 700, minWidth: 600, minHeight: 500 };
  const state = getWindowState(allStates, 'promptEditorWindow', defaults);

  promptEditorWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    resizable: true,
    backgroundColor: '#1a1a1a',
    titleBarStyle: 'hiddenInset',
    parent: mainWindow,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  promptEditorWindow.setMenuBarVisibility(false);

  promptEditorWindow.loadFile(path.join(__dirname, 'src', 'prompt-editor.html'));

  const updatePromptEditorState = () => {
    if (!promptEditorWindow || promptEditorWindow.isDestroyed()) return;
    const bounds = promptEditorWindow.getBounds();
    const newState = { ...allStates };
    newState.promptEditorWindow = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: promptEditorWindow.isMaximized()
    };
    saveWindowState(newState);
  };

  promptEditorWindow.on('resize', updatePromptEditorState);
  promptEditorWindow.on('move', updatePromptEditorState);

  promptEditorWindow.on('closed', () => {
    updatePromptEditorState();
    promptEditorWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: false,
    backgroundColor: '#1a1a1a',
    titleBarStyle: 'hiddenInset',
    parent: mainWindow,
    modal: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.setMenuBarVisibility(false);

  settingsWindow.loadFile(path.join(__dirname, 'src', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ===== 浮动小球 =====
function getBallPositionPath() {
  return path.join(app.getPath('userData'), 'ball-position.json');
}

function saveBallPosition(x, y) {
  try {
    fs.writeFileSync(getBallPositionPath(), JSON.stringify({ x, y }));
  } catch (e) {}
}

function loadBallPosition() {
  try {
    return JSON.parse(fs.readFileSync(getBallPositionPath(), 'utf-8'));
  } catch (e) {
    return null;
  }
}

function createBallWindow() {
  if (ballWindow) {
    ballWindow.show();
    return;
  }

  let x, y;
  const saved = loadBallPosition();
  if (saved) {
    x = saved.x;
    y = saved.y;
  } else {
    const workArea = screen.getPrimaryDisplay().workArea;
    x = workArea.x + workArea.width - 250;
    y = workArea.y + 100;
  }

  ballWindow = new BrowserWindow({
    x, y,
    width: 240,
    height: 320,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  ballWindow.setIgnoreMouseEvents(true, { forward: true });
  ballWindow.setAlwaysOnTop(true, 'screen-saver');
  ballWindow.loadFile(path.join(__dirname, 'src', 'voice-ball.html'));

  ballWindow.on('moved', () => {
    if (ballWindow) {
      const [px, py] = ballWindow.getPosition();
      saveBallPosition(px, py);
    }
  });

  ballWindow.on('closed', () => {
    ballWindow = null;
  });

  // 注册全局快捷键
  globalShortcut.register('Alt+S', () => {
    if (ballWindow) {
      ballWindow.webContents.send('toggle-recording');
    }
  });
}

function destroyBallWindow() {
  if (ballWindow) {
    globalShortcut.unregister('Alt+S');
    ballWindow.destroy();
    ballWindow = null;
  }
}

async function checkOllamaStatus(ollamaUrl = 'http://localhost:11434') {
  try {
    const url = ollamaUrl.replace(/\/$/, '') + '/api/tags';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(url, { 
      signal: controller.signal,
      cache: 'no-cache'
    });
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.log(`[Ollama] 检测失败，HTTP状态: ${response.status}`);
      return false;
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.log(`[Ollama] 检测失败，Content-Type: ${contentType}`);
      return false;
    }
    
    const data = await response.json();
    if (!data || !Array.isArray(data.models)) {
      console.log(`[Ollama] 检测失败，响应数据: ${JSON.stringify(data)}`);
      return false;
    }
    
    console.log(`[Ollama] 检测成功，模型数量: ${data.models.length}`);
    return true;
  } catch (e) {
    console.log(`[Ollama] 检测异常: ${e.message}`);
    return false;
  }
}

function getOllamaPath() {
  if (process.platform === 'win32') {
    const paths = [
      path.join(process.env.ProgramFiles, 'Ollama', 'ollama.exe'),
      path.join(process.env['ProgramFiles(x86)'], 'Ollama', 'ollama.exe'),
      path.join(process.env.LocalAppData, 'Programs', 'Ollama', 'ollama.exe')
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    return 'ollama';
  }
  return 'ollama';
}

async function startOllama() {
  if (ollamaProcess) {
    return { success: true, message: 'Ollama 已在运行' };
  }

  const ollamaPath = getOllamaPath();
  try {
    const isRunning = await checkOllamaStatus();
    if (isRunning) {
      return { success: true, message: 'Ollama 已在运行' };
    }

    console.log(`[Ollama] 尝试启动，路径: ${ollamaPath}`);

    const ollamaModelsPath = process.env.OLLAMA_MODELS || path.join(app.getPath('home'), '.ollama', 'models');
    const env = {
      ...process.env,
      OLLAMA_MODELS: ollamaModelsPath
    };
    console.log(`[Ollama] 模型路径: ${env.OLLAMA_MODELS}`);

    if (process.platform === 'win32') {
      ollamaProcess = spawn(ollamaPath, ['serve'], {
        windowsHide: true,
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'],
        env: env,
        shell: true,
        cwd: path.dirname(ollamaPath)
      });
    } else {
      ollamaProcess = spawn(ollamaPath, ['serve'], {
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'],
        env: env,
        shell: false
      });
    }

    ollamaProcess.on('exit', (code, signal) => {
      console.log(`[Ollama] 进程退出，代码: ${code}, 信号: ${signal}`);
      ollamaProcess = null;
    });

    ollamaProcess.on('error', (err) => {
      console.error(`[Ollama] 启动错误: ${err.message}`);
      ollamaProcess = null;
    });

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await checkOllamaStatus()) {
        return { success: true, message: 'Ollama 启动成功' };
      }
    }

    return { success: false, message: 'Ollama 启动超时，请手动启动' };
  } catch (error) {
    console.error(`[Ollama] 启动异常: ${error.message}`);
    return { success: false, message: `启动失败: ${error.message}` };
  }
}

async function autoStartOllama() {
  if (ollamaAutoStartDone) return;
  ollamaAutoStartDone = true;

  const settings = loadSettings();
  if (settings.provider !== 'ollama') return;

  try {
    const isRunning = await checkOllamaStatus(settings.ollamaUrl);
    if (!isRunning) {
      console.log('[Ollama] 未运行，尝试自动启动...');
      const result = await startOllama();
      console.log(`[Ollama] ${result.message}`);
    }
  } catch (e) {
    console.error('[Ollama] 自动启动失败:', e.message);
  }
}

// App lifecycle
app.whenReady().then(() => {
  // 允许麦克风权限
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  // 加载词库
  loadLexicon();

  createMenu();

  createMainWindow();

  autoStartOllama();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// 设置相关
ipcMain.handle('get-settings', () => {
  return loadSettings();
});

ipcMain.handle('save-settings', (event, settings) => {
  saveSettings(settings);
  return { success: true };
});

ipcMain.handle('open-settings', () => {
  createSettingsWindow();
});

ipcMain.handle('get-ollama-models', async (event, ollamaUrl) => {
  const url = (ollamaUrl || 'http://localhost:11434').replace(/\/$/, '') + '/api/tags';
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    const models = (data.models || []).map(m => ({
      value: m.name,
      label: m.name
    }));
    
    return { success: true, models };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-ollama-status', async (event, ollamaUrl) => {
  const isRunning = await checkOllamaStatus(ollamaUrl);
  return { running: isRunning };
});

ipcMain.handle('start-ollama', async () => {
  return await startOllama();
});

// Prompt编辑器相关
ipcMain.handle('open-prompt-editor', () => {
  createPromptEditorWindow();
});

ipcMain.handle('get-custom-prompt', () => {
  return loadCustomPrompt();
});

ipcMain.handle('save-custom-prompt', (event, data) => {
  saveCustomPrompt(data);
  return { success: true };
});

ipcMain.handle('close-current-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

// 语音识别相关 - Web Audio方案
ipcMain.handle('init-asr', async () => {
  try {
    await initASR();
    asrReady = true;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

let audioProcessing = false;

ipcMain.handle('feed-audio', (event, samplesArray) => {
  if (!asrReady || audioProcessing) return null;
  
  try {
    audioProcessing = true;
    const samples = new Float32Array(samplesArray);
    const result = feedAudio(samples);
    return result;
  } finally {
    audioProcessing = false;
  }
});

ipcMain.handle('stop-asr', () => {
  const finalText = stopRecognition();
  asrReady = false;
  return { success: true, finalText };
});

// 词库分析
ipcMain.handle('analyze-text', (event, text) => {
  return analyzeText(text);
});

// 文件保存
ipcMain.handle('save-file', async (event, content, filename) => {
  const { dialog } = require('electron');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存报告',
    defaultPath: path.join(app.getPath('desktop'), filename),
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  });

  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

// AI反馈（传入customPrompt）
ipcMain.handle('get-realtime-feedback', async (event, text) => {
  const settings = loadSettings();
  const customPrompt = loadCustomPrompt();
  try {
    const feedback = await sendFeedback(text, settings, customPrompt);
    return { success: true, feedback };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-final-report', async (event, { fullText, stats }) => {
  const settings = loadSettings();
  const customPrompt = loadCustomPrompt();
  try {
    const report = await sendReport(fullText, stats, settings, customPrompt);
    return { success: true, report };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-polish', async (event, text) => {
  const settings = loadSettings();
  try {
    const polished = await sendPolish(text, settings);
    return { success: true, polished };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ===== 浮动小球 IPC =====
ipcMain.handle('enter-voice-mode', () => {
  if (mainWindow) mainWindow.hide();
  createBallWindow();
  return { success: true };
});

ipcMain.on('move-ball', (event, dx, dy) => {
  if (!ballWindow) return;
  const [x, y] = ballWindow.getPosition();
  const [w, h] = ballWindow.getSize();
  const newX = x + dx;
  const newY = y + dy;
  const display = screen.getDisplayNearestPoint({ x: newX, y: newY });
  const b = display.workArea;
  const cx = Math.max(b.x, Math.min(newX, b.x + b.width - w));
  const cy = Math.max(b.y, Math.min(newY, b.y + b.height - h));
  ballWindow.setPosition(cx, cy);
});

ipcMain.on('set-ignore-mouse-events', (event, { ignore, forward }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setIgnoreMouseEvents(ignore, { forward: !!forward });
  }
});

ipcMain.handle('type-to-window', async (event, text, deleteCount) => {
  if (!text) return { success: false };
  try {
    const oldClip = clipboard.readText();
    clipboard.writeText(text);
    await new Promise(r => setTimeout(r, 30));

    // 构建命令：先退格删除上次内容（如有），再粘贴新内容
    let sendKeysCmd = '';
    if (deleteCount && deleteCount > 0) {
      let remaining = deleteCount;
      while (remaining > 0) {
        const batch = Math.min(remaining, 50);
        sendKeysCmd += `[System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE ${batch}}');`;
        remaining -= batch;
      }
    }
    sendKeysCmd += `[System.Windows.Forms.SendKeys]::SendWait('^v');`;

    await new Promise((resolve, reject) => {
      exec(
        `powershell -NoProfile -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; ${sendKeysCmd}"`,
        { timeout: 5000, windowsHide: true },
        (err) => err ? reject(err) : resolve()
      );
    });
    setTimeout(() => { clipboard.writeText(oldClip); }, 300);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ball-switch-mode', (event, mode) => {
  globalShortcut.unregister('Alt+S');
  if (ballWindow) ballWindow.hide();
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('switch-mode', mode);
  }
  return { success: true };
});

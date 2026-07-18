const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  getOllamaModels: (ollamaUrl) => ipcRenderer.invoke('get-ollama-models', ollamaUrl),
  checkOllamaStatus: (ollamaUrl) => ipcRenderer.invoke('check-ollama-status', ollamaUrl),
  startOllama: () => ipcRenderer.invoke('start-ollama'),

  // Prompt编辑器
  openPromptEditor: () => ipcRenderer.invoke('open-prompt-editor'),
  getCustomPrompt: () => ipcRenderer.invoke('get-custom-prompt'),
  saveCustomPrompt: (data) => ipcRenderer.invoke('save-custom-prompt', data),
  closeWindow: () => ipcRenderer.invoke('close-current-window'),

  // 语音识别 - 使用 Web Audio 方案
  initASR: () => ipcRenderer.invoke('init-asr'),
  feedAudio: (samples) => ipcRenderer.invoke('feed-audio', Array.from(samples)),
  stopASR: () => ipcRenderer.invoke('stop-asr'),
  onASRResult: (callback) => {
    ipcRenderer.on('asr-result', (event, data) => callback(data));
  },
  removeASRListener: () => {
    ipcRenderer.removeAllListeners('asr-result');
  },

  // 词库分析
  analyzeText: (text) => ipcRenderer.invoke('analyze-text', text),

  // AI反馈
  getRealtimeFeedback: (text) => ipcRenderer.invoke('get-realtime-feedback', text),
  getFinalReport: (data) => ipcRenderer.invoke('get-final-report', data),
  getPolish: (text) => ipcRenderer.invoke('get-polish', text),

  // 文件保存
  saveFile: (content, filename) => ipcRenderer.invoke('save-file', content, filename),

  // 浮动小球
  enterVoiceMode: () => ipcRenderer.invoke('enter-voice-mode'),
  moveBall: (dx, dy) => ipcRenderer.send('move-ball', dx, dy),
  typeToWindow: (text, deleteCount) => ipcRenderer.invoke('type-to-window', text, deleteCount || 0),
  ballSwitchMode: (mode) => ipcRenderer.invoke('ball-switch-mode', mode),
  setIgnoreMouseEvents: (ignore, forward) => ipcRenderer.send('set-ignore-mouse-events', { ignore, forward }),
  onToggleRecording: (callback) => {
    ipcRenderer.on('toggle-recording', () => callback());
  },
  onSwitchMode: (callback) => {
    ipcRenderer.on('switch-mode', (event, mode) => callback(mode));
  },
});

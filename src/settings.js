// 设置页逻辑

const PROVIDER_CONFIG = {
  openai: {
    needsKey: true,
    keyHint: '在 platform.openai.com 获取',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini（推荐）' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
    ]
  },
  deepseek: {
    needsKey: true,
    keyHint: '在 platform.deepseek.com 获取',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek Chat（推荐）' },
      { value: 'deepseek-coder', label: 'DeepSeek Coder' }
    ]
  },
  ollama: {
    needsKey: false,
    models: []
  },
  custom: {
    needsKey: true,
    keyHint: '自定义 API Key',
    models: []
  }
};

class SettingsPage {
  constructor() {
    this.providerSelect = document.getElementById('provider');
    this.apikeyInput = document.getElementById('apikey');
    this.apikeyHint = document.getElementById('apikey-hint');
    this.modelSelect = document.getElementById('model');
    this.modelHint = document.getElementById('model-hint');
    this.ollamaUrlInput = document.getElementById('ollama-url');
    this.customEndpointInput = document.getElementById('custom-endpoint');
    this.customModelInput = document.getElementById('custom-model');
    this.btnSave = document.getElementById('btn-save');
    this.saveSuccess = document.getElementById('save-success');

    this.groupApikey = document.getElementById('group-apikey');
    this.groupOllama = document.getElementById('group-ollama');
    this.groupCustom = document.getElementById('group-custom');
    this.groupCustomModel = document.getElementById('group-custom-model');

    this.ollamaStatusIcon = document.getElementById('ollama-status-icon');
    this.ollamaStatusText = document.getElementById('ollama-status-text');
    this.btnStartOllama = document.getElementById('btn-start-ollama');

    this.bindEvents();
    this.loadSettings();
  }

  bindEvents() {
    this.providerSelect.addEventListener('change', () => this.onProviderChange());
    this.btnSave.addEventListener('click', () => this.save());
    this.ollamaUrlInput.addEventListener('change', () => this.checkOllamaStatus());
    this.btnStartOllama.addEventListener('click', () => this.startOllama());
  }

  async loadSettings() {
    const settings = await window.api.getSettings();

    this.providerSelect.value = settings.provider || 'deepseek';
    this.apikeyInput.value = settings.apiKey || '';
    this.ollamaUrlInput.value = settings.ollamaUrl || 'http://localhost:11434';
    this.customEndpointInput.value = settings.customEndpoint || '';
    this.customModelInput.value = settings.customModel || '';

    await this.onProviderChange();

    // 设置模型（在onProviderChange填充选项后）
    if (settings.model) {
      this.modelSelect.value = settings.model;
    }
  }

  async onProviderChange() {
    const provider = this.providerSelect.value;
    const config = PROVIDER_CONFIG[provider];

    // 显示/隐藏条件字段
    this.groupApikey.classList.toggle('visible', config.needsKey);
    this.groupOllama.classList.toggle('visible', provider === 'ollama');
    this.groupCustom.classList.toggle('visible', provider === 'custom');
    this.groupCustomModel.classList.toggle('visible', provider === 'custom');

    if (provider === 'ollama') {
      this.checkOllamaStatus();
    }

    // 更新key提示
    if (config.keyHint) {
      this.apikeyHint.textContent = config.keyHint;
    }

    // 填充模型列表
    this.modelSelect.innerHTML = '';
    
    if (provider === 'ollama') {
      const ollamaUrl = this.ollamaUrlInput.value || 'http://localhost:11434';
      this.modelSelect.innerHTML = '<option value="">加载中...</option>';
      this.modelSelect.parentElement.style.display = '';
      
      const result = await window.api.getOllamaModels(ollamaUrl);
      
      this.modelSelect.innerHTML = '';
      if (result.success && result.models.length > 0) {
        result.models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.value;
          opt.textContent = m.label;
          this.modelSelect.appendChild(opt);
        });
        this.modelHint.textContent = `共 ${result.models.length} 个本地模型`;
      } else {
        const fallbackModels = [
          { value: 'qwen2.5:7b', label: 'Qwen 2.5 7B（推荐）' },
          { value: 'llama3.1:8b', label: 'Llama 3.1 8B' },
          { value: 'mistral:7b', label: 'Mistral 7B' }
        ];
        fallbackModels.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.value;
          opt.textContent = m.label;
          this.modelSelect.appendChild(opt);
        });
        this.modelHint.textContent = '连接Ollama失败，显示预设模型';
      }
    } else if (config.models.length > 0) {
      config.models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.value;
        opt.textContent = m.label;
        this.modelSelect.appendChild(opt);
      });
      this.modelHint.textContent = '';
      this.modelSelect.parentElement.style.display = '';
    } else {
      this.modelSelect.parentElement.style.display = 'none';
    }
  }

  async save() {
    const settings = {
      provider: this.providerSelect.value,
      apiKey: this.apikeyInput.value.trim(),
      model: this.modelSelect.value,
      ollamaUrl: this.ollamaUrlInput.value.trim(),
      customEndpoint: this.customEndpointInput.value.trim(),
      customModel: this.customModelInput.value.trim()
    };

    await window.api.saveSettings(settings);

    // 显示保存成功，然后自动关闭窗口
    this.saveSuccess.classList.add('show');
    setTimeout(() => {
      window.close();
    }, 800);
  }

  async checkOllamaStatus() {
    const ollamaUrl = this.ollamaUrlInput.value || 'http://localhost:11434';
    this.ollamaStatusIcon.textContent = '⏳';
    this.ollamaStatusText.textContent = '检测中...';
    this.ollamaStatusText.parentElement.className = 'ollama-status';
    this.btnStartOllama.style.display = 'none';

    const result = await window.api.checkOllamaStatus(ollamaUrl);
    if (result.running) {
      this.ollamaStatusIcon.textContent = '✓';
      this.ollamaStatusText.textContent = 'Ollama 已运行';
      this.ollamaStatusText.parentElement.className = 'ollama-status running';
    } else {
      this.ollamaStatusIcon.textContent = '⏳';
      this.ollamaStatusText.textContent = 'Ollama 未运行，正在自动启动...';
      await this.startOllama();
    }
  }

  async startOllama() {
    this.btnStartOllama.disabled = true;
    this.btnStartOllama.textContent = '启动中...';
    this.ollamaStatusIcon.textContent = '⏳';
    this.ollamaStatusText.textContent = '正在启动 Ollama...';

    const result = await window.api.startOllama();
    if (result.success) {
      this.ollamaStatusIcon.textContent = '✓';
      this.ollamaStatusText.textContent = 'Ollama 已运行';
      this.ollamaStatusText.parentElement.className = 'ollama-status running';
      this.btnStartOllama.style.display = 'none';
      await this.onProviderChange();
    } else {
      this.ollamaStatusIcon.textContent = '✕';
      this.ollamaStatusText.textContent = result.message;
      this.ollamaStatusText.parentElement.className = 'ollama-status stopped';
      this.btnStartOllama.disabled = false;
      this.btnStartOllama.textContent = '启动 Ollama';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SettingsPage();
});

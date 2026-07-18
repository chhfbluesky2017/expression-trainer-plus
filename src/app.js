class ExpressionTrainer {
  constructor() {
    this.isRecording = false;
    this.isPaused = false;
    this.startTime = null;
    this.pausedTime = 0;
    this.pauseStart = null;
    this.timerInterval = null;
    this.fullText = '';
    this.sentences = [];
    this.stats = { fillers: 0, hedges: 0, vagueWords: 0, totalWords: 0, duration: 0 };
    this.lastFeedbackText = '';
    this.lastReport = '';
    this.asrReady = false;
    this.audioBuffer = [];
    this.bufferProcessInterval = null;
    this.currentMode = 'train';

    this.initElements();
    this.bindEvents();
    this.initTheme();

    window.api.onSwitchMode((mode) => {
      this.currentMode = mode;
      this.modeTrain.classList.toggle('active', mode === 'train');
      this.modePolish.classList.toggle('active', mode === 'polish');
      this.modeVoice.classList.toggle('active', mode === 'voice');
      document.querySelector('.layout').classList.remove('hidden');
      this.clearAll();
    });

    this.checkOllamaStatus();
  }

  initTheme() {
    const savedTheme = localStorage.getItem('expression-trainer-theme');
    const isDark = savedTheme === 'dark';
    if (isDark) {
      document.body.classList.add('dark');
      this.btnTheme.textContent = '☀️';
    } else {
      document.body.classList.remove('dark');
      this.btnTheme.textContent = '🌙';
    }
  }

  toggleTheme() {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('expression-trainer-theme', isDark ? 'dark' : 'light');
    this.btnTheme.textContent = isDark ? '☀️' : '🌙';
  }

  initElements() {
    this.btnStart = document.getElementById('btn-start');
    this.btnPaste = document.getElementById('btn-paste');
    this.btnPause = document.getElementById('btn-pause');
    this.btnResume = document.getElementById('btn-resume');
    this.btnStop = document.getElementById('btn-stop');
    this.btnReport = document.getElementById('btn-report');
    this.btnSettings = document.getElementById('btn-settings');
    this.btnTheme = document.getElementById('btn-theme');
    this.btnCloseReport = document.getElementById('btn-close-report');
    this.btnClosePaste = document.getElementById('btn-close-paste');
    this.btnAnalyzePaste = document.getElementById('btn-analyze-paste');
    this.btnCopyText = document.getElementById('btn-copy-text');
    this.btnSaveText = document.getElementById('btn-save-text');
    this.btnClear = document.getElementById('btn-clear');
    this.btnCopyReport = document.getElementById('btn-copy-report');
    this.pasteModal = document.getElementById('paste-modal');
    this.pasteTextarea = document.getElementById('paste-textarea');
    this.timer = document.getElementById('timer');
    this.subtitleScroll = document.getElementById('subtitle-scroll');
    this.subtitleContainer = document.getElementById('subtitle-container');
    this.feedbackContent = document.getElementById('feedback-content');
    this.reportModal = document.getElementById('report-modal');
    this.reportBody = document.getElementById('report-body');
    this.statFillers = document.getElementById('stat-fillers');
    this.statHedges = document.getElementById('stat-hedges');
    this.statVague = document.getElementById('stat-vague');
    this.statDensity = document.getElementById('stat-density');

    this.modeTrain = document.getElementById('mode-train');
    this.modePolish = document.getElementById('mode-polish');
    this.modeVoice = document.getElementById('mode-voice');

    this.ollamaStatusBar = document.getElementById('ollama-status-bar');
    this.ollamaStatusIcon = document.getElementById('ollama-status-icon');
    this.ollamaStatusText = document.getElementById('ollama-status-text');
    this.btnStartOllama = document.getElementById('btn-start-ollama');
  }

  bindEvents() {
    this.btnStart.addEventListener('click', () => this.startRecording());
    this.btnPaste.addEventListener('click', () => this.openPasteModal());
    this.btnPause.addEventListener('click', () => this.pauseRecording());
    this.btnResume.addEventListener('click', () => this.resumeRecording());
    this.btnStop.addEventListener('click', () => this.stopRecording());
    this.btnReport.addEventListener('click', () => this.generateReport());
    this.btnSettings.addEventListener('click', () => window.api.openSettings());
    document.getElementById('btn-prompt-editor').addEventListener('click', () => window.api.openPromptEditor());
    this.btnTheme.addEventListener('click', () => this.toggleTheme());
    this.btnCloseReport.addEventListener('click', () => this.reportModal.classList.add('hidden'));
    this.btnCopyReport.addEventListener('click', () => {
      const reportText = this.reportBody.innerText;
      navigator.clipboard.writeText(reportText).then(() => {
        this.btnCopyReport.textContent = '✅ 已复制';
        setTimeout(() => { this.btnCopyReport.textContent = '📋 复制全文'; }, 2000);
      });
    });
    this.btnClosePaste.addEventListener('click', () => this.pasteModal.classList.add('hidden'));
    this.btnAnalyzePaste.addEventListener('click', () => this.analyzePastedText());
    this.btnCopyText.addEventListener('click', () => this.copyOriginalText());
    this.btnSaveText.addEventListener('click', () => this.saveOriginalText());
    this.btnClear.addEventListener('click', () => this.clearAll());

    this.modeTrain.addEventListener('click', () => this.switchMode('train'));
    this.modePolish.addEventListener('click', () => this.switchMode('polish'));
    this.modeVoice.addEventListener('click', () => this.switchMode('voice'));

    this.btnStartOllama.addEventListener('click', () => this.startOllama());

    window.addEventListener('keydown', (e) => {
      if (e.altKey && e.key === 's') {
        e.preventDefault();
        if (this.currentMode === 'voice') return;
        if (!this.isRecording) {
          this.startRecording();
        } else {
          this.stopRecording();
        }
      }
    });
  }

  switchMode(mode) {
    if (this.isRecording) {
      this.stopRecording();
    }

    this.currentMode = mode;

    this.modeTrain.classList.remove('active');
    this.modePolish.classList.remove('active');
    this.modeVoice.classList.remove('active');

    if (mode === 'voice') {
      this.modeVoice.classList.add('active');
      window.api.enterVoiceMode();
      return;
    }

    document.querySelector('.layout').classList.remove('hidden');

    if (mode === 'train') {
      this.modeTrain.classList.add('active');
    } else if (mode === 'polish') {
      this.modePolish.classList.add('active');
    }

    this.clearAll();
  }

  async startRecording() {
    const initResult = await window.api.initASR();
    if (!initResult.success) {
      this.showError(`语音识别启动失败: ${initResult.error}`);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(stream);
      this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.audioProcessor.onaudioprocess = (e) => {
        if (!this.isRecording || this.isPaused) return;
        const samples = e.inputBuffer.getChannelData(0);
        this.audioBuffer.push(...samples);
      };
      source.connect(this.audioProcessor);
      this.audioProcessor.connect(this.audioContext.destination);
      this.mediaStream = stream;

      this.bufferProcessInterval = setInterval(() => {
        if (!this.isRecording || this.isPaused || this.audioBuffer.length === 0) return;
        const chunk = this.audioBuffer.splice(0, 8192);
        window.api.feedAudio(chunk).then(result => {
          if (result) this.handleASRResult(result);
        }).catch(() => {});
      }, 100);
    } catch (err) {
      this.showError(`麦克风访问失败: ${err.message}`);
      return;
    }

    this.isRecording = true;
    this.isPaused = false;
    this.startTime = Date.now();
    this.pausedTime = 0;
    this.fullText = '';
    this.sentences = [];
    this.resetStats();
    this.subtitleContainer.innerHTML = '';

    this.btnStart.classList.add('hidden');
    this.btnPause.classList.remove('hidden');
    this.btnStop.classList.remove('hidden');
    this.btnReport.classList.add('hidden');
    this.btnResume.classList.add('hidden');
    this.timer.classList.add('active');

    this.timerInterval = setInterval(() => this.updateTimer(), 1000);
  }

  pauseRecording() {
    this.isPaused = true;
    this.pauseStart = Date.now();
    this.btnPause.classList.add('hidden');
    this.btnResume.classList.remove('hidden');
    this.timer.classList.remove('active');
  }

  resumeRecording() {
    this.isPaused = false;
    this.pausedTime += Date.now() - this.pauseStart;
    this.pauseStart = null;
    this.btnResume.classList.add('hidden');
    this.btnPause.classList.remove('hidden');
    this.timer.classList.add('active');
  }

  async stopRecording() {
    if (this.bufferProcessInterval) { clearInterval(this.bufferProcessInterval); this.bufferProcessInterval = null; }
    this.audioBuffer = [];
    if (this.audioProcessor) { this.audioProcessor.disconnect(); this.audioProcessor = null; }
    if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
    if (this.mediaStream) { this.mediaStream.getTracks().forEach(t => t.stop()); this.mediaStream = null; }
    await window.api.stopASR();
    this.asrReady = false;
    this.isRecording = false;
    this.isPaused = false;

    clearInterval(this.timerInterval);
    let totalPaused = this.pausedTime;
    if (this.pauseStart) totalPaused += Date.now() - this.pauseStart;
    this.stats.duration = Math.floor((Date.now() - this.startTime - totalPaused) / 1000);

    this.btnStop.classList.add('hidden');
    this.btnPause.classList.add('hidden');
    this.btnResume.classList.add('hidden');
    this.btnStart.classList.remove('hidden');
    this.timer.classList.remove('active');

    if (this.fullText.trim()) {
      this.btnReport.classList.remove('hidden');
      this.btnCopyText.classList.remove('hidden');
      this.btnSaveText.classList.remove('hidden');
      this.btnClear.classList.remove('hidden');
    }

    if (this.currentMode === 'polish' && this.fullText.trim()) {
      this.requestPolish();
    }
  }

  handleASRResult({ text, isFinal }) {
    if (isFinal) {
      this.sentences.push(text);
      this.fullText += text;

      if (this.currentMode === 'train') {
        this.analyzeCurrentSentence(text);
        if (this.fullText.length - this.lastFeedbackText.length >= 30) {
          this.requestRealtimeFeedback();
        }
      }
    }
    this.renderSubtitle(text, isFinal);
  }

  renderSubtitle(currentText, isFinal) {
    if (isFinal) {
      const interim = this.subtitleContainer.querySelector('.interim-line');
      if (interim) interim.remove();

      this.subtitleContainer.querySelectorAll('.subtitle-line:not(.old)').forEach(el => {
        el.classList.add('old');
      });

      const line = document.createElement('div');
      line.className = 'subtitle-line';
      if (this.currentMode === 'train') {
        line.innerHTML = this.highlightText(currentText);
      } else {
        line.textContent = currentText;
      }
      this.subtitleContainer.appendChild(line);
    } else {
      let interim = this.subtitleContainer.querySelector('.interim-line');
      if (!interim) {
        interim = document.createElement('div');
        interim.className = 'subtitle-line interim-line';
        this.subtitleContainer.appendChild(interim);
      }
      interim.textContent = currentText;
    }

    this.subtitleScroll.scrollTop = this.subtitleScroll.scrollHeight;
  }

  highlightText(text) {
    let result = text;
    const vagueWords = ['开心','难过','害怕','生气','不舒服','很好','很多','很快','很大','很小','好看','不好','喜欢','讨厌','觉得','想想'];
    vagueWords.forEach(w => {
      result = result.replace(new RegExp(w, 'g'), `<span class="vague">${w}</span>`);
    });
    const fillerPatterns = /(嗯|啊|呃|额|那个|就是|然后|这个|对吧|是吧|反正|基本上)/g;
    result = result.replace(fillerPatterns, '<span class="filler">$1</span>');
    const hedgePatterns = /(可能|也许|大概|应该|我觉得|好像|似乎|或许|不一定|差不多|感觉)/g;
    result = result.replace(hedgePatterns, '<span class="hedge">$1</span>');
    return result;
  }

  async analyzeCurrentSentence(text) {
    const analysis = await window.api.analyzeText(text);
    if (analysis) {
      this.stats.fillers += analysis.fillers.length;
      this.stats.hedges += analysis.hedges.length;
      this.stats.vagueWords += analysis.vagueWords.length;
      this.stats.totalWords += analysis.totalWords;
      this.updateStatsDisplay();
      if (analysis.vagueWords && analysis.vagueWords.length > 0) {
        analysis.vagueWords.forEach(item => {
          const alts = item.alternatives.slice(0, 3).join(' / ');
          this.addFeedbackItem(`「${item.word}」→ ${alts}`, 'vague');
        });
      }
      if (analysis.fillers && analysis.fillers.length >= 2) {
        const uniqueFillers = [...new Set(analysis.fillers.map(f => f.word))].slice(0, 3);
        this.addFeedbackItem(`填充词：${uniqueFillers.join('、')}——试试停顿`, 'filler');
      }
      if (analysis.hedges && analysis.hedges.length >= 1) {
        const uniqueHedges = [...new Set(analysis.hedges.map(h => h.word))].slice(0, 2);
        this.addFeedbackItem(`「${uniqueHedges.join('」「')}」→ 直接说`, 'hedge');
      }
    }
  }

  updateStatsDisplay() {
    this.statFillers.textContent = this.stats.fillers;
    this.statHedges.textContent = this.stats.hedges;
    this.statVague.textContent = this.stats.vagueWords;
    if (this.stats.totalWords > 0) {
      const density = ((this.stats.totalWords - this.stats.fillers - this.stats.hedges) / this.stats.totalWords * 100).toFixed(0);
      this.statDensity.textContent = density + '%';
    }
  }

  async requestRealtimeFeedback() {
    this.lastFeedbackText = this.fullText;
    const result = await window.api.getRealtimeFeedback(this.fullText);
    if (result.success && result.feedback) {
      const lines = result.feedback.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        const type = this.classifyFeedback(line.trim());
        this.addFeedbackItem(line.trim(), type);
      });
    }
  }

  async requestPolish() {
    const result = await window.api.getPolish(this.fullText);
    if (result.success && result.polished) {
      const polishedText = result.polished;
      this.addFeedbackItem('✨ 润色完成', 'good');

      const line = document.createElement('div');
      line.className = 'subtitle-line';
      line.style.background = 'linear-gradient(135deg, rgba(229,0,126,0.1) 0%, rgba(255,107,157,0.1) 100%)';
      line.style.borderLeft = '3px solid var(--accent)';
      line.style.paddingLeft = '12px';
      line.style.marginTop = '8px';
      line.innerHTML = `<span style="color:var(--accent);font-weight:500;">✨ 润色结果：</span>${polishedText}`;
      this.subtitleContainer.appendChild(line);
      this.subtitleScroll.scrollTop = this.subtitleScroll.scrollHeight;
    }
  }

  classifyFeedback(text) {
    if (text === '✓' || text.includes('✓')) return 'good';
    const fillerKeywords = ['嗯','啊','呃','那个','就是','然后','这个','对吧','是吧','反正','基本上','所以说'];
    if (fillerKeywords.some(w => text.includes(`「${w}」`))) return 'filler';
    const hedgeKeywords = ['可能','也许','大概','应该','我觉得','好像','似乎','感觉','或许'];
    if (hedgeKeywords.some(w => text.includes(`「${w}」`))) return 'hedge';
    if (text.includes('→')) return 'vague';
    return 'ai';
  }

  addFeedbackItem(text, type = 'ai') {
    const existing = Array.from(this.feedbackContent.children).slice(0, 3);
    if (existing.some(el => el.textContent === text)) return;

    const item = document.createElement('div');
    item.className = `feedback-item type-${type}`;
    item.textContent = text;
    this.feedbackContent.insertBefore(item, this.feedbackContent.firstChild);
    while (this.feedbackContent.children.length > 12) {
      this.feedbackContent.removeChild(this.feedbackContent.lastChild);
    }
  }

  async generateReport() {
    this.reportBody.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">正在生成报告...</p>';
    this.reportModal.classList.remove('hidden');

    const result = await window.api.getFinalReport({
      fullText: this.fullText,
      stats: this.stats
    });

    if (result.success) {
      this.lastReport = result.report;
      this.renderReport(result.report);
    } else {
      this.reportBody.innerHTML = `<p style="color:#ff6b6b;">生成失败: ${result.error}</p>`;
    }
  }

  renderReport(report) {
    let html = report
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/\|(.+)\|/g, (match) => match)
      .replace(/\n/g, '<br>');

    this.reportBody.innerHTML = `
      <div style="text-align:right;margin-bottom:12px;">
        <button id="btn-save-report" style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;">💾 保存为 Markdown</button>
      </div>
      ${html}
    `;

    document.getElementById('btn-save-report').addEventListener('click', () => this.saveReport());
  }

  async saveReport() {
    if (!this.lastReport) return;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
    const markdown = `# 表达训练报告\n\n**日期**: ${dateStr}  \n**时长**: ${this.stats.duration}秒  \n**总字数**: ${this.stats.totalWords}  \n\n---\n\n## 完整原文\n\n${this.fullText}\n\n---\n\n${this.lastReport}`;
    const filename = `表达训练-${dateStr}-${timeStr}.md`;

    try {
      const result = await window.api.saveFile(markdown, filename);
      if (result.success) {
        const btn = document.getElementById('btn-save-report');
        btn.textContent = '✓ 已保存';
        btn.style.background = 'var(--bg-tertiary)';
        setTimeout(() => { btn.textContent = '💾 保存为 Markdown'; btn.style.background = 'var(--accent)'; }, 2000);
      }
    } catch (e) {
      alert('保存失败: ' + e.message);
    }
  }

  updateTimer() {
    let totalPaused = this.pausedTime;
    if (this.pauseStart) totalPaused += Date.now() - this.pauseStart;
    const elapsed = Math.floor((Date.now() - this.startTime - totalPaused) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    this.timer.textContent = `${minutes}:${seconds}`;
  }

  resetStats() {
    this.stats = { fillers: 0, hedges: 0, vagueWords: 0, totalWords: 0, duration: 0 };
    this.updateStatsDisplay();
    this.feedbackContent.innerHTML = '';
  }

  showError(msg) {
    const line = document.createElement('div');
    line.className = 'subtitle-line';
    line.style.color = '#ff6b6b';
    line.textContent = msg;
    this.subtitleContainer.appendChild(line);
  }

  copyOriginalText() {
    if (!this.fullText.trim()) return;
    navigator.clipboard.writeText(this.fullText).then(() => {
      this.btnCopyText.querySelector('.btn-label').textContent = '✓ 已复制';
      setTimeout(() => { this.btnCopyText.querySelector('.btn-label').textContent = '复制原文'; }, 1500);
    });
  }

  async saveOriginalText() {
    if (!this.fullText.trim()) return;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
    const markdown = `# 表达训练原文\n\n**日期**: ${dateStr}\n\n---\n\n${this.fullText}`;
    const filename = `原文-${dateStr}-${timeStr}.md`;

    try {
      const result = await window.api.saveFile(markdown, filename);
      if (result.success) {
        this.btnSaveText.querySelector('.btn-label').textContent = '✓ 已保存';
        setTimeout(() => { this.btnSaveText.querySelector('.btn-label').textContent = '保存原文'; }, 2000);
      }
    } catch (e) {
      alert('保存失败: ' + e.message);
    }
  }

  clearAll() {
    this.fullText = '';
    this.sentences = [];
    this.lastReport = '';
    this.subtitleContainer.innerHTML = '<div class="subtitle-line hint">点击下方按钮开始说话</div>';
    this.feedbackContent.innerHTML = '';
    this.resetStats();
    this.timer.textContent = '00:00';
    this.timer.classList.remove('active');
    this.btnReport.classList.add('hidden');
    this.btnCopyText.classList.add('hidden');
    this.btnSaveText.classList.add('hidden');
    this.btnClear.classList.add('hidden');
  }

  openPasteModal() {
    this.pasteTextarea.value = '';
    this.pasteModal.classList.remove('hidden');
    this.pasteTextarea.focus();
  }

  async analyzePastedText() {
    const text = this.pasteTextarea.value.trim();
    if (!text) return;

    this.pasteModal.classList.add('hidden');

    this.subtitleContainer.innerHTML = '';
    this.fullText = text;
    this.resetStats();

    const sentences = text.split(/(?<=[。！？\n])/g).filter(s => s.trim());
    this.sentences = sentences;

    for (const sentence of sentences) {
      const line = document.createElement('div');
      line.className = 'subtitle-line';
      line.innerHTML = this.currentMode === 'train' ? this.highlightText(sentence.trim()) : sentence.trim();
      this.subtitleContainer.appendChild(line);

      if (this.currentMode === 'train') {
        const analysis = await window.api.analyzeText(sentence);
        if (analysis) {
          this.stats.fillers += analysis.fillers.length;
          this.stats.hedges += analysis.hedges.length;
          this.stats.vagueWords += analysis.vagueWords.length;
          this.stats.totalWords += analysis.totalWords;
        }
      }
    }

    this.stats.duration = 0;
    this.updateStatsDisplay();

    this.btnReport.classList.remove('hidden');
    this.btnCopyText.classList.remove('hidden');
    this.btnSaveText.classList.remove('hidden');
    this.btnClear.classList.remove('hidden');

    if (this.currentMode === 'polish') {
      this.requestPolish();
    } else {
      this.requestRealtimeFeedback();
    }
  }

  async checkOllamaStatus() {
    const result = await window.api.checkOllamaStatus('http://localhost:11434');
    if (result.running) {
      this.ollamaStatusIcon.textContent = '✓';
      this.ollamaStatusText.textContent = 'Ollama 已运行';
      this.ollamaStatusBar.className = 'ollama-status-bar running';
      this.btnStartOllama.style.display = 'none';
    } else {
      this.ollamaStatusIcon.textContent = '✕';
      this.ollamaStatusText.textContent = 'Ollama 未运行';
      this.ollamaStatusBar.className = 'ollama-status-bar stopped';
      this.btnStartOllama.style.display = 'inline-block';
    }
  }

  async startOllama() {
    this.btnStartOllama.disabled = true;
    this.btnStartOllama.textContent = '启动中...';
    this.ollamaStatusIcon.textContent = '⏳';
    this.ollamaStatusText.textContent = '正在启动 Ollama...';
    this.ollamaStatusBar.className = 'ollama-status-bar';

    const result = await window.api.startOllama();
    if (result.success) {
      this.ollamaStatusIcon.textContent = '✓';
      this.ollamaStatusText.textContent = 'Ollama 已运行';
      this.ollamaStatusBar.className = 'ollama-status-bar running';
      this.btnStartOllama.style.display = 'none';
    } else {
      this.ollamaStatusIcon.textContent = '✕';
      this.ollamaStatusText.textContent = result.message;
      this.ollamaStatusBar.className = 'ollama-status-bar stopped';
      this.btnStartOllama.disabled = false;
      this.btnStartOllama.textContent = '启动';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => { new ExpressionTrainer(); });
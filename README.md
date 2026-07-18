# 🚀 宇宙无敌表达训练系统 - 本地桌面版

一个帮你训练口语表达精准度的本地桌面应用。实时语音识别 → 词库匹配 → AI反馈，全程离线+本地处理。

## ✨ 功能

### 🎯 三种工作模式

| 模式 | 功能 | 适用场景 |
|------|------|----------|
| **训练模式** | 实时语音识别、词库分析、AI反馈、分析报告 | 日常练习、演讲训练 |
| **润色模式** | 语音转录后自动通过大模型润色 | 写稿、文案优化 |
| **语音输入模式** | 浮动小球，语音转文字直接输出到系统活动窗口 | 跨应用语音输入 |

### 🎤 语音输入模式（浮动小球）

- **悬浮小球**：56px圆形控件，可拖拽移动到桌面任意位置
- **交互方式**：左键点击开始/停止录音，右键呼出扇形菜单
- **快捷键**：`Alt+S` 全局快捷键控制录音开关
- **实时输出**：语音转录文字实时显示在气泡中，最终结果自动输出到系统当前活动窗口

### 🤖 AI 反馈

- 支持 DeepSeek / OpenAI / Ollama 多后端
- **Ollama 自动启动**：检测到未运行时自动启动，无需手动操作
- 主界面左下角实时显示 Ollama 运行状态

### 🎨 界面特性

- **主题切换**：浅色/深色主题，自动记忆上次选择
- **窗口记忆**：自动保存窗口尺寸和位置，重启后自动恢复
- **实时分析**：笼统词、填充词、犹豫词统计，表达密度计算

## 📦 环境要求

- **操作系统**: Windows 10+ / macOS 12+ / Linux
- **Node.js**: 18.x 或更高版本
- **麦克风**: 需要麦克风权限
- **网络**: 可选（AI反馈需要网络，词库分析可离线）

## 🔧 安装步骤

### 1. 安装 Node.js

访问 [nodejs.org](https://nodejs.org/) 下载并安装 LTS 版本。

验证安装：
```bash
node --version
npm --version
```

### 2. 克隆项目

```bash
git clone <repository-url>
cd expression-trainer-white
```

### 3. 安装依赖

```bash
npm install
```

**注意**: 安装过程中可能需要编译 `sherpa-onnx-node`，需要确保系统已安装：
- **Windows**: 安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/zh-hans/visual-cpp-build-tools/)
- **macOS**: 安装 Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: 安装 build-essential (`sudo apt-get install build-essential`)

### 4. 下载语音识别模型

需要下载 Sherpa-ONNX 的 streaming paraformer 中英双语模型：

```bash
cd models

# 方法一：使用 wget
wget https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2
tar xvf sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2

# 方法二：手动下载
# 访问 https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2
# 解压到 models/ 目录
```

下载后 `models/` 目录应包含：
```
models/
└── sherpa-onnx-streaming-paraformer-bilingual-zh-en/
    ├── encoder.int8.onnx
    ├── decoder.int8.onnx
    └── tokens.txt
```

### 5. 启动应用

```bash
npm start
```

### 6. 配置 AI 后端

启动后点击右上角 ⚙️ 进入设置页面。

推荐配置：

| 后端 | 费用 | 速度 | 获取方式 |
|------|------|------|----------|
| DeepSeek | 极低 | 快 | [platform.deepseek.com](https://platform.deepseek.com) |
| OpenAI | 中等 | 快 | [platform.openai.com](https://platform.openai.com) |
| Ollama | 免费 | 取决于硬件 | [ollama.com](https://ollama.com) 本地运行 |

**推荐 deepseek**：生成报告质量高，且成本极低。

## 📖 使用说明

### 训练模式

1. 点击顶部 🎯 **训练** 按钮切换模式
2. 点击「开始」→ 对着麦克风说话
3. 实时字幕会在屏幕中央显示你说的内容
4. 左侧面板实时统计填充词/犹豫词/笼统词
5. 右侧面板每50字会给出AI实时反馈
6. 说完后点击「结束」→ 可以点「生成报告」获取完整分析

### 润色模式

1. 点击顶部 ✨ **润色** 按钮切换模式
2. 点击「开始」→ 对着麦克风说话
3. 说完后自动调用大模型润色文本

### 语音输入模式

1. 点击顶部 🎤 **语音** 按钮切换模式
2. 桌面出现浮动小球，左键点击开始录音
3. 说话时小球下方气泡实时显示识别结果
4. 说完后文字自动输出到系统当前活动窗口
5. 右键点击小球可切换回训练/润色模式

## 🎨 字幕颜色含义

| 颜色 | 含义 |
|------|------|
| 🔴 红色波浪下划线 | 填充词（嗯、啊、那个、然后…） |
| 🟠 橙色 | 犹豫词（可能、也许、我觉得…） |
| 🟡 黄色虚线 | 笼统词（有精准替代建议） |
| 🟢 绿色 | 有力表达（好句子！） |

## 🏗️ 技术架构

```
┌─────────────────────────────────────────┐
│ Electron 主进程                          │
│  ├── Sherpa-ONNX (离线语音识别)          │
│  ├── 词库匹配 (emotion-lexicon.json)     │
│  ├── AI反馈 (多后端 HTTP API)            │
│  └── Ollama 自动启动与管理               │
├─────────────────────────────────────────┤
│ 渲染进程 (Chromium)                      │
│  ├── 主界面（训练/润色模式）              │
│  ├── 浮动小球窗口（语音输入模式）         │
│  └── 子窗口（设置、训练规则、词库）       │
└─────────────────────────────────────────┘
```

## 📁 词库说明

`data/emotion-lexicon.json` 基于大连理工情感词库7大类结构，包含：

- **130+ 情绪词**：分类（喜怒哀惧恶惊）+ 强度（1-9）
- **笼统词→精准词映射**：25组高频替代建议
- **填充词表**：24个常见口头禅
- **犹豫词表**：19个弱化表达
- **程度词梯度**：弱→中→强→极 四级
- **画面化描述**：10组「抽象→具象」转换
- **犹豫→直接转换**：8组对照示例

## 🛠️ 开发

```bash
# 开发模式（带DevTools）
npm run dev

# 打包（需要安装 electron-packager）
npm run build
```

### 目录结构

```
├── main.js              # Electron主进程
├── preload.js           # preload脚本
├── src/
│   ├── index.html       # 主界面
│   ├── settings.html    # 设置页
│   ├── settings.js      # 设置逻辑
│   ├── prompt-editor.html # 训练规则页
│   ├── lexicon-playground.html # 词库页
│   ├── voice-ball.html  # 浮动小球界面
│   ├── styles.css       # 样式（含主题）
│   └── app.js           # 前端逻辑
├── lib/
│   ├── asr.js           # 语音识别
│   ├── lexicon.js       # 词库匹配
│   ├── ai-feedback.js   # AI反馈
│   └── prompts.js       # Prompt模板
├── data/
│   ├── emotion-lexicon.json
│   └── tiered-lexicon.json
└── models/              # Sherpa-ONNX模型（需下载）
```

## 📋 常见问题

### Q: 启动时提示找不到模型？
A: 请确保已下载模型到 `models/sherpa-onnx-streaming-paraformer-bilingual-zh-en/` 目录

### Q: 语音识别效果不好？
A: 建议使用安静的环境，靠近麦克风说话，清晰发音

### Q: Ollama 启动失败？
A: 请确保已安装 Ollama（[ollama.com](https://ollama.com)），并已下载至少一个模型

### Q: 打包失败？
A: 确保已安装 build tools，参考安装步骤第 3 步

## 📝 更新日志

查看 [CHANGELOG.md](CHANGELOG.md) 获取详细更新记录。

## 📄 License

MIT

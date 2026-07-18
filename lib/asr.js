/**
 * 语音识别模块 - 基于 sherpa-onnx-node
 * 使用 streaming recognizer 实现实时中文语音识别
 * 录音通过 Electron 渲染进程的 Web Audio API 采集，音频数据通过 IPC 传入
 */

const path = require('path');
const fs = require('fs');

let recognizer = null;
let stream = null;
let isRunning = false;
let lastFinalText = ''; // 用于去重，防止 reset 后 isEndpoint 仍为 true 导致重复输出

const MODELS_DIR = path.join(__dirname, '..', 'models');
const MODEL_SUBDIR = 'sherpa-onnx-streaming-paraformer-bilingual-zh-en';

/**
 * 检查模型文件是否存在
 */
function checkModels() {
  const modelDir = path.join(MODELS_DIR, MODEL_SUBDIR);
  const files = ['encoder.int8.onnx', 'decoder.int8.onnx', 'tokens.txt'];

  for (const file of files) {
    const fullPath = path.join(modelDir, file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(
        `模型文件未找到: ${file}\n` +
        `请确认 models/${MODEL_SUBDIR}/ 目录下有完整的模型文件`
      );
    }
  }
}

/**
 * 初始化 ASR 引擎
 */
async function initASR() {
  lastFinalText = '';
  if (recognizer) {
    // 已初始化，重置stream即可
    stream = recognizer.createStream();
    isRunning = true;
    console.log('[ASR] 重用已有引擎，创建新stream');
    return;
  }

  checkModels();

  const sherpa = require('sherpa-onnx-node');
  const modelDir = path.join(MODELS_DIR, MODEL_SUBDIR);

  const config = {
    featConfig: {
      sampleRate: 16000,
      featureDim: 80
    },
    modelConfig: {
      paraformer: {
        encoder: path.join(modelDir, 'encoder.int8.onnx'),
        decoder: path.join(modelDir, 'decoder.int8.onnx'),
      },
      tokens: path.join(modelDir, 'tokens.txt'),
      numThreads: 2,
      provider: 'cpu',
      debug: false
    },
    decodingMethod: 'greedy_search',
    maxActivePaths: 4,
    enableEndpoint: true,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 20
  };

  recognizer = new sherpa.OnlineRecognizer(config);
  stream = recognizer.createStream();
  isRunning = true;

  console.log('[ASR] 识别引擎初始化完成');
}

/**
 * 接收渲染进程发来的音频数据进行识别
 * @param {Float32Array} samples - 16kHz 单声道音频采样
 * @returns {{ text: string, isFinal: boolean } | null}
 */
function feedAudio(samples) {
  if (!isRunning || !stream || !recognizer) return null;

  // sherpa-onnx-node API: acceptWaveform({ samples, sampleRate })
  stream.acceptWaveform({ samples, sampleRate: 16000 });

  while (recognizer.isReady(stream)) {
    recognizer.decode(stream);
  }

  const result = recognizer.getResult(stream);
  const text = (result.text || '').trim();
  const isEndpoint = recognizer.isEndpoint(stream);

  if (isEndpoint && text) {
    // 去重：sherpa-onnx 在 reset 后 isEndpoint 可能仍为 true，
    // 会导致后续 feedAudio 重复返回相同的 final 文本。
    // 若文本与上次 final 完全相同，跳过输出。
    if (text === lastFinalText) {
      recognizer.reset(stream);
      return null;
    }
    lastFinalText = text;
    recognizer.reset(stream);
    return { text, isFinal: true };
  } else if (text) {
    return { text, isFinal: false };
  }

  return null;
}

/**
 * 停止识别并释放资源
 * @returns {string} 最后的未确认文本
 */
function stopRecognition() {
  isRunning = false;
  lastFinalText = '';

  let finalText = '';
  try {
    if (stream && recognizer) {
      stream.inputFinished();
      while (recognizer.isReady(stream)) {
        recognizer.decode(stream);
      }
      const result = recognizer.getResult(stream);
      finalText = (result.text || '').trim();
      stream = null;
    }
  } catch (e) {
    console.error('[ASR] 停止识别时出错:', e.message);
  }

  try {
    if (recognizer) {
      recognizer = null;
    }
  } catch (e) {
    console.error('[ASR] 释放引擎资源时出错:', e.message);
  }

  console.log('[ASR] 停止录制，资源已释放');
  return finalText;
}

module.exports = { initASR, feedAudio, stopRecognition };

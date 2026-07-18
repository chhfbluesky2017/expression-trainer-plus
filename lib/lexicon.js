/**
 * 词库匹配模块
 * 加载情感词库JSON，分析文本中的情绪词、填充词、犹豫词
 */

const fs = require('fs');
const path = require('path');

let lexiconData = null;

// 填充词列表（语气词/口头禅）
const FILLER_WORDS = [
  '嗯', '啊', '呃', '额', '那个', '就是', '然后',
  '这个', '对吧', '是吧', '你知道', '怎么说呢',
  '反正', '基本上', '总之', '所以说'
];

// 犹豫词列表（弱化表达）
const HEDGE_WORDS = [
  '可能', '也许', '大概', '应该', '我觉得', '好像',
  '似乎', '或许', '不一定', '差不多', '算是',
  '某种程度上', '一般来说', '感觉'
];

// 笼统词 → 精准替代映射
const VAGUE_TO_PRECISE = {
  '开心': ['欣喜', '雀跃', '兴奋', '欣慰', '畅快', '满足'],
  '难过': ['心酸', '失落', '委屈', '心疼', '沮丧', '低落'],
  '害怕': ['恐惧', '焦虑', '不安', '慌张', '胆怯', '忐忑'],
  '生气': ['愤怒', '恼火', '窝火', '气愤', '不满', '暴躁'],
  '不舒服': ['压抑', '烦躁', '憋屈', '窒息', '煎熬', '疲惫'],
  '很好': ['出色', '精彩', '优秀', '惊艳', '完美', '理想'],
  '很多': ['大量', '海量', '充裕', '丰富', '密集', '可观'],
  '很快': ['迅速', '飞速', '立刻', '瞬间', '即刻', '火速'],
  '很大': ['巨大', '庞大', '显著', '惊人', '可观', '壮观'],
  '很小': ['微小', '细微', '轻微', '渺小', '微不足道', '些许'],
  '好看': ['精致', '优雅', '绚丽', '惊艳', '别致', '夺目'],
  '不好': ['糟糕', '恶劣', '拙劣', '不堪', '惨淡', '低劣'],
  '喜欢': ['热爱', '痴迷', '着迷', '钟爱', '倾心', '沉醉'],
  '讨厌': ['厌恶', '反感', '排斥', '憎恨', '鄙视', '嫌弃'],
  '觉得': ['认为', '判断', '确信', '推断', '意识到', '发现'],
  '想': ['渴望', '期待', '向往', '盼望', '企图', '打算'],
  '做': ['执行', '落实', '推进', '完成', '实施', '操作'],
  '看': ['审视', '观察', '注视', '打量', '端详', '凝视'],
  '说': ['表达', '阐述', '强调', '指出', '坦言', '声明'],
  '想想': ['反思', '回顾', '审视', '复盘', '琢磨', '斟酌']
};

/**
 * 加载词库
 */
function loadLexicon() {
  const lexiconPath = path.join(__dirname, '..', 'data', 'emotion-lexicon.json');

  if (fs.existsSync(lexiconPath)) {
    const raw = fs.readFileSync(lexiconPath, 'utf-8');
    lexiconData = JSON.parse(raw);
    console.log(`[词库] 加载完成，共 ${Object.keys(lexiconData.emotions || {}).length} 个情绪词`);
  } else {
    console.warn('[词库] emotion-lexicon.json 未找到，使用内置词表');
    lexiconData = { emotions: {} };
  }
}

/**
 * 简单中文分词（基于最大正向匹配 + 词表）
 */
function segmentText(text) {
  const words = [];
  let i = 0;
  const maxLen = 6;

  // 构建词表用于匹配
  const dict = new Set([
    ...FILLER_WORDS,
    ...HEDGE_WORDS,
    ...Object.keys(VAGUE_TO_PRECISE),
    ...Object.keys(lexiconData.emotions || {})
  ]);

  while (i < text.length) {
    let matched = false;
    for (let len = Math.min(maxLen, text.length - i); len >= 2; len--) {
      const word = text.substring(i, i + len);
      if (dict.has(word)) {
        words.push(word);
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // 单字
      words.push(text[i]);
      i++;
    }
  }

  return words;
}

/**
 * 分析文本
 * @param {string} text - 输入文本
 * @returns {Object} 分析结果
 */
function analyzeText(text) {
  if (!text || !text.trim()) {
    return null;
  }

  const words = segmentText(text);
  const totalWords = words.length;

  // 检测填充词
  const fillers = [];
  words.forEach((word, idx) => {
    if (FILLER_WORDS.includes(word)) {
      fillers.push({ word, position: idx });
    }
  });

  // 检测犹豫词
  const hedges = [];
  words.forEach((word, idx) => {
    if (HEDGE_WORDS.includes(word)) {
      hedges.push({ word, position: idx });
    }
  });

  // 检测笼统词
  const vagueWords = [];
  words.forEach((word, idx) => {
    if (VAGUE_TO_PRECISE[word]) {
      vagueWords.push({
        word,
        position: idx,
        alternatives: VAGUE_TO_PRECISE[word]
      });
    }
  });

  // 检测情绪词（来自词库）
  const emotionWords = [];
  if (lexiconData && lexiconData.emotions) {
    words.forEach((word, idx) => {
      if (lexiconData.emotions[word]) {
        emotionWords.push({
          word,
          position: idx,
          ...lexiconData.emotions[word]
        });
      }
    });
  }

  // 计算表达密度
  const meaningfulWords = totalWords - fillers.length - hedges.length;
  const density = totalWords > 0 ? (meaningfulWords / totalWords) : 1;

  return {
    totalWords,
    fillers,
    hedges,
    vagueWords,
    emotionWords,
    density: Math.round(density * 100),
    suggestions: generateSuggestions(vagueWords, fillers, hedges)
  };
}

/**
 * 生成替代建议
 */
function generateSuggestions(vagueWords, fillers, hedges) {
  const suggestions = [];

  // 笼统词替代
  vagueWords.forEach(item => {
    suggestions.push({
      type: 'vague',
      original: item.word,
      alternatives: item.alternatives.slice(0, 3),
      message: `「${item.word}」→ 试试更精准的：${item.alternatives.slice(0, 3).join('、')}`
    });
  });

  // 填充词提醒
  if (fillers.length >= 3) {
    const topFillers = [...new Set(fillers.map(f => f.word))].slice(0, 3);
    suggestions.push({
      type: 'filler',
      message: `填充词偏多（${fillers.length}次）：${topFillers.join('、')}。试试用停顿替代`
    });
  }

  // 犹豫词提醒
  if (hedges.length >= 2) {
    suggestions.push({
      type: 'hedge',
      message: `犹豫表达较多（${hedges.length}次）。试试把「我觉得」改成直接陈述`
    });
  }

  return suggestions;
}

module.exports = { loadLexicon, analyzeText, VAGUE_TO_PRECISE, FILLER_WORDS, HEDGE_WORDS };

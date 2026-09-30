/**
 * chat.js - HUSTBot AI Chatbot (Shiori)
 * Hỗ trợ 2 chế độ thông minh:
 * 1. Chế độ Ngoại tuyến (Offline AI Engine): Hoạt động 100% KHÔNG CẦN MẠNG & KHÔNG CẦN API KEY,
 *    truy vấn trực tiếp toàn bộ 39 bài viết cẩm nang nhập học + Sổ tay sinh viên HUST 2026.
 * 2. Chế độ Đám mây (Gemini Cloud AI): Dành cho người dùng có Gemini API Key, tự động fallback
 *    về Chế độ Ngoại tuyến nếu Gemini bị lỗi quá tải (503) hoặc mất mạng!
 */

// ============================================================
// CHAT STATE
// ============================================================
const ChatState = {
  apiKey: null,
  mode: 'offline', // 'offline' | 'cloud'
  chatSession: null,
  isStreaming: false,
  messages: [], // { role: 'user'|'shiori', text, timestamp, isFallback?: boolean }
  hasGreeted: false,
};

// ============================================================
// HUST KNOWLEDGE INDEXER (OFFLINE NLP ENGINE)
// ============================================================
let HUST_ARTICLES = [];

function removeVietnameseTones(str) {
  if (!str) return '';
  return str.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase();
}

function initKnowledgeIndex() {
  const text = (window.HUST_KNOWLEDGE && window.HUST_KNOWLEDGE.systemPrompt) || '';
  const parts = text.split(/\n### /);
  HUST_ARTICLES = [];

  for (let i = 1; i < parts.length; i++) {
    const lines = parts[i].split('\n');
    const title = lines[0].trim();
    const content = lines.slice(1).join('\n').trim();
    HUST_ARTICLES.push({
      id: i,
      title: title,
      content: content,
      cleanTitle: removeVietnameseTones(title),
      cleanContent: removeVietnameseTones(content)
    });
  }
}

/**
 * Trả lời câu hỏi hoàn toàn ngoại tuyến từ tri thức HUST
 */
function queryOfflineKnowledge(userQuery) {
  if (!HUST_ARTICLES.length) {
    initKnowledgeIndex();
  }

  const cleanQ = removeVietnameseTones(userQuery.trim());

  // 1. Phản hồi trò chuyện thân mật (Small talk)
  if (/^(chao|hello|hi|helo|alo|hai|chao ban|chao Shiori|xin chao)/.test(cleanQ)) {
    return 'Chào bạn nha! ヾ(≧▽≦)ゝ Mình là **Shiori** — trợ lý AI siêu thân thiện của HUSTBot đây! Mình nắm rõ tất tần tật 39 cẩm nang tân sinh viên và Sổ tay sinh viên Bách Khoa nè! Bạn đang thắc mắc gì về hồ sơ nhập học, học phí, học bổng hay ký túc xá cứ hỏi mình nhé! 🌸 (✿◠‿◠)';
  }

  if (/(ban la ai|Shiori la ai|gioi thieu|ten gi)/.test(cleanQ)) {
    return 'Mình là **Shiori** 🎀 — cô bạn trợ lý ảo được thiết kế riêng cho sinh viên Đại học Bách khoa Hà Nội! \n\nMình có thể giúp bạn giải đáp thông tin về:\n• 📋 Hồ sơ, thủ tục nhập học & NVQS\n• 🏥 Bảo hiểm y tế & Khám sức khỏe\n• 🏠 Đăng ký KTX Bách Khoa, KTX Pháp Vân & Nhà trọ\n• 📚 Thư viện Tạ Quang Bửu & Mượn sách giáo trình\n• 🎓 Học bổng, quy chế tín chỉ & Điểm rèn luyện\n• 🚗 Thẻ gửi xe & Vé xe buýt tháng\n\nBạn có thể hỏi mình bất cứ lúc nào, kể cả khi tắt mạng (offline) nha! \\^o^/ ✨';
  }

  if (/(cam on|thanks|thank you|cam on nhe|tuyet voi|gioi qua)/.test(cleanQ)) {
    return 'Dạ không có chi đâu nè! (❁´◡`❁) Giúp được bạn là Shiori vui lắm rồi á! Chúc bạn có một kỳ học thật bùng nổ tại Bách Khoa nha! 💖 Cần gì cứ nhắn mình bất cứ lúc nào nhé! ✨';
  }

  if (/(tam biet|bye|goodbye|ngu ngon|di ngu)/.test(cleanQ)) {
    return 'Tạm biệt bạn nha! （づ￣3￣）づ╭～ Nghỉ ngơi sớm để giữ gìn sức khỏe cho các môn học Bách Khoa nè! Hẹn gặp lại bạn nha! 🌙🌸';
  }

  // 2. Chấm điểm tìm kiếm theo từ khóa trong tiêu đề & nội dung
  const words = cleanQ.split(/\s+/).filter(w => w.length > 1);
  if (!words.length) {
    return 'Bạn ơi, bạn hãy nhập câu hỏi hoặc từ khóa cụ thể hơn để Shiori tìm giúp bạn nhé! (✿◠‿◠) 🌸';
  }

  let best = null;
  let bestScore = -1;

  for (const a of HUST_ARTICLES) {
    let score = 0;

    // Khớp nguyên cụm từ khóa quan trọng
    if (cleanQ.includes('nhap hoc') && a.cleanTitle.includes('nhap hoc')) score += 15;
    if ((cleanQ.includes('nghia vu quan su') || cleanQ.includes('nvqs')) && (a.cleanTitle.includes('nghia vu quan su') || a.cleanTitle.includes('nvqs'))) score += 15;
    if ((cleanQ.includes('bao hiem y te') || cleanQ.includes('bhyt')) && (a.cleanTitle.includes('bao hiem y te') || a.cleanTitle.includes('bhyt'))) score += 15;
    if ((cleanQ.includes('ky tuc xa') || cleanQ.includes('ktx') || cleanQ.includes('nha tro') || cleanQ.includes('phap van')) && a.cleanTitle.includes('ky tuc xa')) score += 15;
    if ((cleanQ.includes('thu vien') || cleanQ.includes('ta quang buu') || cleanQ.includes('sach')) && a.cleanTitle.includes('thu vien')) score += 15;
    if ((cleanQ.includes('xe buyt') || cleanQ.includes('gui xe') || cleanQ.includes('the gui xe')) && a.cleanTitle.includes('gui xe')) score += 15;
    if ((cleanQ.includes('tieng anh') || cleanQ.includes('placement test') || cleanQ.includes('toeic') || cleanQ.includes('ielts')) && a.cleanTitle.includes('tieng anh')) score += 15;
    if ((cleanQ.includes('hoc bong') || cleanQ.includes('chap canh') || cleanQ.includes('tran dai nghia')) && a.cleanTitle.includes('hoc bong')) score += 15;
    if ((cleanQ.includes('email') || cleanQ.includes('sis') || cleanQ.includes('tai khoan')) && a.cleanTitle.includes('email')) score += 15;
    if ((cleanQ.includes('kham suc khoe') || cleanQ.includes('y te') || cleanQ.includes('kham benh')) && a.cleanTitle.includes('suc khoe')) score += 15;
    if ((cleanQ.includes('lua dao') || cleanQ.includes('canh giac')) && a.cleanTitle.includes('canh giac')) score += 15;
    if ((cleanQ.includes('ban dao tao') || cleanQ.includes('ctsv') || cleanQ.includes('o dau') || cleanQ.includes('phong dao tao')) && a.cleanTitle.includes('lien he')) score += 15;
    if ((cleanQ.includes('sinh hoat doan') || cleanQ.includes('doan vien')) && a.cleanTitle.includes('sinh hoat doan')) score += 15;
    if ((cleanQ.includes('dong phuc') || cleanQ.includes('ao')) && a.cleanTitle.includes('dong phuc')) score += 15;

    // Chấm điểm từng từ
    for (const w of words) {
      if (a.cleanTitle.includes(w)) score += 5;
      if (a.cleanContent.includes(w)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }

  // 3. Xử lý trường hợp không tìm thấy
  if (!best || bestScore < 4) {
    return 'Dạ bạn ơi, câu này Shiori chưa tìm thấy thông tin chính xác trong cẩm nang sinh viên hiện có ＞﹏＜\n\nBạn có thể liên hệ trực tiếp các phòng ban chức năng của Bách Khoa để được hỗ trợ nhanh nhất nhé:\n• **Ban Đào tạo**: Phòng 201 – 204 nhà C1 | ☎️ 024.3869.2008 | ✉️ dt@hust.edu.vn\n• **Ban Công tác Sinh viên (CTSV)**: Phòng 101 – 104 nhà C1 | ☎️ 024.3869.2896 | ✉️ ctsv@hust.edu.vn\n• **Cổng thông tin**: [ctsv.hust.edu.vn](https://ctsv.hust.edu.vn)\n\nBạn thử hỏi lại bằng các từ khóa ngắn gọn như: *thủ tục nhập học, BHYT, KTX, học bổng, gửi xe, thư viện, tiếng Anh đầu vào...* xem sao nha! (✿◠‿◠) 🌸';
  }

  // 4. Tổng hợp và định dạng câu trả lời đẹp mắt
  let content = best.content;

  // Tách thành các đoạn văn ngắn gọn
  let paras = content.split('\n').map(p => p.trim()).filter(p => p.length > 0);
  let formattedBody = '';

  // Lấy các đoạn tiêu biểu (tối đa 4 đoạn đầu hoặc 800 ký tự)
  let charCount = 0;
  let selectedParas = [];
  for (const p of paras) {
    selectedParas.push(p);
    charCount += p.length;
    if (charCount > 750 || selectedParas.length >= 4) break;
  }
  formattedBody = selectedParas.join('\n\n');

  // Làm đẹp các bước / danh mục nếu có
  formattedBody = formattedBody
    .replace(/Bước (\d+):/g, '\n• **Bước $1:**')
    .replace(/I\. /g, '\n📌 **I. **')
    .replace(/II\. /g, '\n📌 **II. **')
    .replace(/III\. /g, '\n📌 **III. **');

  return `Bạn ơi, về **${best.title}**, Bách Khoa quy định chi tiết như sau nè! \\^o^/\n\n${formattedBody}\n\n` +
    `📚 *Nguồn trích dẫn: Cẩm nang CTSV & Sổ tay Sinh viên Đại học Bách khoa Hà Nội*\n` +
    `Nếu bạn cần thêm chi tiết nào cứ ới Shiori tiếp nhé! (❁´◡\`❁) 🌸`;
}

// ============================================================
// INIT CHAT MODULE
// ============================================================
async function initChat() {
  initKnowledgeIndex();

  const savedKey = sessionStorage.getItem('hustbot_apikey');
  if (savedKey) {
    ChatState.apiKey = savedKey;
    ChatState.mode = 'cloud';
    setupGeminiChat().catch(() => { });
  } else {
    ChatState.mode = 'offline';
  }

  renderChatUI();
}

// ============================================================
// SETUP GEMINI SESSION
// ============================================================
async function setupGeminiChat() {
  try {
    if (!ChatState.apiKey) return false;
    if (typeof window.GoogleGenAI === 'undefined') {
      console.warn('[Chat] GoogleGenAI chưa sẵn sàng');
      return false;
    }
    const ai = new window.GoogleGenAI({ apiKey: ChatState.apiKey });
    const systemInstruction = (window.HUST_KNOWLEDGE && window.HUST_KNOWLEDGE.systemPrompt) || '';
    ChatState.chatSession = ai.chats.create({
      model: 'gemini-3.8-flash',
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 2048,
      }
    });
    return true;
  } catch (err) {
    console.error('[Chat] Lỗi khởi tạo Gemini:', err);
    return false;
  }
}

// ============================================================
// RENDER CHAT PAGE UI
// ============================================================
function renderChatUI() {
  const page = document.getElementById('page-chat');
  if (!page) return;

  const knowledge = window.HUST_KNOWLEDGE || {};
  const quickTopics = knowledge.quickTopics || [];

  const isCloud = ChatState.mode === 'cloud' && ChatState.apiKey;
  const modeBadgeText = isCloud ? '☁️ Gemini Cloud' : '⚡ Ngoại tuyến (Sẵn sàng)';
  const modeBadgeClass = isCloud ? 'cloud' : 'offline';

  page.innerHTML = `
    <div class="chat-container" id="chat-container">
      <!-- Header -->
      <div class="chat-header">
        <div class="shiori-avatar-wrap">
          <div class="shiori-avatar">
            <span class="shiori-avatar-emoji">✒️</span>
          </div>
          <span class="shiori-online-dot"></span>
        </div>
        <div class="chat-header-info">
          <div class="chat-header-name">
            Shiori ✨
            <span class="chat-mode-badge ${modeBadgeClass}" id="chat-mode-badge" title="Chế độ AI hiện tại">${modeBadgeText}</span>
          </div>
          <div class="chat-header-status" id="shiori-status">Trợ lý Sinh viên Bách Khoa</div>
        </div>
        <button class="btn-icon" id="chat-settings-btn" title="Cài đặt AI & Chế độ">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>

      <!-- Messages area -->
      <div class="chat-messages" id="chat-messages">
        ${renderWelcomeMessage()}
      </div>

      <!-- Quick topic chips -->
      <div class="chat-chips-wrap" id="chat-chips-wrap" style="${ChatState.messages.length > 0 ? 'display:none' : ''}">
        <div class="chat-chips">
          ${quickTopics.map(t =>
    `<button class="chip-btn" data-query="${encodeURIComponent(t.query)}">${t.icon} ${t.label}</button>`
  ).join('')}
        </div>
      </div>

      <!-- Input area: LUÔN MỞ SẴN, không chặn người dùng -->
      <div class="chat-input-area" id="chat-input-area">
        <div class="chat-input-row">
          <textarea
            id="chat-input"
            class="chat-input"
            placeholder="Hỏi Shiori bất cứ điều gì về HUST (không cần mạng)... （￣︶￣）↗　"
            rows="1"
            maxlength="1000"
          ></textarea>
          <button class="chat-send-btn" id="chat-send-btn" disabled>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;

  bindChatEvents();

  if (ChatState.messages.length > 0) {
    rerenderMessages();
  }
}

function renderWelcomeMessage() {
  const isCloud = ChatState.mode === 'cloud' && ChatState.apiKey;
  return `<div class="shiori-bubble-wrap">
    <div class="shiori-bubble-avatar">✒️</div>
    <div class="shiori-msg-bubble">
      <p>Xin chào! Mình là <strong>Shiori</strong> (✿◠‿◠) — trợ lý AI của sinh viên Đại học Bách khoa Hà Nội! 🎓</p>
      <p>Mình đã nạp sẵn toàn bộ <strong>39 bài cẩm nang nhập học</strong> và <strong>Sổ tay sinh viên HUST 2026</strong>. Bạn có thể hỏi mình mọi thông tin mà <strong>không cần kết nối mạng hay nhập API key</strong> luôn nha! \\^o^/ ✨</p>
      <p><em>💡 Mẹo: Bấm các gợi ý bên dưới hoặc gõ câu hỏi để trò chuyện ngay cùng mình nhé!</em></p>
    </div>
  </div>`;
}

// ============================================================
// RENDER MESSAGES
// ============================================================
function rerenderMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  container.innerHTML = ChatState.messages.map(function (m) {
    return m.role === 'user' ? renderUserMsg(m.text) : renderShioriMsg(m.text);
  }).join('');
  scrollToBottom();
}

function renderUserMsg(text) {
  return `<div class="user-msg-wrap">
    <div class="user-msg-bubble">${escapeHtml(text).replace(/\n/g, '<br>')}</div>
  </div>`;
}

function renderShioriMsg(text) {
  return `<div class="shiori-bubble-wrap">
    <div class="shiori-bubble-avatar">✒️</div>
    <div class="shiori-msg-bubble">${markdownToHtml(text)}</div>
  </div>`;
}

function renderTypingIndicator() {
  return `<div class="shiori-bubble-wrap" id="typing-indicator">
    <div class="shiori-bubble-avatar">✒️</div>
    <div class="shiori-msg-bubble typing-bubble">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    </div>
  </div>`;
}

// ============================================================
// SEND MESSAGE (HYBRID: GEMINI + INSTANT OFFLINE FALLBACK)
// ============================================================
async function sendMessage(text) {
  if (!text || !text.trim() || ChatState.isStreaming) return;
  text = text.trim();

  // 1. Thêm tin nhắn của User
  ChatState.messages.push({ role: 'user', text: text, timestamp: Date.now() });
  appendUserMessage(text);
  hideChips();
  clearInput();
  setSendBtnDisabled(true);

  // Hiển thị chỉ báo gõ
  appendToMessages(renderTypingIndicator());
  scrollToBottom();

  setShioriStatus('Shiori đang tra cứu... 💭');
  ChatState.isStreaming = true;

  // 2. Kiểm tra nếu có API key và mạng ổn định -> Thử gọi Gemini Cloud
  const canUseCloud = ChatState.mode === 'cloud' && ChatState.apiKey && navigator.onLine;

  if (canUseCloud) {
    try {
      if (!ChatState.chatSession) {
        const ok = await setupGeminiChat();
        if (!ok) throw new Error('Không thể khởi tạo Gemini');
      }

      const stream = await ChatState.chatSession.sendMessageStream({ message: text });

      removeTypingIndicator();
      const streamBubbleId = 'stream-bubble-' + Date.now();
      appendToMessages(`<div class="shiori-bubble-wrap" id="${streamBubbleId}">
        <div class="shiori-bubble-avatar">✒️</div>
        <div class="shiori-msg-bubble" id="${streamBubbleId}-content"></div>
      </div>`);
      scrollToBottom();

      let fullText = '';
      const contentEl = document.getElementById(streamBubbleId + '-content');

      for await (const chunk of stream) {
        if (chunk.text) {
          fullText += chunk.text;
          if (contentEl) {
            contentEl.innerHTML = markdownToHtml(fullText) + '<span class="cursor-blink">|</span>';
            scrollToBottom();
          }
        }
      }

      if (contentEl) {
        contentEl.innerHTML = markdownToHtml(fullText);
      }
      ChatState.messages.push({ role: 'shiori', text: fullText, timestamp: Date.now() });
      finishStreaming();
      return;

    } catch (err) {
      console.warn('[Chat] Gemini Cloud gặp sự cố, tự động chuyển sang Tri thức Ngoại tuyến:', err);
      // Tự động Fallback sang Tri thức Ngoại tuyến, không báo lỗi đơ máy!
      removeTypingIndicator();
      const offlineAns = queryOfflineKnowledge(text);
      const fallbackNotice = '*(Hệ thống Gemini đang quá tải một chút ＞﹏＜ Shiori xin phép dùng ngay Tri thức Bách Khoa ngoại tuyến để trả lời cho bạn nhé! 🌸)*\n\n' + offlineAns;
      simulateOfflineStreaming(fallbackNotice);
      return;
    }
  }

  // 3. Nếu KHÔNG có API key hoặc đang ở chế độ Ngoại tuyến (Offline Mode)
  removeTypingIndicator();
  const offlineAns = queryOfflineKnowledge(text);
  simulateOfflineStreaming(offlineAns);
}

/**
 * Hiệu ứng gõ chữ mượt mà cho câu trả lời Offline (Typewriter Effect)
 */
function simulateOfflineStreaming(fullText) {
  const streamBubbleId = 'stream-bubble-' + Date.now();
  appendToMessages(`<div class="shiori-bubble-wrap" id="${streamBubbleId}">
    <div class="shiori-bubble-avatar">✒️</div>
    <div class="shiori-msg-bubble" id="${streamBubbleId}-content"></div>
  </div>`);
  scrollToBottom();

  const contentEl = document.getElementById(streamBubbleId + '-content');
  let currentPos = 0;
  const chunkSize = Math.max(4, Math.floor(fullText.length / 25)); // Chia làm khoảng 25 bước nhỏ

  const timer = setInterval(() => {
    currentPos += chunkSize;
    if (currentPos >= fullText.length) {
      clearInterval(timer);
      if (contentEl) contentEl.innerHTML = markdownToHtml(fullText);
      ChatState.messages.push({ role: 'shiori', text: fullText, timestamp: Date.now() });
      finishStreaming();
    } else {
      const part = fullText.slice(0, currentPos);
      if (contentEl) {
        contentEl.innerHTML = markdownToHtml(part) + '<span class="cursor-blink">|</span>';
        scrollToBottom();
      }
    }
  }, 20);
}

function finishStreaming() {
  ChatState.isStreaming = false;
  setShioriStatus('Trợ lý Sinh viên Bách Khoa');
  setSendBtnDisabled(false);
  scrollToBottom();
}

// ============================================================
// DOM HELPERS
// ============================================================
function appendToMessages(html) {
  const container = document.getElementById('chat-messages');
  if (container) {
    const div = document.createElement('div');
    div.innerHTML = html;
    while (div.firstChild) container.appendChild(div.firstChild);
  }
}

function appendUserMessage(text) {
  appendToMessages(renderUserMsg(text));
}

function removeTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

function hideChips() {
  const el = document.getElementById('chat-chips-wrap');
  if (el) el.style.display = 'none';
}

function clearInput() {
  const el = document.getElementById('chat-input');
  if (el) { el.value = ''; el.style.height = 'auto'; }
}

function setSendBtnDisabled(disabled) {
  const btn = document.getElementById('chat-send-btn');
  if (btn) btn.disabled = disabled;
}

function setShioriStatus(text) {
  const el = document.getElementById('shiori-status');
  if (el) el.textContent = text;
}

function scrollToBottom() {
  const container = document.getElementById('chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

// ============================================================
// MARKDOWN RENDERER (lightweight & safe)
// ============================================================
function markdownToHtml(text) {
  if (!text) return '';
  let html = escapeHtml(text);

  // Bold **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code `code`
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Bullet lists (lines starting with - or •)
  const lines = html.split('\n');
  const result = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBullet = /^[-•]\s+/.test(line.trim());
    if (isBullet) {
      if (!inList) { result.push('<ul>'); inList = true; }
      result.push('<li>' + line.trim().replace(/^[-•]\s+/, '') + '</li>');
    } else {
      if (inList) { result.push('</ul>'); inList = false; }
      if (line.trim() === '') {
        result.push('<br>');
      } else {
        result.push('<p>' + line + '</p>');
      }
    }
  }
  if (inList) result.push('</ul>');

  // Clean up consecutive <br> / empty <p>
  return result.join('')
    .replace(/(<br>\s*){3,}/g, '<br><br>')
    .replace(/<p><\/p>/g, '')
    .replace(/<p><br><\/p>/g, '<br>');
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// BIND CHAT EVENTS
// ============================================================
function bindChatEvents() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');

  if (input) {
    input.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
      if (sendBtn) sendBtn.disabled = !this.value.trim() || ChatState.isStreaming;
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) sendMessage(this.value);
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', function () {
      const input = document.getElementById('chat-input');
      if (input) sendMessage(input.value);
    });
  }

  // Quick topic chips
  const chipsWrap = document.getElementById('chat-chips-wrap');
  if (chipsWrap) {
    chipsWrap.addEventListener('click', function (e) {
      const chip = e.target.closest('.chip-btn');
      if (chip) {
        const query = decodeURIComponent(chip.dataset.query || '');
        if (query) {
          const input = document.getElementById('chat-input');
          if (input) input.value = query;
          sendMessage(query);
        }
      }
    });
  }

  // Settings button -> show Modal Cài đặt AI & Chế độ
  const gearBtn = document.getElementById('chat-settings-btn');
  if (gearBtn) {
    gearBtn.addEventListener('click', showChatSettingsModal);
  }
}

// ============================================================
// CHAT SETTINGS & MODE DIALOG
// ============================================================
function showChatSettingsModal() {
  const existing = document.getElementById('chat-settings-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id = 'chat-settings-modal';
  modal.className = 'api-key-modal-overlay';
  modal.innerHTML = `
    <div class="api-key-card" style="margin:auto;max-width:440px;width:90%;box-shadow:var(--shadow-lg);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div class="api-key-label" style="margin:0;">⚙️ Cài đặt Chatbot Shiori</div>
        <button id="close-chat-modal" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-muted);">✕</button>
      </div>

      <div style="font-size:0.83rem;color:var(--text-secondary);margin-bottom:14px;line-height:1.5;">
        Bạn có thể sử dụng Shiori theo 2 cách dưới đây:
      </div>

      <!-- Mode 1: Ngoại tuyến -->
      <div class="mode-select-card ${ChatState.mode === 'offline' ? 'active' : ''}" id="select-offline-mode" style="border:1.5px solid ${ChatState.mode === 'offline' ? 'var(--primary)' : 'var(--border)'};border-radius:var(--radius-md);padding:12px;margin-bottom:10px;cursor:pointer;background:var(--bg-white);">
        <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:var(--text-primary);">
          <span>⚡ Chế độ Ngoại tuyến (Khuyên dùng)</span>
          ${ChatState.mode === 'offline' ? '<span style="font-size:0.75rem;background:var(--primary-bg);color:var(--primary);padding:2px 8px;border-radius:99px;">Đang dùng</span>' : ''}
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">
          • Không cần mạng Internet, không cần API Key.<br>
          • Tốc độ phản hồi tức thì, không bao giờ bị quá tải (503).<br>
          • Nắm trọn 39 cẩm nang nhập học & Sổ tay sinh viên HUST 2026.
        </div>
      </div>

      <!-- Mode 2: Đám mây -->
      <div class="mode-select-card ${ChatState.mode === 'cloud' ? 'active' : ''}" id="select-cloud-mode" style="border:1.5px solid ${ChatState.mode === 'cloud' ? 'var(--primary)' : 'var(--border)'};border-radius:var(--radius-md);padding:12px;margin-bottom:12px;cursor:pointer;background:var(--bg-white);">
        <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:var(--text-primary);">
          <span>☁️ Chế độ Đám mây (Gemini Cloud)</span>
          ${ChatState.mode === 'cloud' ? '<span style="font-size:0.75rem;background:var(--primary-bg);color:var(--primary);padding:2px 8px;border-radius:99px;">Đang dùng</span>' : ''}
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">
          • Cần Gemini API Key (bắt đầu bằng <code>AIzaSy...</code> để ít bị quá tải).<br>
          • Có khả năng trò chuyện sáng tạo ngoài phạm vi cẩm nang.
        </div>
      </div>

      <div id="cloud-key-section" style="${ChatState.mode === 'cloud' ? 'display:block' : 'display:none'};margin-top:8px;">
        <div class="api-key-input-wrap">
          <input type="text" id="modal-api-key" class="api-key-input"
            value="${ChatState.apiKey || ''}" placeholder="Dán Gemini API Key (AIzaSy...)" autocomplete="off" spellcheck="false"/>
        </div>
        <div style="font-size:0.72rem;color:var(--text-muted);margin:4px 0 10px 0;">
          Lấy Key miễn phí tại: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style="color:var(--primary);font-weight:600;">aistudio.google.com/apikey</a>
        </div>
      </div>

      <button class="api-key-submit-btn" id="save-chat-settings-btn" style="margin-top:6px;">Lưu & Áp dụng</button>
    </div>
  `;

  document.body.appendChild(modal);

  // Events in modal
  const closeBtn = document.getElementById('close-chat-modal');
  if (closeBtn) closeBtn.addEventListener('click', () => modal.remove());

  const cardOffline = document.getElementById('select-offline-mode');
  const cardCloud = document.getElementById('select-cloud-mode');
  const keySection = document.getElementById('cloud-key-section');
  let chosenMode = ChatState.mode;

  cardOffline.addEventListener('click', () => {
    chosenMode = 'offline';
    cardOffline.style.borderColor = 'var(--primary)';
    cardCloud.style.borderColor = 'var(--border)';
    keySection.style.display = 'none';
  });

  cardCloud.addEventListener('click', () => {
    chosenMode = 'cloud';
    cardCloud.style.borderColor = 'var(--primary)';
    cardOffline.style.borderColor = 'var(--border)';
    keySection.style.display = 'block';
  });

  const saveBtn = document.getElementById('save-chat-settings-btn');
  saveBtn.addEventListener('click', async () => {
    ChatState.mode = chosenMode;
    if (chosenMode === 'cloud') {
      const input = document.getElementById('modal-api-key');
      const val = input ? input.value.trim() : '';
      if (val) {
        ChatState.apiKey = val;
        sessionStorage.setItem('hustbot_apikey', val);
        await setupGeminiChat();
        if (typeof showToast === 'function') showToast('✅ Đã bật Chế độ Gemini Cloud!');
      } else {
        ChatState.mode = 'offline';
        if (typeof showToast === 'function') showToast('⚡ Chưa có Key, chuyển về Chế độ Ngoại tuyến!');
      }
    } else {
      if (typeof showToast === 'function') showToast('⚡ Đã bật Chế độ Ngoại tuyến (Không cần mạng)!');
    }
    modal.remove();
    renderChatUI();
  });
}

// ============================================================
// EXPOSE GLOBALS
// ============================================================
window.ChatState = ChatState;
window.initChat = initChat;
window.setupGeminiChat = setupGeminiChat;
window.renderChatUI = renderChatUI;
window.sendMessage = sendMessage;
window.queryOfflineKnowledge = queryOfflineKnowledge;

// Pure chat-content filtering — no RN / Expo imports so it is Node-testable.
// Moved verbatim from Pdf.ts to keep the PDF agent's behaviour unchanged.

export interface PdfMessage {
  role: 'user' | 'bot' | string | number;
  content: string;
}

/** Lines that are internal status text and must never reach the PDF. */
const INTERNAL_PATTERNS = [
  /^جارٍ (التحليل|التنفيذ|التجميع|التحقق|إعادة المحاولة|الإصلاح|البحث|التحضير|إنشاء|تنظيم)/i,
  /^(Analyzing|Executing|Compiling|Verifying|Retrying|Fixing|Searching|Preparing|Organizing|Building|Rendering)\s*…?/i,
  /^\[Task level[:.]?\]/i,
  /^\[ نوع المهمة/,
  /^سأقوم الآن/i,
  /^I will now/i,
  /^تم إنشاء/i,
  /^[Ff]ile created/,
];

export function isInternalText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length <= 60 && INTERNAL_PATTERNS.some((re) => re.test(trimmed))) {
    return true;
  }
  return false;
}

export function cleanChatMessages(messages: PdfMessage[]): PdfMessage[] {
  return messages.filter(
    (m) =>
      m &&
      typeof m.content === 'string' &&
      m.content.trim() !== '' &&
      !isInternalText(m.content),
  );
}

export function messagesToMarkdown(messages: PdfMessage[]): string {
  const parts: string[] = [];
  for (const m of cleanChatMessages(messages)) {
    const label = m.role === 'user' ? 'المستخدم' : 'الوكيل';
    parts.push(`### ${label}\n\n${m.content}`);
  }
  return parts.join('\n\n');
}

export function conversationToPrompt(messages: PdfMessage[]): string {
  const cleaned = cleanChatMessages(messages);
  const body = cleaned
    .map((m) => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      return `[${role}]\n${m.content}`;
    })
    .join('\n\n');
  return body;
}
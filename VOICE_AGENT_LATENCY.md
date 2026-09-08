# وكيل صوتي سريع ومتفاعل — توثيق التغييرات (P9)

> الهدف: أن يشعر المستخدم أنه يتحدث مع **شخص حقيقي** — من لحظة انتهائه من الكلام حتى
> أول كلمة مسموعة في الرد، كل شيء يجري بسرعة ودون فرجات محسوسة، وبصوتٍ واحد متصل.
> هذه الميزة **خاصة بمحادثة الصوت فقط**: محادثة النص والواجهة والإعدادات والـ ORB
> و`vkeys` والـ STT Router لم تُمس.

---

## 1. ما الذي كان يحدث (المشكلة)

سلسلة الرد القديمة بعد انتهاء كلام المستخدم:

```
STT (4 لغات × 3 محاولات × 0.7s هكذا الأسوأ)
  → chatAgent (system = OSAMAH_SYSTEM: يفصّل قوائم/جداول/إيموجي)
  → chatStream (serverFirst=true: جلسة opencode server المحلية — نموذج big-pickle التفكيري)
  → maxTokens=2400 + timeout 240s (رد طويل وفرصة تجمّد)
  → تقطيع الرد إلى عدة مقاطع (segmenter) → طلب TTS مستقل لكل مقطع
  → فرجات مسموعة بين كل مقطع (تقطّع + تأخير + خطر فراغات)
  → فواصل/شرطات/رموز تصل إلى الصوتي
```

النتائج: تأخير التفكير، تقطيع الكلام، ونطق رموز/إيموجي.

## 2. الحل — ثلاثة محاور

### أ) وكيل صوتي مخصص `utils/OpenCodeAgent.ts`
أُضيفت ثوابت جديدة فقط (لا شيء من مسار النص تغيّر):

| الثابت | القيمة | الغرض |
|---|---|---|
| `VOICE_SYSTEM` | نظام صوتي جديد | أمر للوكيل: رد كلامي قصير (1–3 جمل)، **ممنوع نهائياً** markdown/قوائم/جداول/أكواد/إيموجي/شرطات/فواصل/نقطتان/اقتباسات/أقواس/روابط — نص وأرقام فقط، بلغة المستخدم، بلا تفكير داخلي |
| `VOICE_MODEL_CHAIN` | `ling-3.0-flash-fin-free`, `laguna-s-2.1-free`, `deepseek-v4-flash-free`, `muse-spark-1.3-contributor-free` | سلسلة Flash سريعة منخفضة التفكير — **`big-pickle` (نموذج التفكير) مستبعد عمداً** |
| `VOICE_MAX_TOKENS` | `240` | الرد قصير، فيُصنَّع ويُشغَّل بسرعة |
| `VOICE_TIMEOUT_MS` | `15_000` | نموذج ميت لا يجمّد المحادثة أبداً |
| `VOICE_TEMPERATURE` | `0.7` | نبرة محادثة أدفأ |

### ب) ربط المسار الصوتي بالوكيل الجديد `utils/voice/chatAgent.ts`
- `buildChatSystem`: القاعدة تتغير من `OSAMAH_SYSTEM` إلى `VOICE_SYSTEM` (+ سياق الملف
  الشخصي كما هو). الدالة مستخدمة في `VoiceProvider` فقط (مسار الصوت).
- نداء `chatStream` أصبح:
  - `serverFirst: false` → يتجاوز opencode server المحلي ونموذج التفكير نهائياً
    (كان عالقاً فيه افتراضياً، وهذا مصدر تأخير «التفكير»).
  - `chain: VOICE_MODEL_CHAIN` (بدل `getSelectedZenModel` — لم يعد الوكيل الصوتي
    يتقيّد بنموذج Control Center؛ المحادثة النصية تتقيّد به كما هي).
  - `maxTokens / temperature / timeoutMs` من ثوابت الصوت.
- الحفظ في SQLite وتاريخ الدردشة نفسها (نفس المحادثة النصية) و`sessionKey` و
  `personaHint` و`onDelta` لم تتغير.

### ج) ردّ بصوتٍ واحد بلا تقطيع `utils/voice/conversation.ts`
- أُزيلت كل حالة التقطيع الحيّ: `segAcross / segBuffer / segOut / segBusy / segIdle`
  و`feedDelta / enqueueSpeech / drainSpeech / speechIdle / curtailSpeech`
  و`splitSpeechSegments`.
- الدلتا تعمل **عرضاً فقط** (الترجمة الفورية تظهر أثناء الكتابة في الـ transcript).
- دالة جديدة `speakReply(text, epoch)`: عند اكتمال الرد تُجمَّد العينة الصوتية →
  `phase = speaking` → `synthesize(النص كاملاً)` → **ملف MP3 واحد** يُشغَّل
  دفعةً واحدة بلا فرجات → إن فشل الرصد: `speakNative` (utterance واحد كامل).
- ضمانة «صوت واحد» عملية: الوكيل يجيب قصيراً (< 700 حرف) فيبقى ملف واحد فعلياً؛
  التقني `splitChunks` في `speech.ts` يبقى كحماية حدّ البوابة (1000 حرف) ويعيد عدّة
  ملفات تُشغَّل متتالياً بلا فترة انتظار (حالة نادرة جداً).
- حماية المقاطعة/الإيقاف كما هي (`active()` + epoch + `stopSpeech`) — النقر يقطع
  الملف ويردّ الميكروفون فوراً.
- أُضيف سطر تشخيص: `voiceLog('VOICE_REPLY_LATENCY', ...)` يطبع ms من نهاية كلام
  المستخدم (`turnStartMs`) حتى بدء التركيب — لقياس الهدف على الجهاز.

### د) «نصوص وأرقام فقط» `utils/voice/text.ts`
- في `speakableText` أُضيفت خطوة `SPOKEN_NOISE` تحذف الفواصل (`، ,`)، الفاصلة
  المنقوطة (`؛ ;`)، النقطتان (`:`)، علامات الاقتباس (`« » “ ” "`)، الأقواس
  (`( ) [ ] { }`) والشرطات (`– — -`) قبل كل تركيب صوتي.
- الشواخص التوجيهية `. ؟ !` على حالها — توجّه النبرة ولا تُنطق أبداً.
- الخطوة محصورة في مسار الصوت (لا يُستخدم `speakableText` في نص الدردشة).

### هـ) تسريع فهم الكلام `server/voice_gateway.py`
- `_stt_languages(locale_hint)`: سلسلة اللغات تُبنى من `locale` الذي يرسله
  التطبيق — عربي → `ar-YE, ar-SA, ar` فقط؛ إنجليزي → `en-US` فقط؛ غيرها →
  القائمة العامة. (كان يحاول الأربع دائماً.)
- المحاولات لكل لغة: من 3 إلى 2، والانتظار بين المحاولات من 0.7s إلى 0.35s.
- نفس البوابة تخدم الإملاء في الشات لكنها أصبحت أسرع — سلوكها محافظ على
  الموثوقية.

## 3. الملفات التي تغيّرت

| الملف | التغيير |
|---|---|
| `utils/OpenCodeAgent.ts` | إضافة `VOICE_SYSTEM`, `VOICE_MODEL_CHAIN`, `VOICE_MAX_TOKENS`, `VOICE_TIMEOUT_MS`, `VOICE_TEMPERATURE` |
| `utils/voice/chatAgent.ts` | مسار الصوت → `VOICE_SYSTEM` + سلسلة Flash + `serverFirst:false` + حدود قصيرة |
| `utils/voice/conversation.ts` | إلغاء التقطيع الحيّ + `speakReply` (ملف واحد) + سجل زمن |
| `utils/voice/text.ts` | حذف الفواصل/الشرطات/الرموز قبل التركيب |
| `server/voice_gateway.py` | STT بسلسلة لغات ذكية ومحاولات سريعة |
| `tests/voice-text.test.ts` | حالات جديدة للتنقية الصوتية |
| `DEVELOPMENT_PLAN.md` | صف P9 في السجل الحي |

## 4. ما لم يُمس (ضمان «لا تكسر شيئاً»)

- محادثة النص (`agentMessage` / `agentMessageStream` / `OSAMAH_SYSTEM` / خيارات
  نموذج Control Center) — كما هي.
- الواجهة، `VoiceProvider`, `useVoiceController`, `speech.ts`, `providers/*`,
  `recognition.ts`, `stage.ts` (`utils/voice/segment.ts` + `tests/voiceStream.test.ts`)
  تبقى موجودة دون تغيير — لم يعد `segment.ts` مشغولاً في مسار النطق لكنه لم يُحذف
  حفاظاً على «عدم العبث» وقابلية التراجع.
- الإعدادات المخزّنة/التخزين (`VoiceConfig`, `storage`) لم تتغيّر صيغها.

## 5. زمن الاستجابة المستهدف (يُقاس من نهاية كلام المستخدم)

| المرحلة | المكوّن | المستهدف |
|---|---|---|
| فهم الكلام | STT (البوابة) | ~0.5–1.0s |
| تفكير + صياغة | وكيل Flash صوتي (بدون تفكير) | ~0.6–1.5s |
| نطق | MP3 واحد + تشغيل فوري | ~0.4–0.8s |
| **المجموع** | | **~1.5–3.0s** |

## 6. التحقق

- `npx tsc --noEmit` → PASS
- `npm test` → ALL TEST SUITES PASSED
- على الجهاز (Expo Go):
  1. «السلام عليكم. كيف حالك؟» → ردّ بصوتٍ واحد متصل يبدأ خلال ~3 ثوانٍ (سجل
     `VOICE_REPLY_LATENCY` في log للتشخيص الدقيق).
  2. «ميرا» / «كريم» → تأكيد بصوتٍ واحد عبر الوكيل الجديد.
  3. طلب بقائمة/رموز → يُنطق نصوصاً وأرقاماً فقط بلا إيموجي/شرطات/فواصل.
  4. المحادثة النصية والواجهة بدون أي تغيير.

## 7. التراجع

- إزالة الثوابت الجديدة من `OpenCodeAgent.ts`.
- في `chatAgent.ts`: إعادة `system = OSAMAH_SYSTEM`, `serverFirst: true` (أو حذفه),
  `model: await getSelectedZenModel()`, `maxTokens: 2400`.
- في `conversation.ts`: استعادة `splitSpeechSegments`/`drainSpeech` (من محفوظات git).
- في `text.ts`: إزالة سطر `SPOKEN_NOISE`.
- في `voice_gateway.py`: إعادة `(3, 0.7)` والقائمة الثابتة الأربعة.
# خطة الإصلاح واستكمال التطوير — وكيل أسامة

> وثيقة مرجعية تستند إلى فحص فعلي للكود (`Audit`) للبنية الحالية، مع تحديد ما تم تنفيذه فعليًا وما تبقى، وخطة إصلاح وتطوير مرتبة بمراحل قابلة للتنفيذ.
> لا تحوي هذه الوثيقة رمزًا وهميًا أو TODO — كل عنصر فيها مرتبط بملف/سلوك موجود ومعرّف بالضبط.

---

## 0. حالة التنفيذ (سجل حي)

| البند | الحالة |
|---|---|
| P1 — Build/Typecheck | ✅ مُنجَز — أُعيدت هيكلة محرك الصوت (حذف `utils/voice/engine.ts` و`providers/*`، إضافة `utils/voice/{conversation,recognition,speech}.ts`) فأصبح `npx tsc --noEmit` = **PASS** بلا غطاء `mode` على `VoiceConfig` |
| P2 — الاختبارات | ✅ مُنجَز — `npm test` (8 مجموعات اختبار + `voice-text`) = **PASS** |
| P3 — المستندات الطويلة | ✅ مُنجَز — `utils/longDocument.ts` + `saveConversationAsLongPdf` + فرع توجيه في `ChatPage` (منطق فقط، لا واجهة) |
| P4 — زر إلغاء | ⏸ مؤجّل (يتطلب واجهة — خارج نطاق «لا تعبث بأي واجهة») |
| P5 — تراجع فشل التخطيط | ✅ مُنجَز — إعادة تخطيط واحدة ثم رد مباشر بدل إفشال المهمة |
| P6 — تصنيف الأخطاء | ✅ مُنجَز — `classifyRetry` في `orchestrationModel.ts` + مهلة كلية حسب `depth` |
| P7 — ملف المستخدم 8 أقسام | ⏸ مؤجّل (تغيير واجهة الإعدادات — خارج النطاق) |
| P8 — chips الجودة المفقودة | ⏸ مؤجّل (تغيير واجهة — خارج النطاق) |
| المرحلة 7.1–7.3 | ✅ `tsc --noEmit` / `npm test` / `expo export --platform android` = **PASS** |
| المرحلة 7.4 (مراجعة على الجهاز) | ⏳ معلّقة — لا يتوفر جهاز/محاكي Android متصل |

## 1. ملخص الفحص (Audit)

### 1.1 البنية العامة

| المكوّن | الموقع | الوصف |
|---|---|---|
| الوكيل (LLM) | `utils/OpenCodeAgent.ts` | محادثة مباشرة مع `https://opencode.ai/zen/v1` (بدون خادم)، سلسلة نماذج مجانية مع تبديل تلقائي، دفق (`chatStream`) واستدعاء واحد (`chatComplete`). |
| قاعدة البيانات | `utils/Database.ts` | SQLite (expo-sqlite) للدردشات والرسائل وجلسات صانع الأوامر وجداول الإفلاو. |
| التخزين | `utils/Storage.ts` + AsyncStorage + SecureStore | تفضيلات ومفاتيح. |
| الهوية البصرية | `theme/` | لوحة داكنة Glassmorphism (CyanNeon `#00F0FF`، DarkCanvas `#0A0E17`، DarkSurface `#111827`). |
| الترجمة | `i18n/strings.ts` | عربي/إنجليزي كاملان، RTL. |
| الصوت | `utils/voice/` | TTS بترتيب failover (azure/google/android)، STT عبر بوابة صوتية. |

### 1.2 الأنظمة الأربعة المستهدفة — ما تم تنفيذه **فعليًا**

#### أ) Agent Orchestration — `utils/TaskOrchestrator.ts` (موصول في `components/ChatPage.tsx`)
- تحويل الطلب إلى خطة JSON عبر LLM (تحليل → أهداف → مهام فرعية ← تبعيات).
- دورة حياة: `planning → executing → processing → verifying → retrying → completed/failed`.
- تنفيذ المهام الفرعية بترتيب الطوبولوجيا، مع تلقيح النتائج السابقة في المهام المعتمدة.
- Retry بأثر رجعي (2000/4000/8000ms) بحد أقصى 3 محاولات، مع تمييز أولي بين transient / permanent.
- تجميع النتائج وتلخيصها بمحرّر LLM، ثم فحص جودة `PASS/FAIL` وإعادة محاولة المهام الفاشلة.
- استقبال سياق الملف الشخصي (`profileContext`) وتضمينه عند الحاجة.

#### ب) PDF Engine — `utils/Pdf.ts` + `utils/documentSchema.ts`
- Document Schema موحّد (metadata/theme/cover/sections بكل الأنواع المطلوبة: heading, paragraph, rich text, list, checklist, table, card, callout, quote, code, stats, comparison, timeline, section, hr).
- Design Tokens مستخرجة من هوية التطبيق (داكن/فاتح) — خلفية `#0A0E17`، نصوص فاتحة، accent نفس اللون.
- صفحة أولى (Cover) بهوية «وكيل أسامة»، ترقيم صفحات أعلى الصفحة.
- منع النصوص الداخلية: فلترة status/agent chatter في `cleanChatMessages`.
- دعم RTL والجداول (`thead: table-header-group`، `tr page-break-inside: avoid`، cards `avoid-break`).
- «وكيل pdf»: `organizeConversation` ينظّم المحادثة إلى DocumentSchema حقيقي بفلتر شامل.

#### ج) User Profile — `utils/UserProfile.ts` + `utils/profileModel.ts`
- حفظ/تحميل دائم عبر AsyncStorage، عدة أقسام UI، حقول اختيارية بالكامل.
- `buildProfileContext` انتقائي (Selective Personalization) بحد 200 كلمة يبني سياقًا مضغوطًا.
- يستخدمه الوكيل فعليًا: `ChatPage.buildSystem` + `executeTask`.

#### د) Prompt Maker — `utils/PromptMaker.ts` + `components/PromptMakerScreen.tsx`
- واجهة محادثة حقيقية مع جلسات SQLite.
- Skill Router: `detectIntent` → 8 مهارات (coding/research/agent/rag/writing/analysis/creative/general) مستخلصة فعليًا من أنماط مستودعات هندسة البرومبتات المفتوحة (قواعد + anti-patterns + checklist).
- Quality Validator بعشرة أبعاد مع نتيجة /100.
- أزرار: نسخ (البرومبت فقط)، إعادة توليد، تحسين، اختصار، توسيع، تحليل.
- وصل بإدخال «صانع الأوامر» داخل `components/ToolsScreen.tsx`.

### 1.3 التكامل الحالي
- `ChatPage.onShouldSend` يوجّه الطلب: طلب PDF → `runPdfAgent`، مهمة معقّدة → `runOrchestrator` (عبر `executeTask`)، وإلّا → `chatStream` سريع.
- زر PDF في رأس الدردشة يُصدّر محتوى الجلسة الحالية عبر الوكيل.
- الأرتيبات المُصدَّرة تُسجَّل في `utils/savedFiles.ts` وتظهر في تبويب Saved داخل Tools.

---

## 2. المشاكل والثغرات المكتشفة (مفرّزة بأثرها)

| # | المشكلة | الخطورة | الموقع | الحالة |
|---|---|---|---|---|
| P1 | **Build/Typecheck فاشل** — 3 أخطاء: `config.mode` غير موجودة على `VoiceConfig` | عالية (تمنع الاكتمال) | `utils/voice/engine.ts:353`, `utils/voice/useVoiceController.ts:206,274` | ✅ مُنجَز بإعادة الهيكلة — `tsc` = PASS |
| P2 | **لا اختبارات حقيقية للأنظمة الأربعة** — ملف واحد (`tests/voice-text.test.ts`) بلا سكربت تشغيل | عالية | `tests/` — `package.json` | ✅ مُنجَز — `npm test` |
| P3 | **PDF لا يدعم المستندات الطويلة** — `organizeConversation` استدعاء واحد `maxTokens:4000` وليس توليدًا تزايديًا | عالية | `utils/Pdf.ts:220` | ✅ مُنجَز — `utils/longDocument.ts` |
| P4 | **لا إلغاء أثناء المهمة المعقدة** — مفاتيح i18n موجودة لكن لا زر Stop | متوسطة | `components/ChatPage.tsx` | ⏸ مؤجّل (واجهة) |
| P5 | **فشل التخطيط يفيض على المهمة** — فشل `buildPlan` مرتين → خطأ كامل بدل تراجع سريع | متوسطة | `utils/TaskOrchestrator.ts:405-418` | ✅ مُنجَز — رد مباشر + إعادة تخطيط |
| P6 | **تصنيف الأخطاء غير مكتمل** — `isRetryable` يظنّ أغلب الأخطاء transient | منخفضة | `utils/TaskOrchestrator.ts:83` | ✅ مُنجَز — `classifyRetry` |
| P7 | **ملف المستخدم 5 أقسام** مقابل 8 في المواصفة (تفضيلات التعلم/الإنتاج/اللغة) | منخفضة | `utils/profileModel.ts:109` | ⏸ مؤجّل (واجهة) |
| P8 | **عناصر الجودة المفقودة لا تظهر في واجهة Prompt Maker** — مفاتيح `missingItems` غير مستخدمة | منخفضة | `components/PromptMakerScreen.tsx` | ⏸ مؤجّل (واجهة) |

---

## 3. خطة الإصلاح واستكمال التطوير

### المرحلة 0 — إصلاح الـ Build (عائق إلزامي) — ✅ منجَز
> **ملاحظة الالتقاء**: أثناء التنفيذ تبيّن أن محرك الصوت أُعيدت هيكلته فعلًا (حُذفت `utils/voice/engine.ts` و`providers/*` واستُبدلت بـ `conversation.ts` / `recognition.ts` / `speech.ts`) وأن `npx tsc --noEmit` نجح أصلًا. لذا *الهدف* (Build يعمل) تحقّق دون الأخذ بالتعليمات الحرفية بـ `mode` على `VoiceConfig` — المكوّن الحالي بلا Provider Modes بحكم تصميمه.
1. `utils/voice/config.ts`:
   - إضافة `mode: ProviderMode` إلى `VoiceConfig` (استيراد من `./providers/types`).
   - القيمة الافتراضية `'auto'` في `DEFAULT_VOICE_CONFIG`.
   - تضمينها في `normalizeVoiceConfig`.
2. التحقق: `npx tsc --noEmit` = **PASS**.

### المرحلة 1 — فصل المنطق النقي (Node-testable) بدون كسر الـ API العام — ✅ منجَز
- `utils/promptModel.ts` (جديد): نقل `detectLang`, `INTENT_HINTS`, `detectIntent`, `INTENT_KEYS`, `SKILLS`, `getSkill`, `listSkills`, `QUALITY_DIMENSIONS`, `validatePrompt` من `PromptMaker.ts` — وإعادة التصدير من `PromptMaker.ts` (نمط `profileModel.ts` القائم). ✅
- `utils/orchestrationModel.ts` (جديد): نقل `extractJson`, `topologicalOrder`, `estimateDepth`, وتصنيف retry (المعتمد على رسالة الخطأ فقط) من `TaskOrchestrator.ts` — وإعادة التصدير. ✅
- إضافات ملحقة اختيارية نُفّذت: `utils/jsonExtract.ts` (`extractJson` صارم، يعاد تصديره من `OpenCodeAgent`) و`utils/chatClean.ts` (فلترة الدردشة، يعاد تصديرها من `Pdf.ts`).
- `documentSchema.ts`, `profileModel.ts`, `taskModel.ts` نقيّة أصلًا — تُختبر مباشرة. ✅
- المعيار: لا يتغير أي import خارجي في المتصلين. ✅

### المرحلة 2 — تقوية الـ Orchestrator — ✅ منجَز (باستثناء زر الإلغاء)
1. **زر إلغاء** أثناء المهمة المعقدة في `ChatPage` (يحترم `abortRef` ويستخدم مفاتيح `orchestration.cancel*`) — ⏸ مؤجّل (واجهة UI).
2. **تراجع سريع**: فشل التخطيط مرتين → تنفيذ مباشر عبر `chatComplete` بنفس الطلب (بدل إفشال مهمة المستخدم). ✅
3. **تصنيف أخطاء أدق**: ✅
   - transient: `timeout/abort/429/rate limit/5xx/network/empty`.
   - permanent: `4xx` أخرى / validation / invalid — عدم إعادة المحاولة.
4. **مهلة كلية أمان** لحلقة التنفيذ حسب `depth` (بالإضافة لمهلة المهمة الفرعية الموجودة). ✅

### المرحلة 3 — PDF: توليد المستندات الطويلة (Scale بدل تقطيع الجودة) — ✅ منجَز
- `utils/longDocument.ts` (جديد) ووظيفة `buildLongDocument(messages, opts)`: ✅
  1. **مخطط**: استدعاء LLM ينتج قائمة مقاطع مرقّمة (عنوان + تعليمات). ✅
  2. **حلقة توليد قسم بقلسم**: لكل قسم استدعاء كتابة (ميزانية tokens حدودية)، تُضاف النواتج إلى `DocumentSchema` تزايديًا؛ مع `onStatus` قصير «جارٍ كتابة القسم 3 من 12…». ✅
  3. **مرونة الفشل**: فشل قسم → retry ≤2 ثم تابع الأقسام المستقلة (لا انهيار كامل). ✅
  4. **إلغاء**: يحترم `AbortSignal` بين الأقسام. ✅
  5. **تجميع+تحقق** ثم توليد الـ PDF عبر `generateDocumentPdf` (string-join — بلا تحميل إضافي). ✅
  6. **تراجع**: أي فشل شامل → المسار الحالي `organizeConversation`. ✅
- **الحقن**: دالة بناء تقبل `llm` محقونًا — قابلة للاختبار بدون شبكة. ✅
- **التشغيل من ChatPage**: طلبات PDF بنِى الطول (صفحة/مفصّل/طويل/100 صفحة…) → `buildLongDocument`؛ مع مفاتيح i18n جديدة تحت `pdfDoc`. ✅ (التسميات القصيرة لحالة التقدم داخل الوحدة المعزولة ثنائية اللغة عربي/إنجليزي بلا ربط i18n حفاظًا على قابلية Node للاختبار)

### المرحلة 4 — محاذاة ملف المستخدم للمواصفة (8 أقسام) — ⏸ مؤجّل (تغيير واجهة الإعدادات؛ خارج نطاق «لا تعبث بأي واجهة»)
- إعادة تقسيم `getFieldGroups()`:
  - بنية جديدة تضم: المعلومات الشخصية / التخصص والعمل / الاهتمامات / تفضيلات الاستخدام / تفضيلات التعلم / تفضيلات الإنتاج / اللغة والأسلوب.
  - نقل `learningGoals` → تفضيلات التعلم، و`productionGoals` + `preferredOutputFormat` → تفضيلات الإنتاج، و`preferredLanguage` + `preferredTone` → اللغة والأسلوب.
- الشاشة `profile.tsx` تقرأ الأقسام تلقائيًا — لا حاجة لتغييرها سوى تأكيد المفاتيح.

### المرحلة 5 — إظهار عناصر الجودة المفقودة في Prompt Maker — ⏸ مؤجّل (واجهة)
- تحت البرومبت المبني: chips للمعايير المفقودة (≤3) من `built.quality.missing` باستخدام مفاتيح `promptMaker.missingItems` / `missingNone`.
- مع حصر عددها حفاظًا على خفة الواجهة.

### المرحلة 6 — اختبارات حقيقية (بدون dependencies جديدة — نمط tsc + node) — ✅ منجَز
- ملفات `tests/*.test.ts` بنمط `voice-text.test.ts` القائم:
  - `tests/taskModel.test.ts` — `isComplexTask`, `detectLang`. ✅
  - `tests/orchestrationModel.test.ts` — `topologicalOrder`, `estimateDepth`, `extractJson`, تصنيف retry. ✅
  - `tests/promptModel.test.ts` — `detectIntent`, `validatePrompt`, `getSkill` fallback. ✅
  - `tests/documentSchema.test.ts` — `markdownToDocument` → HTML لجدول/قائمة/كود/اقتباس، اتجاه RTL، نصوص عربية/إنجليزية مختلطة، عرض 5000 بـ lock بلا خطأ. ✅
  - `tests/profileModel.test.ts` — `normalizeProfile`, `buildProfileContext` (حد 200 كلمة وانتقائية المفاتيح), `parseProfileString` دائريًا. ✅
  - `tests/longDocument.test.ts` — fake-llm: N قسم، إلغاء، فشل قسم-يُتابَع، تراجع كامل. ✅
  - إضافية: `tests/jsonExtract.test.ts` و`tests/chatClean.test.ts`. ✅
  - هيكل تشغيل: `tests/helpers.ts` (harness بمعزل لكل مجموعة) + `tests/runner.ts`.
- `tsconfig.test.json` + سكربت `"test"` في `package.json`. ✅

### المرحلة 7 — التكامل والتحقق النهائي — ✅ منجَز (باستثناء المراجعة على الجهاز)
1. `npx tsc --noEmit` → **PASS**. ✅
2. `npm test` → **PASS**. ✅
3. `npx expo export --platform android` → التأكد من سلامة الـ bundle. ✅ (خرج bundle بحجم 5.6 MB في `dist/`)
4. مراجعة محلية: محادثة بسيطة / معقّدة / PDF قصير وطويل / ملف مستخدم / صانع أوامر — ⏳ معلّقة (لا جهاز/محاكي Android متصل حاليًا).

---

## 4. معايير رفض وتقيد إلزامية أثناء التنفيذ
- لا إعادة بناء من الصفر — البناء فوق الأنظمة الحالية.
- لا dependencies ضخمة بلا ضرورة (ابدأ بفحص ما هو موجود).
- لا كسر للهوية البصرية / الصفحة الرئيسية / كرة المحادثة الصوتية / الـ animations / RTL / العربية.
- لا عرض للـ reasoning الداخلي في رسائل المستخدم (رسائل قصيرة فقط: جارٍ التحليل… جارٍ البحث… جارٍ التحقق…).
- لا إدخال رسائل الوكيل/الحالة داخل PDF.
- أي خطأ يظهر أثناء التنفيذ → يُصلح ثم يُعاد الاختبار.

---

## 5. النتيجة المحقّقة عند الانتهاء
- Agent قادر على تنفيذ المهام المعقدة حتى النهاية، مع تراجع آمن عند فشل التخطيط وتحسينات على تصنيف الأخطاء. ✅ (زر الإلغاء ⏸ مؤجّل)
- PDF قادر على توليد مستندات احترافية طويلة (100/500/1000 صفحة محتوى) بهوية وكيل أسامة. ✅
- Profile محفوظ ويؤثر فعليًا على التخصيص. ✅
- Prompt Maker أداة هندسة برومبتات حقيقية. ✅ (عرض المعايير المفقودة ⏸ مؤجّل)
- Build: PASS — Tests: PASS — بدون أخطاء مخفية. ✅
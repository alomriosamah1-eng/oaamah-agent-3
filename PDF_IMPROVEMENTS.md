# تحسين نظام PDF — خطة التنفيذ وسجلّ التغييرات

> الوثيقة المرجعية لميزة «PDF المحسّن» في تطبيق وكيل أسامة.
> الغرض: توثيق القرارات والحدود والخطوات حتى يستطيع أي مطوّر آخر (أو مساعد)
> مراجعة العمل أو العودة إليه دون كسر أي نظام آخر.

---

## 1. الأهداف المعتمدة

1. **إخراج طباعة نظيف**: صفحة بيضاء (`#FFFFFF`) مع نص داكن جداً وبخط عريض
   — مع الحفاظ على أحجام العناوين/الفقرات (h1=2em، h2=1.6em، h3=1.3em، h4=1.1em، p=1em).
2. **إزالة «وكيل أسامة» من الملف نهائياً** (الغلاف/المعلومات/التذييل): لا علامة
   مائية ولا شارة ثابتة — ترويسة كل صفحة تحمل **رقم الصفحة فقط** (`@top-right`).
3. **أيقونة غلاف كبيرة ديناميكية** تناسب موضوع المحتوى (`coverIconFor`/`resolveCoverIcon`:
   الذكاء الاصطناعي 🤖، السفر ✈️، الصحة 🩺، المال 💰، المطبخ 🍳، … مع قائمة مقبولة).
4. **المحتوى فقط**: لا يُضمَّن حوار المستخدم مع الوكيل ولا أي نص جانبي في محتوى الملف.
5. **تسمية الملفات بعنوان محتوى المستند** (`outcome.title` = `schema.metadata.title`)
   في المحفوظات بدلاً من العناوين العامة/التواريخ.
6. **توليد لا يفشل أبداً**: إعادة محاولة عند فشل الطباعة، ثم تقسيم المستند الضخم
   إلى أجزاء (`groupBlocksForParts`) يخرج كلٌّ منها ملف PDF («الجزء i من n»).
7. **عرض تقدّم حيّ**: نسبة مئوية + زمن منقضٍ في رسالة الحالة أثناء التوليد.
8. **عارض مستند داخل التطبيق** (بدون إعادة بناء): نعرض نسخة «الطباعة» HTML عبر
   `react-native-webview` (موجود في Expo Go SDK 54)، مع زرّي مشاركة/حذف **وزر خروج**،
   ورسالة احتياطية إذا غابت المعاينة.

---

## 2. القيود التقنية (لماذا هذا الطريق)

- المستخدم يختبر **Expo Go على iPhone فقط** ⇒ `react-native-pdf` غير صالح (يحتاج
  build ناتيف). الاختيار النهائي: **WebView + نسخة طباعة HTML** معروضة بنفس
  التنسيق، والـ PDF الحقيقي يُولَّد ويُحفَظ كما هو ويُشارَك عبر النظام.
- `documentSchema.ts` **لا يستورد أي وحدة أصلية/Expo** ⇒ كل منطق العرض/الطباعة
  قابل للاختبار في Node عبر `utils/pdfPrint.ts` (وحدة صافية).
- `Pdf.ts` يبقى غلافاً رفيعاً فوق `expo-print`/`expo-sharing` ولا يُستورد في اختبارات Node.

---

## 3. الملفات المعنية

### ملفات جديدة
| الملف | الدور |
|---|---|
| `utils/pdfPrint.ts` | وحدة صافية (Node-testable): `deriveDocumentTitle`, `sanitizePdfName`, `coverIconFor`, `resolveCoverIcon`, `groupBlocksForParts`, `buildPrintPageCss`, `injectPrintCss`, `renderPrintHtml`, `pdfPercent` |
| `app/(auth)/(modal)/pdf/[uri].tsx` | عارض المستند داخل التطبيق (WebView) + مشاركة/حذف/خروج + احتياطي بلا معاينة |
| `tests/pdfPrint.test.ts` | 12 فحصاً: العناوين، التقسيم، CSS الصفحات (رقم فقط)، الأيقونات، ألوان الطباعة، دالة التقدّم |
| `PDF_IMPROVEMENTS.md` | هذه الوثيقة |

### تعديلات على ملفات موجودة
| الملف | التغيير |
|---|---|
| `utils/documentSchema.ts` | `ThemeTokens` واجهة هيكلية + `textWeight` لكل وضع + وضع `print` (خلفية بيضاء/نصوص داكنة عريضة) + حقل `cover.icon` يُعرض كبيراً (88px) على الغلاف + حذف التذييل «تم الإنشاء على الجهاز» + `padding-inline-start` بدل right/left |
| `utils/Pdf.ts` | إزالة العلامة الشخصية/الشارة من الغلاف واستبدالها بأيقونة موضوع `resolveCoverIcon`، `theme.mode='print'`، `generateDocumentPdf` يرجّع `PdfOutcome {files,title}` بإعادة محاولة + تقسيم أجزاء، الحالتان (قصيرة/طويلة) تعيدان `PdfOutcome` (التي تحمل `title` اسم الملف) وتُبلغان `onStatus(phase,label,current,total,{percent,elapsedMs})` |
| `utils/longDocument.ts` | `author:''`، `theme.mode='print'`، أيقونة الغلاف = `resolveCoverIcon(undefined, topicText)` (بدل الشارة) |
| `utils/savedFiles.ts` | حقل `previewHtml` في `SavedFileRef` + كتابة/حذف الملف المرافق `.preview.html` في `addSavedFile`/`removeSavedFile` |
| `components/ChatPage.tsx` | اسم ملفات محفوظة من `outcome.title` (عنوان محتوى المستند)، تسجيل كل ملف بإسم نظيف + معاينة HTML، حالة `% • s` و«جزء i من n» |
| `components/ToolsScreen.tsx` | فتح PDF → عارض `/pdf/[uri]` (مع `id` و`preview`) بدلاً من المشاركة المباشرة |
| `i18n/strings.ts` | كتلة `pdfViewer` (شامل `close`) + تحييد `pdfDoc.coverTitle`/`dialogTitle` (عربي + إنجليزي إلزاميان) |
| `tests/documentSchema.test.ts` / `tests/longDocument.test.ts` | تحديث توقّعات الوضع الجديد (print/بدون تذييل/أيقونة) |
| `tests/runner.ts` | تسجيل `pdfPrint.test` (سطر واحد) |
| `package.json` | إضافة `react-native-webview` عبر `npx expo install` |

---

## 4. التنسيق المطبوع (Print tokens)

`designTokens.print` (بدون أي تعديل على أحجام العناوين):
- `background: #FFFFFF` — صفحة بيضاء.
- `textPrimary: #111827` مع `textWeight: "600"` — نص عريض داكن جداً.
- العناوين: h1 `#0F172A`، h2 `#1E3A8A`، h3 `#4C1D95`، h4 `#9D174D`.
- ترويسة الصفحة: **رقم الصفحة فقط** `@top-right` بحجم 9px (لا شيء آخر — لا ماء ولا شارة).
- أيقونة الغلاف: «أيقونة كبيرة» (`font-size:88px`) من `cover.icon` المختارة حسب الموضوع.
- `print-color-adjust: exact` داخل `@media print`.

---

## 6. ضمانات عدم الكسر

1. `documentSchema` و `pdfPrint` و `longDocument` لا تستورد Expo/RN ⇒ كلها
   تعمل في مضمار الاختبارات Node.
2. `Pdf.ts` بقي غلافاً رفيعاً؛ `renderBlocksHtml` و `markdownToHtml` و
   `generatePdf`/`saveMarkdownAsPdf` (الاستخدامات القديمة) حافظت على تواقيعها.
3. المعاينة احتياطية: الغياب لا يكسر شيئاً — يُعرض نصّ «لا توجد معاينة» مع
   مشاركة/حذف.
4. التوليد لا يفشل صامتاً: إعادة محاولة ← تقسيم أجزاء ← خطأ صريح فقط إذا لم
   يُكتب أي ملف نهائياً.
5. التحقق النهائي: `npm run typecheck` و `npm test`.

---

## 7. سجلّ التنفيذ (يُحدَّث بعد كل خطوة)

- [x] توثيق الخطة وحفظها هنا.
- [x] `utils/documentSchema.ts` — واجهة `ThemeTokens` + `textWeight` + وضع `print` +
      حقل `cover.icon` + حذف التذييل + `padding-inline-start`.
- [x] `utils/pdfPrint.ts` — ترقيم الصفحات فقط (بدون ماء) + `coverIconFor`/`resolveCoverIcon` +
      العناوين/التقسيم/CSS الصفحات/التقدّم (وحدة صافية).
- [x] `utils/Pdf.ts` — إزالة العلامة/الشارة، غلاف بأيقونة الموضوع،
      `generateDocumentPdf`→`PdfOutcome {files,title}`، إعادة محاولة + أجزاء،
      `onStatus` بتقدّم وزمن، print في الحالتين.
- [x] `utils/longDocument.ts` — `author:''` + `mode:'print'` + أيقونة الغلاف حسب الموضوع.
- [x] `utils/savedFiles.ts` — معاينة HTML مرافقة + حذفها مع الملف.
- [x] `components/ChatPage.tsx` — اسم الملف من `outcome.title` + حالة `% • s` + تسجيل كل ملفات الأجزاء.
- [x] `app/(auth)/(modal)/pdf/[uri].tsx` — عارض WebView + مشاركة/حذف/خروج + احتياطي.
- [x] `components/ToolsScreen.tsx` — فتح PDF عبر العارض.
- [x] `i18n/strings.ts` — كتلة `pdfViewer` مع `close` (ar + en) + تحييد `pdfDoc`.
- [x] `npx expo install react-native-webview` (`13.15.0`).
- [x] اختبارات: تحديث `documentSchema`/`longDocument` + جديد `pdfPrint` (12 فحصاً) + تسجيل بالرنر.
- [x] `npm run typecheck` و `npm test` ناجحان.

---

## 9. سجلّ التشغيل (ما تم بالفعل — لتُراجع من الغير)

> نُفِّذ في جلسة واحدة، ولم يُمسَّ أي ملف يخصّ مساعدين آخرين
> (voice / flow / prompt-maker / server / search …).

### ملفات جديدة (4)
1. `utils/pdfPrint.ts` — المنطق الصافي بأكمله (عناوين/تقسيم/CSS/تقدّم).
2. `app/(auth)/(modal)/pdf/[uri].tsx` — العارض داخل التطبيق.
3. `tests/pdfPrint.test.ts` — 10 فحوصات.
4. `PDF_IMPROVEMENTS.md` — هذه الوثيقة.

### تعديلات على ملفات موجودة (موضعية)
| الملف | التعديل |
|---|---|
| `utils/documentSchema.ts` | `ThemeTokens` هيكلية + `textWeight` (dark=400/light=500/print=600) + وضع `print` + حقل `cover.icon` ليُعرض كبيراً على الغلاف + حذف تذييل «تم الإنشاء» + `font-weight` للمتن/القوائم/الجداول/البطاقات/الاقتباسات/التايملاين/الكول أوت + `padding-inline-start` بدل right/left |
| `utils/Pdf.ts` | `author:''`، الغلاف: أيقونة `resolveCoverIcon(icon, topicText)` بدل `coverBadge`، `theme.mode='print'`، `generateDocumentPdf(schema,{mode})`→`PdfOutcome {files[], title?}` (إعادة محاولة ×2 ثم أجزاء)، `saveConversationAsPdf`/`AsLongPdf`→`Promise<PdfOutcome>` مع `onStatus(...,progress)` و`title` = عنوان المحتوى لاسم الملف |
| `utils/longDocument.ts` | `author:''`، `theme.mode='print'`، `cover.icon=resolveCoverIcon(undefined, topicText)` |
| `utils/savedFiles.ts` | `previewHtml?: string` في الـ ref + كتابة `<name>.preview.html` وحذفها |
| `components/ChatPage.tsx` | `registerPdfFiles` (اسم من `outcome.title`/`sanitizePdfName` + لاحقة «الجزء i من n») + حالة `label • % • s` |
| `components/ToolsScreen.tsx` | `openFile` لـ PDF → `router.push('/pdf/[uri]', {uri,id,preview})` |
| `i18n/strings.ts` | كتلة `pdfViewer` (شامل `close`) + `pdfDoc.coverTitle` محايد + `dialogTitle` محايد |
| `tests/documentSchema.test.ts` | اختبار وضع print (أبيض/داكن عريض) + بدون تذييل + أيقونة كبيرة على الغلاف |
| `tests/longDocument.test.ts` | `mode==='print'` + `cover.icon` = أيقونة الموضوع + `badge===undefined` |
| `tests/runner.ts` | `'./pdfPrint.test'` بعد `longDocument.test` |
| `package.json` | `react-native-webview@13.15.0` |

### التحقق
- `npm run typecheck` → **نظيف**.
- `npm test` → **ALL TEST SUITES PASSED** مع `PASS documentSchema (10 checks)`,
  `PASS longDocument (12 checks)`, `PASS pdfPrint (12 checks)` ومضمارات
  المساعدين الآخرين جميعاً.

### سلوك مُتعمَّد يجب معرفته
- نسخة العارض هي **تمثيل HTML لصفحات الطباعة** (نفس الـ tokens) وليست عرض الـ PDF
  نفسه — هذا نتيجة قيد Expo Go (لا `react-native-pdf`). الـ PDF الحقيقي يُحفَظ
  ويُشارَك بنفس الفلبات، وزرّ المشاركة من العارض يشارك الملف الحقيقي.
- اسم الملف في المحفوظات = **عنوان محتوى المستند** (`outcome.title` ← `metadata.title`)،
  مع لاحقات الأجزاء: `{العنوان} (الجزء 2 من 3).pdf` (إنجليزياً `part 2 of 3`).
- ترويسة الصفحة: **رقم الصفحة فقط** — العلامة المائية «OSAMAH AGENT» أُزيلت نهائياً.
- `onStatus` يُستدعى الآن بمعامل خامس `progress` — أي متصل قديم يقرأ المعاملات
  الأربعة الأولى يعمل دون تغيير.
- إخفاء «وكيل أسامة» من ملف PDF لا يمسّ اسم التطبيق/النصوص العامة (تبقى كما هي).

---

## 10. استرجاع/تراجع

- حذف الملفات الأربعة الجديدة + إرجاع `documentSchema.ts`/`Pdf.ts`/
  `longDocument.ts`/`savedFiles.ts`/`ChatPage.tsx`/`ToolsScreen.tsx`/
  `i18n/strings.ts`/`tests/*`/`runner.ts`/`package.json` إلى حالتها السابقة
  (كل تعديل معزول وموثّق أعلاه).

## 8. ملاحظات للمطورين الآخرين

- **ممنوع** إعادة «وكيل أسامة» أو أي علامة مائية/شارة أو تذييل/معلومات جانبية في
  ملف PDF — الغلاف يحمل عنواناً + أيقونة موضوع، والترويسة رقم صفحة فقط. أي انتكاسة
  تكسر اختبارات `documentSchema`/`pdfPrint`/`longDocument`.
- للاعتماد على وظائف الطباعة/العناوين/التقسيم: استخدم `utils/pdfPrint.ts`
  (صافية) بدل إعادة كتابة CSS/منطق داخل `Pdf.ts`.
- أي مشارك يضيف وضعاً جديداً للـ theme عليه إكمال حقول `ThemeTokens` للمستوطنات
  الثلاثة (`dark`/`light`/`print`) وإلا سيكسر تواقيع `tokensForMode`.
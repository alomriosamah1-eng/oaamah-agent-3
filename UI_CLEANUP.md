# تنظيف الواجهة الأمامية — توثيق التغييرات (P10)

> غاية هذا التغيير: «واجهة تُخاطب مالكها فقط» — لا أزرار تقنية زائدة، ولا أسماء أو
> حالة اتصال فضفاضة تكشف البنية الداخلية. كل تعديل هنا **على الواجهة حصراً**:
> منطق الإرسال والاستماع والتخزين والوكيل لم يُمس.

---

## 1. التغييرات

### أ) حذف زر الصوت من حقل الكتابة — `components/MessageInput.tsx`
- **قبل:** كان الحقل الفارغ يعرض زر ميكروفون (إملاء صوتي عبر `recordOneShot`) ويتحول
  لسهم إرسال عند الكتابة.
- **بعد:** زر الإرسال (سهم ↑) ظاهر دائمًا؛ أثناء الإرسال يعرض مؤشر تحميل بدلًا منه.
- حُذف الكود الميت: `showMic`, `listening`, `dictRef`, `micPressed`, `micReleased`,
  استيراد `recordOneShot` و`Alert`، ونمط `buttonMic`.
- **لم يُمس:** `recordOneShot` في `utils/voice/recognition.ts` يبقى مصدَّراً
  (قابلية التراجع)، ومفاتيح `chat.voice*` في i18n تبقى (غير مستخدمة).
- الفلسفة: المحادثة الصوتية الكاملة أصبحت في كرة الرئيسية؛ الإملاء داخل خانة
  الكتابة أصبح مكررًا وفاقدًا لأهميته.

### ب) قائمة خيارات المهام عمودية — `components/TaskTypeSelector.tsx`
- **قبل:** الخيارات الثلاثة كانت في صفّ أفقي (ثلاث شرائح جنب بعض).
- **بعد:** `flexDirection: 'column'` — الخيارات تتكدس **عموديًا**، وكل خيار
  ذو عرض كامل ويعرض **الأيقونة + العنوان + الوصف** (كان `chip` يحوي الأيقونة
  والنصين أصلًا؛ أُزيل `flex:1` فقط ليتمدد الشكل عموديًا، مع `paddingVertical: 9`
  لراحة القراءة).
- المنطق (`TASK_LEVELS`, تحميل الاختيار, الحفظ, `accessibilityRole`) كما هو.

### ج) إخفاء سطر «edge-tts …» من الرئيسية — `app/(auth)/(tabs)/index.tsx`
- **قبل:** تحت كرة بدء المحادثة وتحت «اضغط للاستماع…» كان يظهر سطر حالة تقني
  (سطر `statusLine`): `edge-tts:on · google-stt:on · fallback:native`، وعند أي
  خطأ يظهر `lastError`/`diag`، وعند انقطاع البوابة «يتطلب بوابة».
- **بعد:** أُزيل عنصر `statusLine` والنمط المرتبط كليًّا. الكرة الحمراء تبقى مؤشر
  الخطأ البصري الوحيد.
- `providerLine` يبقى في الـ hook (`useVoiceController`) دون عرض — لا كسر في
  العقد بين الخادم والواجهة.

### د) إخفاء اسم «opencode» نهائيًا → «وكيل أسامة»
نصوص **معروضة فقط**؛ لا تُمس أي قيمة تشغيل داخلية:

| الموقع | قبل | بعد |
|---|---|---|
| `i18n/strings.ts` — `chat.errorBody` | جميع نماذج opencode غير متاحة | جميع نماذج **وكيل أسامة** غير متاحة |
| `i18n/strings.ts` — `chat.connectionConfiguredHint` | نماذج opencode جاهزة | **وكيل أسامة** جاهز |
| `i18n/strings.ts` — `chat.noConnectionBody` | نماذج opencode | نماذج **وكيل أسامة** |
| `i18n/strings.ts` — `settings.admins.control.subtitle`، `settings.control.subtitle` | خادم opencode | خادم **وكيل أسامة** |
| `i18n/strings.ts` — `settings.control.modelsTitle/hint` | نماذج opencode | نماذج **وكيل أسامة** |
| `i18n/strings.ts` — `settings.control.note` | `opencode.local:4096` + `opencode serve --mdns` | «يتصل التطبيق تلقائيًا بسيرفر وكيل أسامة على شبكتك المحلية» |
| `i18n/strings.ts` — `settings.about.opencodeNote/localHint` | opencode | **وكيل أسامة** |
| النظير الإنجليزي لكل ما سبق | opencode | **Osamah agent** |
| `app/(auth)/(tabs)/settings/control.tsx` سطر 132 | نص ثابت `opencode` | `t('appName')` |
| `app/(auth)/(tabs)/settings/control.tsx` سطر 155/175 | `{m.ownedBy ?? 'opencode'}` | `{m.ownedBy ?? t('appName')}` |

- **بخصوص «الردود»:** نظام الوكيل (`OSAMAH_SYSTEM` و`VOICE_SYSTEM`) يبدأ بـ
  «Osamah agent»/«Osamah» أصلًا — الردود تعرّف بوكيل أسامة، لا تغيير مطلوب.

## 2. ما لم يُمس (ضمان «لا تكسر شيئاً»)

- **قيمة التخزين `modelProvider` = `'opencode'`** في `control.tsx:57` **لم تتغير** —
  مفتاح توجيه داخلي يُقرأ في `utils/Opencode.ts:84` («أي وسيلة نقل»)، ليس عرضًا.
- `recordOneShot` و`utils/voice/recognition.ts` بالكامل — لم يُمسا.
- `providerLine`/`sttNeedsGateway`/`diag` في الـ hook — بقيت كما هي (خروج من العرض فقط).
- أسماء النماذج الحقيقية (`m.id`/`m.ownedBy`) من الخادم — تظهر كما هي؛ استبدلنا
  الـ fallback `'opencode'` فقط.
- كل منطق الإرسال (`onShouldSend`)، التوجيه (`TaskLevel`), ومسار الصوت — لم يمس.
- `app/(auth)/(tabs)/settings/about.tsx` — بلا تغيير (يقرأ i18n تلقائيًا).

## 3. ملفات تغيّرت

| الملف | التغيير |
|---|---|
| `components/MessageInput.tsx` | حذف الميكروفون + زر إرسال دائم + تنظيف الكود الميت |
| `components/TaskTypeSelector.tsx` | القائمة عمودية (أيقونة + نص لكل خيار) |
| `app/(auth)/(tabs)/index.tsx` | حذف سطر الحالة التقني (`statusLine`) |
| `i18n/strings.ts` | إعادة صياغة مفاتيح «opencode» (عربي + إنجليزي) |
| `app/(auth)/(tabs)/settings/control.tsx` | استبدال العناوين الظاهرة بـ «وكيل أسامة» |
| `DEVELOPMENT_PLAN.md` | صف P10 في السجل الحي |

## 4. التحقق

- `npx tsc --noEmit` → PASS
- `npm test` → ⚠️ مجموعتان فاشلتان بسبب عمل آخر غير هذه المهمة (انظر §6)
- يدويًا عبر Expo Go:
  1. الدردشة: لا زر ميكروفون، سهم الإرسال دائم، قائمة المهام عمودية (3 خيارات
     كلٌّ منها أيقونة + عنوان + وصف).
  2. الرئيسية: تحت الكرة «اضغط للاستماع…» فقط — لا «edge-tts» ولا حالة اتصال.
  3. الإعدادات ← مركز التحكم وعن التطبيق: لا «opencode» إطلاقًا.
  4. المحادثة الصوتية والردود تعرّف بـ«وكيل أسامة».

## 5. التراجع

- `MessageInput.tsx`: استعادة `micPressed`/`micReleased` وزر `buttonMic` (من محفوظات git).
- `TaskTypeSelector.tsx`: إعادة `flex: 1` + `flexDirection: 'row'` في `menu`.
- `index.tsx`: إعادة عنصر `statusLine` ونمطه.
- `i18n/strings.ts`: إرجاع الصيغ الأصلية لصفوف «opencode».
- `control.tsx`: إرجاع `t('appName')` → `'opencode'` في المواضع الثلاثة.

## 6. ملاحظات أثناء التنفيذ (عمل خارج نطاق هذه المهمة)

أثناء التحقق ظهر تحديث موازٍ غير مُسلّم في مستودع العمل (إعادة هيكلة «محرك
المستندات» للـ PDF) لمس ملفات لا علاقة لها بهذه المهمة. ما قام به هذا التحديث:

| الملف | التغيير الموازي | الأثر |
|---|---|---|
| `utils/Pdf.ts` | أُعيدت كتابته (محرك طباعة جديد) و`generateDocumentPdf` أصبح يردّ `PdfOutcome` بدل uri | مجمّع المهمة أصلح الموضعين الداخليين (`saveConversationAsPdf`/`saveConversationAsLongPdf`) لقراءة `outcome.files[0]?.uri` — بنفس النمط الذي استخدمه التحديث نفسه في `generatePdf`. هذا أصلاح تجميعي آمن ولا يغير السلوك |
| `utils/pdfPrint.ts` | ملف جديد (لم يكن موجودًا وقت فحص المهمة) | — |
| `utils/documentSchema.ts` | أزال تذييل العلامة «وكيل أسامة» من `buildDocumentHtml` | جعل `tests/documentSchema.test.ts` (فحص التذييل) فاشلًا |
| `utils/longDocument.ts` | `theme.mode` الأصلي أصبح `'print'` بدل `'dark'` | جعل `tests/longDocument.test.ts` فاشلًا (`expected dark, got print`) |

خلاصة: الفشلان لا علاقة لهما بتغييرات الواجهة في P10 — `tsc` نظيف، وجميع تغييرات
هذه المهمة فعلية في مكانها. حُفظت موضعاً كما وجدت دون تعديل لأنها جزء من عمل
قيد الإنجاز خارج نطاق «تنظيف الواجهة».
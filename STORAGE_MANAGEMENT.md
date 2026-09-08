# إدارة التخزين — خطة التنفيذ وسجلّ التغييرات

> هذه الوثيقة المرجعية الوحيدة لميزة «إدارة التخزين» داخل الإعدادات.
> الغرض: توثيق القرارات والحدود والخطوات حتى يستطيع أي مطوّر آخر (أو مساعد)
> مراجعة العمل أو العودة إليه دون كسر أي نظام آخر.

---

## 1. المبدأ الحاكم (Boundary)

النظام الجديد **لا يلمس أي نظام داخلي** في التطبيق، بل ينظّف **حصرياً مدخلات
ومخرجات المستخدم** (User-scope inputs & outputs) المخزّنة محلياً:

- **يُمسح** (Allow List): المحادثات، محفّزات البرومبت وسجلّها، الفيديوهات
  المحفوظة، الملفات المحفوظة، الملف الشخصي، السجلات، والملفات المؤقتة المولّدة.
- **لا يُمس أبداً** (Deny List / محصّن): الاتصال بالخادم، المفاتيح، إعدادات
  التطبيق، مخطط قاعدة البيانات، بيانات مغذّيات الأنظمة، وكل ملفات التطبيق
  التنفيذية/السوفتوير.

هذا القيد مُثبَّت في الثوابت داخل `utils/storageMaintenance/core.ts`
**وباختبار تلقائي** في `tests/storageMaintenance.test.ts` يمنع أي انحراف مستقبلي.

---

## 2. نطاق المستخدم — Allow List (يُنظَّف)

| الفئة | ما يُمسح حرفياً |
|---|---|
| `knowledge` — العقل الثاني والمعرفة | `DELETE FROM messages` ثم `chats` ثم `prompt_messages` ثم `prompt_sessions` |
| `records` — السجلات | `DELETE FROM prompt_maker_history` ثم `DELETE FROM flow_history` |
| `videos` — الفيديوهات المحفوظة | ملفات `<document>/flow/*.mp4` + `DELETE FROM flow_saved` |
| `saved` — الملفات المحفوظة | محتوى `<document>/saved-files/` + مفتاح `osamah:savedFiles` |
| `profile` — الملف الشخصي | مفتاح `osamah:userProfile` عبر `clearProfile()` |
| `cache` — الملفات المؤقتة | محتوى `Paths.cache` (TTS/حافظة/طباعة/تسجيلات) + صور `*.jpg` المؤقتة في document + `DELETE FROM flow_feed_cache` + `DELETE FROM flow_stream_cache` |

---

## 3. نطاق النظام — Deny List (محصّن 📛 — لا يمسّه شيء)

### 3.1 مفاتيح AsyncStorage (`PROTECTED_ASYNC_KEYS`)
جميع مفاتيح `chatgpt:*` وهي: `language`, `speakOutput`, `customModel`,
`userName`, `serverUrl`, `modelID`, `modelProvider`, `skillsLastCheck`,
`flowRotCursor`, `flowVolume`, `flowMuted`, `flowKeywordsLastRefresh`,
`voiceConfig`, `voiceLastChatId`, `voice:keys:stt`, `voice:keys:tts`,
`apihub-instances-v1`, `apihub-user-yt-keys`, `apihub-meta`, `serverUser`,
`serverPass` + مفتاح `osamah:taskType`.

### 3.2 جداول قاعدة البيانات المحمية
- `flow_keywords` — بأي مصدر (agent/manual/profile/…) لأنها تغذّي موجز FLOW.
- `flow_liked` — إشارات النظام.
- مخطط `chat.db` و `PRAGMA user_version` — لا `DROP` ولا `ALTER` إطلاقاً.

### 3.3 خارج نطاق التحديث تماماً
- `app.json` والمفاتيح المُخبَّزة فيه (zenApiKey, voice keys, yt keys…).
- جلسات خادم opencode (server-side).
- أي إعداد/مفتاح/اتصال يقرأه النظام: يبقى التطبيق متصلاً بنفس الخادم والنموذج
  والمفاتيح بعد كل عملية تنظيف.

---

## 4. الملفات المعنية

### ملفات جديدة
| الملف | الدور |
|---|---|
| `utils/storageMaintenance/core.ts` | منطق صافي (لا يستورد أي وحدة أصلية) — قابل للاختبار في Node: الثوابت المحمية، `bytesLabel`، `assembleBreakdown` |
| `utils/StorageMaintenance.ts` | التنفيذ الفعلي فوق SQLite / expo-file-system / AsyncStorage |
| `components/StorageDonut.tsx` | الحلقة الرسومية (Skia) مع النيدل ووسيلة الإيضاح |
| `app/(auth)/(tabs)/settings/storage.tsx` | صفحة «إدارة التخزين» |
| `tests/storageMaintenance.test.ts` | اختبارات الحماية + المنطق الصافي |

### تعديلات على ملفات موجودة
| الملف | التغيير |
|---|---|
| `app/(auth)/(tabs)/settings/index.tsx` | إضافة `'storage'` إلى `SectionKey` + سطر في `ADMINS` |
| `i18n/strings.ts` | نصوص `settings.admins.storage.*` و `settings.storage.*` بالعربية والإنجليزية (اللغتان إلزاميتان بسبب `en: typeof ar`) |
| `tests/runner.ts` | تسجيل مجرّب `storageMaintenance.test` (إضافة سطر فقط) |

---

## 5. معاد استخدامه (لا إعادة اختراع)

- `clearProfile()` / `loadProfile()` — `utils/UserProfile.ts`
- `listSavedFiles()` / `savedFilesDir()` — `utils/savedFiles.ts`
- `getSavedVideos()`/`flow_saved` عبر `utils/flow/flowDB.ts` (للقراءة فقط)
- نمط تأكيد `Alert.alert` — مثل `app/(auth)/(tabs)/settings/profile.tsx`

---

## 6. ضمانات عدم الكسر

1. `DELETE FROM` صريح لكل جدول مسموح فقط — لا `DROP`/`ALTER` → `chat.db` يبقى
   مفتوحاً لدى `SQLiteProvider` وتُعاد البنية ذاتياً.
2. `VACUUM` بعد حذف البيانات كبيرة الحجم (تُقَلّص الملف فيظهر التوفير الحقيقي)
   — محاط بـ try/catch ولا يعدّل المخطط.
3. لا `AsyncStorage.clear()` — إزالة مفاتيح المستخدم صراحةً فقط.
4. كل عملية محاطة بـ try/catch → فشل عملية لا يوقف البقية.
5. التحقق النهائي: `npm run typecheck` و `npm test`.
6. تعارض سجلّ git مع عمل آخرين؟ هذا الملف + الملفات الجديدة فقط، والتعديلات
   الثلاثة موضعية لا تلمس سطراً يعمله آخر.

---

## 7. سجلّ التنفيذ (يُحدَّث بعد كل خطوة)

- [x] توثيق الخطة وحفظها هنا.
- [x] `utils/storageMaintenance/core.ts` — ثوابت الحماية + المنطق الصافي.
- [x] `utils/StorageMaintenance.ts` — تنفيذ SQLite/FS.
- [x] `components/StorageDonut.tsx` — الحلقة الرسومية.
- [x] `app/(auth)/(tabs)/settings/storage.tsx` — الصفحة.
- [x] تسجيل الإدارة في `settings/index.tsx`.
- [x] نصوص `i18n/strings.ts` (ar + en).
- [x] اختبار `tests/storageMaintenance.test.ts` + تسجيله في `runner.ts`.
- [x] `typecheck` + `test` ناجحان (`PASS storage-maintenance (9 checks)`).

---

## 9. سجلّ التشغيل (ما تم بالفعل — لتُراجع من الغير)

> نُفِّذ في جلسة واحدة، ولم يُمسَّ أي ملف يخصّ مساعدين آخرين
> (voice / flow / prompt-maker / server / search …).

### الملفات الجديدة
1. **`STORAGE_MANAGEMENT.md`** — هذه الوثيقة (الخطة + السجل).
2. **`utils/storageMaintenance/core.ts`** — منطق صافي بدون أي استيراد أصلي:
   - `PROTECTED_ASYNC_KEYS` (22 مفتاحاً نظامياً) — **لا تُمس أبداً**.
   - `USER_ASYNC_KEYS` = `osamah:userProfile`, `osamah:savedFiles`.
   - `PROTECTED_TABLES` = `flow_keywords`, `flow_liked` — **لا تُمس أبداً**.
   - `USER_DATA_TABLES` / `CACHE_ONLY_TABLES` / `RECORDS_TABLES`.
   - `bytesLabel`, `assembleBreakdown`, `freedBytes`, `isCleanSurfaceSafe`.
3. **`utils/StorageMaintenance.ts`** — المنفّذ فوق SQLite / expo-file-system/legacy /
   AsyncStorage: `computeStorageBreakdown`, `cleanTemp`, `clearKnowledge`,
   `clearRecords`, `clearSavedVideos`, `clearSavedFiles`, `clearProfileData`,
   `factoryReset` (يَستهَل بـ `isCleanSurfaceSafe()` كحاجز دفاعي).
   - قياسات حقيقية: مجلد `flow/`, `saved-files/`, `Paths.cache`, ملف `chat.db`+WAL/SHM.
   - `VACUUM` بعد حذف كميات كبيرة (لا يعدّل المخطط) — داخل try/catch.
4. **`components/StorageDonut.tsx`** — حلقة Skia ملوّنة (فئة ← لون) مع نيدل
   مسح متحرك (Animated) + النص المركزي للبصمة، وتصدير `CATEGORY_COLORS`.
5. **`app/(auth)/(tabs)/settings/storage.tsx`** — الصفحة كاملة:
   الحلقة + وسيلة الإيضاح + «تنظيف الملفات المؤقتة» + قسم «التهيئة والحذف»
   (5 صفوف بحذف مؤكَّد) + زر «تهيئة التطبيق» (تهيئة نطاق المستخدم فقط).
6. **`tests/storageMaintenance.test.ts`** — 9 فحوصات، أهمها **حماية الحدود**
   (لا تداخل بين نطاق المستخدم ونطاق النظام؛ لا مساس بـ flow_keywords/flow_liked).

### تعديلات على ملفات موجودة (موضعية فقط)
| الملف | التعديل |
|---|---|
| `app/(auth)/(tabs)/settings/index.tsx` | `'storage'` في `SectionKey` + سطر `ADMINS` {icon: cleaning-services, color: EmeraldGlow} |
| `i18n/strings.ts` | `settings.admins.storage` + كتلة `settings.storage` كاملة بالعربية والإنجليزية (قالب `settings` بين السطور `admins` و `back` في اللغتين) |
| `tests/runner.ts` | إضافة `'./storageMaintenance.test'` في نهاية قائمة `suites` (لم يُلمس أي سطر آخر) |

### التحقق
- `npm run typecheck` → **نظيف** (بدون أخطاء).
- `npm test` → **ALL TEST SUITES PASSED** (بما فيها مضمارات المساعدين الآخرين
  وكذا `PASS storage-maintenance (9 checks)`).

### سلوك مُتعمَّد يجب معرفته
- `clearKnowledge` يمسح أيضاً `flow_feed_cache`/`flow_stream_cache`؟ لا —
  هذا ضمن «تنظيف الملفات المؤقتة» فقط. والصف «العقل الثاني» يمسح
  المحادثات/الرسائل/البرومبت ويستهدف فئتي `knowledge`+`records` في عدّاد التوفير.
- حذف «السجلات» لا يمسح `flow_liked` — هذه إشارات نظام محفوظة.
- بعد أي عملية يُعاد قياس البصمة فوراً (أرقام **قبل/بعد** حقيقية) وتظهر شارة
  «وفرت X».
- المصطلح `admin.key` الجديد = `storage` والمسار = `/settings/storage`
  (إنشاء تلقائي عبر expo-router من اسم الملف).

---

## 10. استرجاع/تراجع

- حذف الملفات الجديدة الستة + تراجع عن التعديلات الثلاثة في
  `settings/index.tsx` و`i18n/strings.ts` و`tests/runner.ts` (كل تعديل معزول
  وموثّق أعلاه) يعيد المشروع لحالته قبل الجلسة دون أي أثر.

## 8. ملاحظات للمطوّرين الآخرين

- **مسموح** لك بقراءة `utils/StorageMaintenance.ts` وإعادة استخدام دواله.
- **ممنوع** أن تعدّل `PROTECTED_ASYNC_KEYS` أو `PROTECTED_TABLES` بلا مراجعة —
  سيكسر الاختبار الوقائي وإعدادات/اتصال المستخدم.
- أي ميزة مستقبلية تريد مسح بيانات جديدة: أضِفها لقائمة المصادَق عليها في هذا
  الملف وفي `USER_DATA_*` بنفس الجدول أعلاه، لا للمحميات.
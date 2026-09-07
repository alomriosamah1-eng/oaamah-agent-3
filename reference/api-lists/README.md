# OSAMAH API HUB — المكتبات المرجعية للـ Keys/Endpoints

هذا المجلد يستضيف النسخ المحمّلة من المستودعات التي تدرج APIs ومفاتيح
ونقاط اتصال، مفحوصة على الشبكة لحظة الإعداد. **لا يحتوي على مفاتيح سرية**
(المفاتيح الحقيقية مرتبطة بحسابات أصحابها ولا تُسجَّل في GitHub).

التطبيق لا يعتمد على هذه الملفات وقت التشغيل — بل يستخدم:

1. `utils/apiHub/catalog.ts` — فهرس مصغَّر مدمج (bundled) لكل تصنيف، مع
   الأولويات ونقاط الاتصال الموثوقة، وهو مصدر «التبديل التلقائي».
2. `utils/apiHub/store.ts` — يحمّل القائمة الأحدث تلقائيًا من الروابط أدناه
   (Raw GitHub / Impressive lists) ويحفظها محليًا مع آلية مرونة لا تُوقف النظام.

## المحتوى

| المجلد | المصدر | الحجم | التحديث التلقائي (Raw URL) |
|---|---|---|---|
| `api-mega-list/` | github.com/cporter202/API-mega-list | ~8.8 MB | https://raw.githubusercontent.com/cporter202/API-mega-list/main/... |
| `keploy/` | github.com/keploy/public-apis-collection | 111 KB | https://raw.githubusercontent.com/keploy/public-apis-collection/main/README.md |
| `public-api-lists/` | github.com/public-api-lists/public-api-lists | 195 KB | https://raw.githubusercontent.com/public-api-lists/public-api-lists/master/README.md |

## تصنيفات api-mega-list المحمّلة (24)

- `ai-apis-1555` — ذكاء اصطناعي / نماذج / توليد
- `agents-apis-623` — وكلاء أتمتة
- `automation-apis-5653` — أتمتة
- `social-media-apis-2786` — سوشيال (يغطي YouTube/TikTok/Instagram/…)
- `videos-apis-705` — فيديو وبث
- `news-apis-537` — أخبار
- `business-apis-514`, `developer-tools-apis-4065`, `ecommerce-apis-2245`,
  `education-apis-46`, `for-creators-apis-16`, `games-apis-6`,
  `integrations-apis-841`, `jobs-apis-1149`, `lead-generation-apis-4431`,
  `marketing-apis-290`, `mcp-servers-apis-289`, `open-source-apis-84`,
  `other-apis-1944`, `real-estate-apis-1089`, `seo-tools-apis-903`,
  `sports-apis-21`, `travel-apis-493`, `00-featured-apis`
  (التصنيفات `assets` و`settings` بلا README — تجاوزت.)

## متى وكيف تُحدَّث

- `npm run api:refresh` يشغّل سكربت `scripts/api-refresh.js` يعيد تحميل هذه
  الملفات من الأصول أعلاه (يتطلب اتصالًا) ثم يكتب فهرس التحديث
  `reference/api-lists/.meta.json`.
- داخل التطبيق، `warmApiHub()` (من `utils/apiHub`) يحدّث **قوائم المثيلات
  التشغيلية** (Piped/Invidious وغيرها) دوريًا من مصادر مباشرة، ويستمر دائمًا
  بآخر قائمة سليمة مخزنة مع قائمة مدمجة احتياطية — لا يتوقف القسم أبدًا عند
  فشل التحديث.

> ملاحظة: ملفات `api-mega-list/` مستثناة من git (حجمها كبير) لكنها محفوظة
> على القرص كمرجع محلّي للفهرسة البرمجية عبر `utils/apiHub/catalog.ts`.
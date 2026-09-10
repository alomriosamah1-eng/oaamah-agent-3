# تشغيل OSAMAH AGENT بشكل متصل فعليًا

## ما تم إصلاحه

تم ربط Reels مباشرةً مع YouTube Data API v3 بالمفتاح الذي زوّده مالك المشروع، وتم إصلاح إعداد Expo الديناميكي حتى لا يمسح المفتاح المخبوز عند غياب ملف `.env`. كما أصبح إصدار Android Release يستخدم اكتشاف OpenCode عبر mDNS باسم `opencode.local`، وتستخدم بوابة الصوت نفس المضيف تلقائيًا على المنفذ 8100.

تمت إضافة `server/start-all.sh` لتشغيل الخادمين الحقيقيين معًا. السكربت لا ينشئ نموذجًا محليًا ولا يستبدل OpenCode بخدمة وهمية؛ إنه يشغل OpenCode الرسمي وبوابة الصوت الموجودة في المشروع.

## المتطلبات على الكمبيوتر الذي سيستضيف الخادمين

يجب تثبيت OpenCode الرسمي وPython وffmpeg. التثبيت الرسمي لـ OpenCode هو:

```bash
curl -fsSL https://opencode.ai/install | bash
```

ثم إعداد اعتماد مزود النماذج داخل OpenCode حسب توثيقه الرسمي. لا توجد نماذج محلية داخل تطبيق الهاتف.

## التشغيل

من جذر المشروع:

```bash
npm ci
python3 -m venv .venv
.venv/bin/pip install -r server/requirements.txt
./server/start-all.sh
```

سيطبع السكربت عناوين LAN، ويشغل:

- OpenCode الرسمي على `0.0.0.0:4096` مع mDNS على `opencode.local`.
- بوابة الصوت FastAPI على `0.0.0.0:8100`.
- TTS عبر Edge voices وSTT عبر Google-free endpoint كما هو منفذ في `server/voice_gateway.py`.

اختبارات الصحة:

```bash
curl http://127.0.0.1:4096/global/health
curl http://127.0.0.1:8100/voice/status
```

يجب أن يعيد OpenCode `healthy: true`، ويجب أن تعيد بوابة الصوت `ok: true` مع قائمة المزودين والأصوات.

## الهاتف

إذا كان الهاتف والكمبيوتر على نفس شبكة Wi-Fi، يستخدم التطبيق `http://opencode.local:4096` لاكتشاف OpenCode ويستخدم `http://opencode.local:8100` للصوت. يجب السماح للمنفذين 4096 و8100 في جدار الحماية، ويجب أن يسمح الراوتر بـ mDNS/Multicast DNS.

إذا كان الهاتف خارج شبكة الكمبيوتر، يجب تمرير المنفذين إلى الإنترنت عبر نفق HTTPS حقيقي. لا يمكن للتطبيق اختراع عنوان النفق؛ عندها يجب وضع عنوان OpenCode في `EXPO_PUBLIC_OPENCODE_URL` وعنوان الصوت في `EXPO_PUBLIC_VOICE_GATEWAY_URL` قبل البناء.

## نتائج الفحص

تم التحقق من مفتاح YouTube بطلب حقيقي إلى `youtube/v3/search` وأعاد `videoId`. تم تثبيت OpenCode CLI الرسمي وتشغيله، وأعاد `GET /global/health` حالة صحية صحيحة. تم تشغيل بوابة الصوت من البيئة الافتراضية للمشروع وأعاد `GET /voice/status` حالة `ok: true`. نجح `npm run typecheck`، ونجحت جميع اختبارات المشروع، ونجح بناء APK Release.

## إصدارات Android

- `osamah-agent-connected-arm64-v8a.apk`: أجهزة ARM64، الحجم 42 MB.
- `osamah-agent-connected-armeabi-v7a.apk`: أجهزة ARM 32-bit، الحجم 35 MB.

كلاهما يدعم Android 8+ (`minSdk 26`) وموقّع بتوقيع APK v2 صالح.

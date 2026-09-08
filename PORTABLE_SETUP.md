# ترحيل مشروع «وكيل أسامة» إلى جهاز/بيئة أخرى — PORTABLE_SETUP

> هذا الدليل يشرح كيف تُنقل نسخة كاملة من المشروع (بما فيها المفاتيح والتحديثات الحية)
> إلى أي جهاز آخر وتُشغَّل **دون فشل**. الأرشيف نفسه جاهز للرفع والنقل.

---

## 1. ما هو الملف المؤرشف؟

`osamah-agent-portable-<التاريخ>.tar.gz` — حزمة كاملة بأحدث حالة عمل للمشروع:

| المحتوى | الحالة | ملاحظة |
|---|---|---|
| كل الكود (`app/ components/ utils/ theme/ i18n/ server/ tests/ scripts/ prompt-maker/`) | ✅ مضمن | أحدث الحالات بكل التحديثات غير المُرتكبة |
| `app.json` **بأحدث المفاتيح** (`ytApiKeys`, `zenApiKey`, `voiceApiKeys`, URLs) | ✅ مضمن | **مهم**: هذه هي «مفاتيح» المشروع |
| `package.json` + `package-lock.json` | ✅ مضمن | يضمن تثبيت اعتماديات متطابقة |
| `opencode` (ثنائي الخادم) | ✅ مضمن | يشغّل `npm run server` بلا تنزيل |
| `server/voice_gateway.py` + `run.sh` + `requirements.txt` | ✅ مضمن | بوابة الصوت على 8100 |
| التوثيق (`README`, `DEVELOPMENT_PLAN`, `SEARCH_ENGINE`, `UI_CLEANUP`, ...) | ✅ مضمن | — |
| `reference/` (قوائم واجهات API للمساعدة) | ✅ مضمن | — |
| `node_modules/` | ❌ مستبعد | يُعاد بتثبيت واحد (`npm install`) |
| `.git/` | ❌ مستبعد | محفوظات اختيارية؛ محتواها الحيّ في الملفات نفسها |
| `.expo/ .test-dist/ dist/ __pycache__/ *.log` | ❌ مستبعد | نواتج تُعاد تلقائيًا |

## 2. متطلبات الضيف (الجهاز الجديد)

| الأداة | النسخة | الغرض |
|---|---|---|
| Node.js | 20+ | Expo / Metro |
| Python | 3.10+ | بوابة الصوت |
| ffmpeg | حديث | تحويل الصوت في البوابة |
| Expo Go | من متجر Play | تشغيل التطبيق على الهاتف بلا بناء أصلي |
| (اختياري) opencode مؤكَّد على المضيف | — | يعمل مع الـ zen المجاني حتى بلا خادم |

تثبيت ffmpeg:
```bash
sudo apt update && sudo apt install -y ffmpeg      # Debian/Ubuntu
brew install ffmpeg                                 # macOS
```

## 3. خطوات الترحيل (بالترتيب)

```bash
# 1) فك الحزمة
tar -xzf osamah-agent-portable-<التاريخ>.tar.gz
cd chatgpt-clone-react-native-main

# 2) تثبيت اعتماديات JS (يقرأ package-lock لتطابق دقيق)
npm install

# 3) تثبيت اعتماديات بوابة الصوت (يفضّل داخل بيئة افتراضية)
python3 -m venv .venv && source .venv/bin/activate
pip install -r server/requirements.txt

# 4) ربط عنوان البوابة بالجهاز الجديد (مهم!)
cp .env.example .env
#    عدّل EXPO_PUBLIC_VOICE_GATEWAY_URL إلى http://<ip-الجهاز-الجديد>:8100
#    (أو ثبّت نفس القيمة في app.json → expo.extra.voiceGatewayUrl ثم أعد تحميل Expo Go)

# 5) تشغيل بوابة الصوت (منفذ 8100)
./server/run.sh

# 6) تشغيل خادم opencode الذي يتصل به التطبيق (اختياري — الـ zen يعمل بلا خادم)
npm run server          # opencode serve 0.0.0.0:4096 --mdns

# 7) تشغيل Metro على نفس شبكة Wi-Fi
npx expo start --clear

# 8) الهاتف: افتح Expo Go ثم العنوان الظاهر
#    exp://<ip-الجهاز-الجديد>:8081  — يجب أن يكون الهاتف والجهاز على نفس الشبكة

# 9) تحقّقات سريعة (نفّذ على الجهاز الجديد)
npm run typecheck
npm test
curl -s http://127.0.0.1:8100/voice/status     # توقّع JSON ولّي
```

## 4. المفاتيح والسرّية — تنبيه مهم

- الحزمة **تتضمّن المفاتيح كما هي في `app.json`** (مفتاح يوتيوب، zen، مفاتيح الصوت) — هذا مقصود
  لعمل فوري بلا فشل على الجهاز الجديد.
- احفظ الأرشيف في مكان آمن (لا ترفعه على مستودع عام).
- لتغيير مفتاح لاحقًا: عدّل في `app.json` → `expo.extra` ثم أعد تحميل التطبيق من Expo Go:
  - `ytApiKey`/`ytApiKeys` — بحث يوتيوب.
  - `zenApiKey` — مفتاح zen الاختياري (فارغ = مجاني).
  - `voiceApiKeys`/`voiceTtsKeys` — مفاتيح الصوت الاختيارية (فارغة = مجانية).
  - `voiceGatewayUrl` — عنوان البوابة (يُفضَّل عبر `.env`).
- مفاتيح المستخدم المُضافة من داخل التطبيق تُخزَّن في ذاكرة الهاتف (AsyncStorage/SecureStore)، لا في هذه الحزمة.

## 5. أوامر تشغيل شائعة بعد الترحيل

| المهمة | الأمر |
|---|---|
| تشغيل التطبيق (Metro) | `npx expo start` |
| مسح ذاكرة Metro المؤقتة وإعادة بناء | `npx expo start --clear` |
| بوابة الصوت | `./server/run.sh` (منفذ 8100) |
| خادم opencode | `npm run server` (منفذ 4096، mDNS) |
| تدقيق الأنواع | `npm run typecheck` |
| الاختبارات | `npm test` (تين فحصًا وبدون jest) |
| تحديث قوائم واجهات API المرجعية | `npm run api:refresh` |
| تصريح Android محليًا | `npx expo run:android` |

## 6. علامات «يعمل دون فشل»

- `npm run typecheck` = PASS.
- `npm test` = كل المجموعات الجديدة PASS (مع العلم: مجموعتا `documentSchema`/`longDocument`
  في حالة «عمل قيد الإنجاز» غير مربوطتين بهذا الأرشيف — حالتُهما كما هي قبل وبعد النقل).
- الهاتف يفتح التطبيق ويسمع الرد الصوتي، والبحث المحلي/الويب والريلز تعمل على نفس الشبكة.
- `curl http://<ip>:8100/voice/status` بإرجاع JSON صحيح.

## 7. التراجع عن الترحيل

حذف المجلدات التوليدية فقط يكفي لإعادة البيئة نظيفة:
`rm -rf node_modules .expo .test-dist dist server/__pycache__ .venv`
ثم إعادة `npm install` للملف المصدر. لا يُحذف أي ملف كود.
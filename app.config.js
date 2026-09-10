const base = require('./app.base.json');

const envYtKey = (process.env.EXPO_PUBLIC_YT_API_KEY || '').trim();
const envVoiceUrl = (process.env.EXPO_PUBLIC_VOICE_GATEWAY_URL || '').trim();
const envOpencodeUrl = (process.env.EXPO_PUBLIC_OPENCODE_URL || '').trim();
const baseExtra = base.expo?.extra || {};
const ytKey = envYtKey || baseExtra.ytApiKey || '';
const voiceUrl = envVoiceUrl || baseExtra.voiceGatewayUrl || '';
const opencodeUrl = envOpencodeUrl || baseExtra.opencodeUrl || '';

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    plugins: [...(base.expo.plugins || []), './plugins/withEmbeddedOpenCode'],
    extra: {
      ...base.expo.extra,
      ytApiKey: ytKey,
      ytApiKeys: ytKey ? [ytKey, ...(baseExtra.ytApiKeys || []).filter((k) => k !== ytKey)] : [],
      voiceGatewayUrl: voiceUrl,
      opencodeUrl,
    },
  },
};

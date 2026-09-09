const base = require('./app.json');

const ytKey = (process.env.EXPO_PUBLIC_YT_API_KEY || '').trim();
const voiceUrl = (process.env.EXPO_PUBLIC_VOICE_GATEWAY_URL || '').trim();

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    extra: {
      ...base.expo.extra,
      ytApiKey: ytKey,
      ytApiKeys: ytKey ? [ytKey] : [],
      voiceGatewayUrl: voiceUrl,
    },
  },
};

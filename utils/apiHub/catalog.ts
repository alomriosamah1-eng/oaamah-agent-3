// OSAMAH API HUB — bundled curated catalog.
//
// A small, dependable index distilled from the downloaded reference libraries
// (see reference/api-lists/) plus live-verified endpoints. This is the source
// of "what to switch to" per OSAMAH category. Lower `priority` = tried first.
// Pure static data — Node-testable, no RN imports.

import type { ApiCategory, CatalogEntry } from './core';

export const API_CATEGORIES: ApiCategory[] = [
  'ai',
  'voice',
  'social',
  'search',
  'maps',
  'media',
  'automation',
  'opendata',
];

export const CATALOG: CatalogEntry[] = [
  /* ---------------- AI ---------------- */
  { id: 'zen', name: 'OpenCode Zen (free models)', category: 'ai', baseUrl: 'https://opencode.ai/zen/v1', auth: 'key', endpoint: '/chat/completions', priority: 1, note: 'default free chain with auto-switch (utils/OpenCodeAgent)' },
  { id: 'ollama', name: 'Ollama (local)', category: 'ai', baseUrl: 'http://127.0.0.1:11434', auth: 'none', endpoint: '/api/chat', priority: 2 },
  { id: 'openai', name: 'OpenAI', category: 'ai', baseUrl: 'https://api.openai.com/v1', auth: 'key', endpoint: '/chat/completions', priority: 3 },
  { id: 'anthropic', name: 'Anthropic Claude', category: 'ai', baseUrl: 'https://api.anthropic.com/v1', auth: 'key', endpoint: '/messages', priority: 4 },
  { id: 'google-ai', name: 'Google Gemini', category: 'ai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', auth: 'key', endpoint: '/models/{model}:generateContent', priority: 5 },
  { id: 'groq', name: 'Groq', category: 'ai', baseUrl: 'https://api.groq.com/openai/v1', auth: 'key', endpoint: '/chat/completions', priority: 6 },
  { id: 'mistral', name: 'Mistral AI', category: 'ai', baseUrl: 'https://api.mistral.ai/v1', auth: 'key', endpoint: '/chat/completions', priority: 7 },
  { id: 'together', name: 'Together AI', category: 'ai', baseUrl: 'https://api.together.xyz/v1', auth: 'key', endpoint: '/chat/completions', priority: 8 },
  { id: 'cohere', name: 'Cohere', category: 'ai', baseUrl: 'https://api.cohere.ai/v2', auth: 'key', endpoint: '/chat', priority: 9 },
  { id: 'deepseek', name: 'DeepSeek', category: 'ai', baseUrl: 'https://api.deepseek.com', auth: 'key', endpoint: '/chat/completions', priority: 10 },

  /* ---------------- VOICE (STT/TTS) ---------------- */
  { id: 'google-stt', name: 'Google Speech-to-Text', category: 'voice', baseUrl: 'https://speech.googleapis.com/v1', auth: 'key', endpoint: '/speech:recognize', priority: 1, docs: 'https://cloud.google.com/speech-to-text' },
  { id: 'google-tts', name: 'Google TTS', category: 'voice', baseUrl: 'https://texttospeech.googleapis.com/v1', auth: 'key', endpoint: '/text:synthesize', priority: 2 },
  { id: 'azure-speech', name: 'Microsoft Azure Speech', category: 'voice', baseUrl: 'https://{region}.cognitiveservices.azure.com/sts/v1.0', auth: 'key', endpoint: '/issueToken', priority: 3 },
  { id: 'voicerss', name: 'VoiceRSS TTS', category: 'voice', baseUrl: 'https://api.voicerss.org', auth: 'key', endpoint: '/', priority: 4 },
  { id: 'streamlabs-tts', name: 'Streamlabs TTS', category: 'voice', baseUrl: 'https://streamlabs.com/api/v2', auth: 'none', endpoint: '/tts', priority: 5, note: 'free public TTS' },
  { id: 'translate-tts', name: 'Google Translate TTS', category: 'voice', baseUrl: 'https://translate.google.com/translate_tts', auth: 'none', endpoint: '?ie=UTF-8&q=...&tl=...&client=tw-ob', priority: 6, note: 'anonymous, no key' },

  /* ---------------- SOCIAL ---------------- */
  { id: 'youtube-data', name: 'YouTube Data API v3', category: 'social', baseUrl: 'https://www.googleapis.com/youtube/v3', auth: 'key', endpoint: '/search', priority: 1, docs: 'https://developers.google.com/youtube/v3' },
  { id: 'innertube', name: 'YouTube Innertube (ANDROID)', category: 'social', baseUrl: 'https://www.youtube.com/youtubei/v1', auth: 'none', endpoint: '/player', priority: 2, note: 'stream extraction, no key needed' },
  { id: 'piped', name: 'Piped (public instances)', category: 'social', baseUrl: '', auth: 'none', endpoint: '/search', priority: 3, note: 'instances auto-updated via API HUB' },
  { id: 'invidious', name: 'Invidious (public instances)', category: 'social', baseUrl: '', auth: 'none', endpoint: '/api/v1/search', priority: 4, note: 'instances auto-updated via API HUB' },
  { id: 'tiktok', name: 'TikTok', category: 'social', baseUrl: 'https://open.tiktokapis.com/v2', auth: 'oauth', endpoint: '/research/video/query', priority: 5 },
  { id: 'instagram', name: 'Instagram Graph', category: 'social', baseUrl: 'https://graph.instagram.com', auth: 'oauth', endpoint: '/me', priority: 6 },
  { id: 'facebook', name: 'Facebook Graph', category: 'social', baseUrl: 'https://graph.facebook.com/v21.0', auth: 'oauth', endpoint: '/me', priority: 7 },
  { id: 'x-api', name: 'X (Twitter) API', category: 'social', baseUrl: 'https://api.x.com/2', auth: 'oauth', endpoint: '/users/me', priority: 8 },
  { id: 'reddit', name: 'Reddit (read-only)', category: 'social', baseUrl: 'https://oauth.reddit.com', auth: 'oauth', endpoint: '/api/v1/me', priority: 9 },

  /* ---------------- SEARCH ---------------- */
  { id: 'duckduckgo', name: 'DuckDuckGo (anon)', category: 'search', baseUrl: 'https://api.duckduckgo.com', auth: 'none', endpoint: '/', priority: 1 },
  { id: 'wikipedia', name: 'Wikipedia', category: 'search', baseUrl: 'https://en.wikipedia.org/w/api.php', auth: 'none', endpoint: '?action=query', priority: 2 },
  { id: 'brave', name: 'Brave Search', category: 'search', baseUrl: 'https://api.search.brave.com/res/v1', auth: 'key', endpoint: '/web/search', priority: 3 },
  { id: 'google-cse', name: 'Google Custom Search', category: 'search', baseUrl: 'https://customsearch.googleapis.com/customsearch/v1', auth: 'key', endpoint: '?q=', priority: 4 },
  { id: 'bing', name: 'Bing Web Search', category: 'search', baseUrl: 'https://api.bing.microsoft.com/v7.0', auth: 'key', endpoint: '/search', priority: 5 },

  /* ---------------- MAPS ---------------- */
  { id: 'nominatim', name: 'OpenStreetMap Nominatim', category: 'maps', baseUrl: 'https://nominatim.openstreetmap.org', auth: 'none', endpoint: '/search', priority: 1 },
  { id: 'openrouteservice', name: 'OpenRouteService', category: 'maps', baseUrl: 'https://api.openrouteservice.org/v2', auth: 'key', endpoint: '/directions/driving-car', priority: 2 },
  { id: 'here', name: 'Here Maps', category: 'maps', baseUrl: 'https://maps.hereapi.com/v3', auth: 'key', endpoint: '/geocode', priority: 3 },
  { id: 'google-geo', name: 'Google Geocoding', category: 'maps', baseUrl: 'https://maps.googleapis.com/maps/api', auth: 'key', endpoint: '/geocode/json', priority: 4 },

  /* ---------------- MEDIA ---------------- */
  { id: 'pexels', name: 'Pexels', category: 'media', baseUrl: 'https://api.pexels.com/v1', auth: 'key', endpoint: '/search', priority: 1 },
  { id: 'unsplash', name: 'Unsplash', category: 'media', baseUrl: 'https://api.unsplash.com', auth: 'key', endpoint: '/search/photos', priority: 2 },
  { id: 'pixabay', name: 'Pixabay', category: 'media', baseUrl: 'https://pixabay.com/api', auth: 'key', endpoint: '/', priority: 3 },
  { id: 'wikimedia', name: 'Wikimedia Commons', category: 'media', baseUrl: 'https://commons.wikimedia.org/w/api.php', auth: 'none', endpoint: '?action=query', priority: 4 },

  /* ---------------- AUTOMATION ---------------- */
  { id: 'ifttt', name: 'IFTTT Maker', category: 'automation', baseUrl: 'https://maker.ifttt.com', auth: 'key', endpoint: '/trigger/{event}', priority: 1 },
  { id: 'zapier', name: 'Zapier', category: 'automation', baseUrl: 'https://api.zapier.com/v2', auth: 'oauth', endpoint: '/hooks', priority: 2 },
  { id: 'github-actions', name: 'GitHub (Actions/API)', category: 'automation', baseUrl: 'https://api.github.com', auth: 'key', endpoint: '/repos/{owner}/{repo}', priority: 3 },
  { id: 'n8n', name: 'n8n (self-hosted)', category: 'automation', baseUrl: 'http://127.0.0.1:5678', auth: 'none', endpoint: '/webhook', priority: 4 },
  { id: 'airtable', name: 'Airtable', category: 'automation', baseUrl: 'https://api.airtable.com/v0', auth: 'key', endpoint: '/meta', priority: 5 },

  /* ---------------- OPEN DATA ---------------- */
  { id: 'restcountries', name: 'REST Countries', category: 'opendata', baseUrl: 'https://restcountries.com/v3.1', auth: 'none', endpoint: '/all', priority: 1 },
  { id: 'openweathermap', name: 'OpenWeatherMap', category: 'opendata', baseUrl: 'https://api.openweathermap.org/data/2.5', auth: 'key', endpoint: '/weather', priority: 2 },
  { id: 'nasa', name: 'NASA', category: 'opendata', baseUrl: 'https://api.nasa.gov', auth: 'key', endpoint: '/planetary/apod', priority: 3 },
  { id: 'numbers', name: 'Numbers API', category: 'opendata', baseUrl: 'http://numbersapi.com', auth: 'none', endpoint: '/42', priority: 4 },
  { id: 'jsonplaceholder', name: 'JSONPlaceholder', category: 'opendata', baseUrl: 'https://jsonplaceholder.typicode.com', auth: 'none', endpoint: '/users', priority: 5 },
];

/** Entries for a category, cheapest/most reliable first. */
export function catalogFor(category: ApiCategory): CatalogEntry[] {
  return CATALOG.filter((e) => e.category === category).sort((a, b) => a.priority - b.priority);
}

export function findCatalogEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.id === id);
}
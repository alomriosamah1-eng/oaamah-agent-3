// Prompt Maker screen entry point (kept for navigation compatibility).
// The section is now backed by the isolated Prompt Maker module; this file is
// only a thin bridge so existing imports/registration keep working unchanged.

import PromptMakerPage from '@/prompt-maker/screen/PromptMakerPage';

const PromptMakerScreen = () => <PromptMakerPage />;

export default PromptMakerScreen;
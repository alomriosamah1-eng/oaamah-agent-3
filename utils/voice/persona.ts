// Character personas — «ميرا» (female) and «كريم» (male) are speaking
// companions the user can BECOME by name, mid-conversation. Each persona
// fixes three things at once: the TTS voice gender, and the personality the
// AGENT adopts from then on (its name + tone), so the reply both sounds and
// behaves like the named character.
//
// Pure module (no React/Expo imports) so it is unit-testable in Node.

import type { VoiceGender } from './config';

export type PersonaId = 'osamah' | 'mira' | 'karim';

export interface Persona {
  id: PersonaId;
  name: string;
  gender: VoiceGender;
  /** Seeded into every agent turn so the MODEL actually plays the part. */
  hint: string;
}

export const PERSONAS: Record<PersonaId, Persona> = {
  osamah: {
    id: 'osamah',
    name: 'أسامة',
    gender: 'female',
    hint: '',
  },
  mira: {
    id: 'mira',
    name: 'ميرا',
    gender: 'female',
    hint:
      'أنت الآن «ميرا» — مُساعِدة صوتية أنثوية لطيفة ودافئة. اسمك ميرا ' +
      'وتتحدثين بصوت أنثوي. خاطبي المستخدم بكلماتها وعامليها كصديقة، ووقّعي ' +
      'أجوبتك بلطف مع الحفاظ على الاختصار والوضوح.',
  },
  karim: {
    id: 'karim',
    name: 'كريم',
    gender: 'male',
    hint:
      'أنت الآن «كريم» — مُساعِد صوتي ذكوري واثق ودود. اسمك كريم وتتحدث ' +
      'بصوت ذكوري. خاطب المستخدم بثقة ودفء، مع الحفاظ على الاختصار والوضوح.',
  },
};

export function isPersonaId(value: unknown): value is PersonaId {
  return value === 'osamah' || value === 'mira' || value === 'karim';
}

export function personaById(id: PersonaId | undefined): Persona {
  return (id && PERSONAS[id]) || PERSONAS.osamah;
}
export const TOPICS = [
  'maths',
  'riddles',
  'idioms',
  'rearrange_letters',
  'general',
] as const;

export type TopicKey = (typeof TOPICS)[number];

export const TOPIC_META: Record<TopicKey, { label: string; color: string; bg: string }> = {
  maths:             { label: 'Maths',            color: 'text-cyan-300',    bg: 'bg-cyan-500/20 border-cyan-400/50' },
  riddles:           { label: 'Riddles',          color: 'text-violet-300',  bg: 'bg-violet-500/20 border-violet-400/50' },
  idioms:            { label: 'Idioms',           color: 'text-amber-300',   bg: 'bg-amber-500/20 border-amber-400/50' },
  rearrange_letters: { label: 'Rearrange Letters',color: 'text-rose-300',    bg: 'bg-rose-500/20 border-rose-400/50' },
  general:           { label: 'General',          color: 'text-emerald-300', bg: 'bg-emerald-500/20 border-emerald-400/50' },
};

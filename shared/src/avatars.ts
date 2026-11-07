import type { AvatarOption } from './types';

export const AVATARS: AvatarOption[] = [
  { id: 'tophat', emoji: '🎩', label: 'Top hat' },
  { id: 'car', emoji: '🚗', label: 'Race car' },
  { id: 'dog', emoji: '🐕', label: 'Lucky pup' },
  { id: 'ship', emoji: '🚢', label: 'Steamship' },
  { id: 'boot', emoji: '🥾', label: 'Old boot' },
  { id: 'cat', emoji: '🐈', label: 'Cool cat' },
  { id: 'plane', emoji: '✈️', label: 'Airplane' },
  { id: 'rocket', emoji: '🚀', label: 'Rocket' },
  { id: 'crown', emoji: '👑', label: 'Crown' },
  { id: 'alien', emoji: '👽', label: 'Alien' },
  { id: 'robot', emoji: '🤖', label: 'Robot' },
  { id: 'fox', emoji: '🦊', label: 'Fox' },
  { id: 'frog', emoji: '🐸', label: 'Frog' },
  { id: 'penguin', emoji: '🐧', label: 'Penguin' },
  { id: 'octopus', emoji: '🐙', label: 'Octopus' },
  { id: 'unicorn', emoji: '🦄', label: 'Unicorn' },
  { id: 'pizza', emoji: '🍕', label: 'Pizza' },
  { id: 'dice', emoji: '🎲', label: 'Dice' },
  { id: 'key', emoji: '🔑', label: 'Key' },
  { id: 'star', emoji: '⭐', label: 'Star' },
];

export const PLAYER_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#eab308',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#0ea5e9',
  '#84cc16',
];

export function emojiFor(avatarId: string): string {
  return AVATARS.find((a) => a.id === avatarId)?.emoji ?? '🎩';
}

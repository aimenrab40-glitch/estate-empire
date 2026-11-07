import type { AvatarOption } from './types';

export const AVATARS: AvatarOption[] = [
  { id: 'tophat', emoji: 'T', label: 'Top hat' },
  { id: 'car', emoji: 'C', label: 'Race car' },
  { id: 'dog', emoji: 'D', label: 'Lucky pup' },
  { id: 'ship', emoji: 'S', label: 'Steamship' },
  { id: 'boot', emoji: 'B', label: 'Old boot' },
  { id: 'cat', emoji: 'K', label: 'Cool cat' },
  { id: 'plane', emoji: 'P', label: 'Airplane' },
  { id: 'rocket', emoji: 'R', label: 'Rocket' },
  { id: 'crown', emoji: 'Q', label: 'Crown' },
  { id: 'alien', emoji: 'A', label: 'Alien' },
  { id: 'robot', emoji: 'O', label: 'Robot' },
  { id: 'fox', emoji: 'F', label: 'Fox' },
  { id: 'frog', emoji: 'G', label: 'Frog' },
  { id: 'penguin', emoji: 'N', label: 'Penguin' },
  { id: 'octopus', emoji: 'E', label: 'Octopus' },
  { id: 'unicorn', emoji: 'U', label: 'Unicorn' },
  { id: 'pizza', emoji: 'Z', label: 'Pizza' },
  { id: 'dice', emoji: 'L', label: 'Dice' },
  { id: 'key', emoji: 'Y', label: 'Key' },
  { id: 'star', emoji: 'V', label: 'Star' },
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
  return AVATARS.find((a) => a.id === avatarId)?.emoji ?? 'T';
}

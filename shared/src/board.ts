import type { Tile } from './types';

export const STARTING_CASH = 1500;
export const GO_SALARY = 200;
export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 2;
export const JAIL_INDEX = 10;
export const GO_TO_JAIL_INDEX = 30;
export const JAIL_TURNS_BEFORE_FINE = 3;
export const JAIL_FINE = 50;

/**
 * Classic-style 40 tile ring with original neighbourhood names.
 * Indices run clockwise starting at the top-left corner:
 *   0-10   top row, left to right   (0 = GO corner,  10 = Jail corner)
 *   11-20  right column, top to bottom (20 = Free Parking corner)
 *   21-30  bottom row, right to left (30 = Go To Jail corner)
 *   31-39  left column, bottom to top
 */
export const BOARD: Tile[] = [
  { index: 0, name: 'GO', kind: 'go', icon: '🎁' },
  { index: 1, name: 'Baker Street', kind: 'property', group: 'brown', price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50, icon: '🏡' },
  { index: 2, name: 'Community Chest', kind: 'chest', icon: '🧰' },
  { index: 3, name: 'Harbour Lane', kind: 'property', group: 'brown', price: 60, rent: [4, 20, 60, 180, 320, 450], houseCost: 50, icon: '🌊' },
  { index: 4, name: 'Income Tax', kind: 'tax', amount: 200, icon: '💸' },
  { index: 5, name: 'North Station', kind: 'railroad', group: 'rail', price: 200, icon: '🚉' },
  { index: 6, name: 'Willow Way', kind: 'property', group: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50, icon: '🌿' },
  { index: 7, name: 'Chance', kind: 'chance', icon: '❓' },
  { index: 8, name: 'Rose Road', kind: 'property', group: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50, icon: '🌹' },
  { index: 9, name: 'Maple Avenue', kind: 'property', group: 'lightblue', price: 120, rent: [8, 40, 100, 300, 450, 600], houseCost: 50, icon: '🍁' },
  { index: 10, name: 'Jail', kind: 'jail', icon: '🔒' },
  { index: 11, name: 'Cherry Court', kind: 'property', group: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100, icon: '🍒' },
  { index: 12, name: 'Power Plant', kind: 'utility', group: 'utility', price: 150, icon: '⚡' },
  { index: 13, name: 'Sunset Street', kind: 'property', group: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100, icon: '🌅' },
  { index: 14, name: 'Garden Grove', kind: 'property', group: 'pink', price: 160, rent: [12, 60, 180, 500, 700, 900], houseCost: 100, icon: '🌸' },
  { index: 15, name: 'East Station', kind: 'railroad', group: 'rail', price: 200, icon: '🚆' },
  { index: 16, name: 'Ocean Drive', kind: 'property', group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100, icon: '🏖️' },
  { index: 17, name: 'Community Chest', kind: 'chest', icon: '🧰' },
  { index: 18, name: 'Pier Place', kind: 'property', group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100, icon: '⚓' },
  { index: 19, name: 'Summit Way', kind: 'property', group: 'orange', price: 200, rent: [16, 80, 220, 600, 800, 1000], houseCost: 100, icon: '⛰️' },
  { index: 20, name: 'Free Parking', kind: 'parking', icon: '🅿️' },
  { index: 21, name: 'Red Rock Road', kind: 'property', group: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 100, icon: '🪨' },
  { index: 22, name: 'Chance', kind: 'chance', icon: '❓' },
  { index: 23, name: 'Canyon Close', kind: 'property', group: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 100, icon: '🏜️' },
  { index: 24, name: 'Desert Drive', kind: 'property', group: 'red', price: 240, rent: [20, 100, 300, 750, 925, 1100], houseCost: 100, icon: '🐫' },
  { index: 25, name: 'West Station', kind: 'railroad', group: 'rail', price: 200, icon: '🚂' },
  { index: 26, name: 'Yellow Yard', kind: 'property', group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 100, icon: '🌻' },
  { index: 27, name: 'Lagoon Lane', kind: 'property', group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 100, icon: '🐠' },
  { index: 28, name: 'Water Works', kind: 'utility', group: 'utility', price: 150, icon: '🚰' },
  { index: 29, name: 'Marina Mile', kind: 'property', group: 'yellow', price: 280, rent: [24, 120, 360, 850, 1025, 1200], houseCost: 100, icon: '⛵' },
  { index: 30, name: 'Go To Jail', kind: 'gotojail', icon: '🚓' },
  { index: 31, name: 'Green Gardens', kind: 'property', group: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, icon: '🌳' },
  { index: 32, name: 'Grove Green', kind: 'property', group: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, icon: '🌲' },
  { index: 33, name: 'Community Chest', kind: 'chest', icon: '🧰' },
  { index: 34, name: 'Highland Heights', kind: 'property', group: 'green', price: 320, rent: [28, 140, 420, 1000, 1200, 1400], houseCost: 200, icon: '🏔️' },
  { index: 35, name: 'Central Station', kind: 'railroad', group: 'rail', price: 200, icon: '🛤️' },
  { index: 36, name: 'Chance', kind: 'chance', icon: '❓' },
  { index: 37, name: 'Diamond District', kind: 'property', group: 'blue', price: 350, rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200, icon: '💎' },
  { index: 38, name: 'Luxury Tax', kind: 'tax', amount: 100, icon: '🥂' },
  { index: 39, name: 'Skyline Square', kind: 'property', group: 'blue', price: 400, rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200, icon: '🏙️' },
];

export const GROUP_TILES: Record<string, number[]> = BOARD.reduce(
  (acc, tile) => {
    if (tile.group) {
      (acc[tile.group] ||= []).push(tile.index);
    }
    return acc;
  },
  {} as Record<string, number[]>,
);

export const GROUP_COLOR_HEX: Record<string, string> = {
  brown: '#a9714b',
  lightblue: '#5ec8f2',
  pink: '#f45fa8',
  orange: '#ff9142',
  red: '#f45b5b',
  yellow: '#f7c948',
  green: '#4fc46a',
  blue: '#5b8def',
  rail: '#3a4358',
  utility: '#7b86a0',
};

export const GROUP_LABEL: Record<string, string> = {
  brown: 'Brown',
  lightblue: 'Sky',
  pink: 'Pink',
  orange: 'Orange',
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  rail: 'Station',
  utility: 'Utility',
};

/** Mortgage payout: half the purchase price (classic rule). */
export const mortgageValue = (t: Tile): number => Math.floor((t.price ?? 0) / 2);
/** Unmortgage cost: mortgage value + 10% interest. */
export const unmortgageCost = (t: Tile): number =>
  mortgageValue(t) + Math.ceil(mortgageValue(t) * 0.1);

/** Which side of the board a tile sits on — drives label rotation. */
export type BoardSide = 'top' | 'right' | 'bottom' | 'left';

export function tileSide(index: number): BoardSide {
  if (index <= 10) return 'top';
  if (index <= 20) return 'right';
  if (index <= 30) return 'bottom';
  return 'left';
}

/** Grid position (1-based, 11x11 board) for a tile index. */
export function tileGridPos(index: number): { row: number; col: number } {
  if (index <= 10) return { row: 1, col: 1 + index };
  if (index <= 20) return { row: index - 9, col: 11 };
  if (index <= 30) return { row: 11, col: 31 - index };
  return { row: 41 - index, col: 1 };
}

export function isBuyable(tile: Tile): boolean {
  return tile.kind === 'property' || tile.kind === 'railroad' || tile.kind === 'utility';
}

export function groupOf(tile: Tile): string | null {
  return tile.group ?? null;
}

export function isCorner(index: number): boolean {
  return index === 0 || index === 10 || index === 20 || index === 30;
}

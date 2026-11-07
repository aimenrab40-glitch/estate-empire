/**
 * Chance & Community deck definitions (shared so the client can render the
 * exact card text that the server resolved).
 */

export type CardEffect =
  | { type: 'moveTo'; tile: number; collectGo?: boolean }
  | { type: 'moveBy'; delta: number }
  | { type: 'nearest'; kind: 'railroad' | 'utility'; doubleRent?: boolean }
  | { type: 'bank'; amount: number }
  | { type: 'eachPlayer'; amount: number }
  | { type: 'fromEachPlayer'; amount: number }
  | { type: 'jail' }
  | { type: 'jailFree' };

export interface Card {
  id: string;
  text: string;
  effect: CardEffect;
}

export const CHANCE_CARDS: Card[] = [
  { id: 'ch-go', text: 'Advance to GO. Collect $200.', effect: { type: 'moveTo', tile: 0, collectGo: true } },
  { id: 'ch-baker', text: 'Advance to Baker Street. If you pass GO, collect $200.', effect: { type: 'moveTo', tile: 1, collectGo: true } },
  { id: 'ch-sunset', text: 'Advance to Sunset Street. If you pass GO, collect $200.', effect: { type: 'moveTo', tile: 13, collectGo: true } },
  { id: 'ch-summit', text: 'Advance to Summit Way. If you pass GO, collect $200.', effect: { type: 'moveTo', tile: 39, collectGo: true } },
  { id: 'ch-rail', text: 'Advance to the nearest Station and pay double rent.', effect: { type: 'nearest', kind: 'railroad', doubleRent: true } },
  { id: 'ch-util', text: 'Advance to the nearest Utility. Rent is doubled if they own it.', effect: { type: 'nearest', kind: 'utility', doubleRent: true } },
  { id: 'ch-back3', text: 'Go back 3 spaces.', effect: { type: 'moveBy', delta: -3 } },
  { id: 'ch-dividend', text: 'The bank pays you a dividend of $50.', effect: { type: 'bank', amount: 50 } },
  { id: 'ch-poor', text: 'Pay poor tax of $15.', effect: { type: 'bank', amount: -15 } },
  { id: 'ch-cafe', text: 'Fancy a coffee? Pay $25.', effect: { type: 'bank', amount: -25 } },
  { id: 'ch-jail', text: 'Go directly to Jail. Do not pass GO, do not collect $200.', effect: { type: 'jail' } },
  { id: 'ch-free', text: 'Get out of Jail free. Keep this card until needed.', effect: { type: 'jailFree' } },
  { id: 'ch-parking', text: 'Take a breather — advance to Free Parking.', effect: { type: 'moveTo', tile: 20 } },
];

export const CHEST_CARDS: Card[] = [
  { id: 'cc-go', text: 'Advance to GO. Collect $200.', effect: { type: 'moveTo', tile: 0, collectGo: true } },
  { id: 'cc-error', text: 'Bank error in your favor. Collect $200.', effect: { type: 'bank', amount: 200 } },
  { id: 'cc-doctor', text: "Doctor's fees. Pay $50.", effect: { type: 'bank', amount: -50 } },
  { id: 'cc-stock', text: 'From sale of stock you get $50.', effect: { type: 'bank', amount: 50 } },
  { id: 'cc-jail', text: 'Go to Jail. Do not pass GO, do not collect $200.', effect: { type: 'jail' } },
  { id: 'cc-free', text: 'Get out of Jail free. Keep this card until needed.', effect: { type: 'jailFree' } },
  { id: 'cc-holiday', text: 'Holiday fund matures. Collect $100.', effect: { type: 'bank', amount: 100 } },
  { id: 'cc-refund', text: 'Income tax refund. Collect $20.', effect: { type: 'bank', amount: 20 } },
  { id: 'cc-birthday', text: "It's your birthday. Collect $10 from every player.", effect: { type: 'fromEachPlayer', amount: 10 } },
  { id: 'cc-life', text: 'Life insurance matures. Collect $100.', effect: { type: 'bank', amount: 100 } },
  { id: 'cc-hospital', text: 'Hospital fees. Pay $100.', effect: { type: 'bank', amount: -100 } },
  { id: 'cc-school', text: 'School fees. Pay $50.', effect: { type: 'bank', amount: -50 } },
  { id: 'cc-consult', text: 'Consultancy fee. Receive $25.', effect: { type: 'bank', amount: 25 } },
  { id: 'cc-night', text: 'Night out on the town. Pay $40.', effect: { type: 'bank', amount: -40 } },
  { id: 'cc-contest', text: 'You won second prize in a beauty contest. Collect $10.', effect: { type: 'bank', amount: 10 } },
  { id: 'cc-inherit', text: 'You inherit $100.', effect: { type: 'bank', amount: 100 } },
];

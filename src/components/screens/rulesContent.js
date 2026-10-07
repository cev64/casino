/**
 * Rules shown in the "How to play" sheet. Plain data so a feature can be added by adding a row.
 * Section kinds:
 *   'terms'  - { term, text }   what a term means
 *   'values' - { term, value }  payouts and numbers (right aligned)
 * Keep in step with src/lib/blackjack.js and src/lib/craps.js.
 */
export const RULES = {
  blackjack: {
    label: 'Blackjack',
    summary: 'Finish closer to 21 than the dealer without going over.',
    sections: [
      {
        title: 'Cards',
        kind: 'terms',
        items: [
          { term: '2 to 10', text: 'Face value.' },
          { term: 'J, Q, K', text: 'Worth 10.' },
          { term: 'Ace', text: 'Worth 11, or 1 if that would go over 21.' },
        ],
      },
      {
        title: 'Your turn',
        kind: 'terms',
        items: [
          { term: 'Hit', text: 'Take another card.' },
          { term: 'Stand', text: 'Keep your hand.' },
          { term: 'Double', text: 'Double the bet on your first two cards, take one card, then stand. Allowed after a split.' },
          { term: 'Split', text: 'Split a pair of the same rank into two hands, up to four. Split aces get one card each.' },
          { term: 'Surrender', text: 'Give up the hand on your first decision and get half the bet back. Not after a split.' },
          { term: 'Insurance', text: 'Offered when the dealer shows an ace. Costs half the bet and pays 2 to 1 if the dealer has blackjack.' },
          { term: 'Even money', text: 'With a blackjack against a dealer ace, take 1 to 1 immediately instead of insurance.' },
        ],
      },
      {
        title: 'Dealer',
        kind: 'terms',
        items: [
          { term: 'Draws', text: 'Hits on 16 or less.' },
          { term: 'Stands', text: 'On every 17, including soft 17.' },
          { term: 'Peeks', text: 'Checks for blackjack when showing an ace or a ten.' },
        ],
      },
      {
        title: 'Payouts',
        kind: 'values',
        items: [
          { term: 'Win', value: '1 to 1' },
          { term: 'Blackjack', value: '3 to 2' },
          { term: '21 after a split', value: '1 to 1' },
          { term: 'Insurance', value: '2 to 1' },
          { term: 'Push', value: 'Bet returned' },
          { term: 'Surrender', value: 'Half returned' },
          { term: 'Bust', value: 'Bet lost' },
        ],
      },
      {
        title: 'Shoe',
        kind: 'terms',
        items: [
          { term: 'Decks', text: 'Six, shuffled when about a quarter of the shoe remains.' },
        ],
      },
    ],
  },

  craps: {
    label: 'Craps',
    summary: 'Bet on how two dice land. The shooter rolls; everyone bets on the same rolls.',
    sections: [
      {
        title: 'A round',
        kind: 'terms',
        items: [
          { term: 'Come out', text: 'The first roll. 7 or 11 wins for Pass. 2, 3 or 12 loses for Pass.' },
          { term: 'Point', text: 'Any other number becomes the point. The shooter keeps rolling.' },
          { term: 'Point made', text: 'The point rolls again before a 7. Pass wins.' },
          { term: 'Seven out', text: 'A 7 rolls first. Pass loses and a new round starts.' },
        ],
      },
      {
        title: 'Line bets',
        kind: 'terms',
        items: [
          { term: 'Pass', text: 'Wins with the shooter. Pays 1 to 1.' },
          { term: 'Don’t Pass', text: 'Wins on 2 or 3 and after a seven out. 12 on the come out is a push.' },
          { term: 'Come', text: 'Like Pass, started after the point is set. It moves to the number rolled.' },
          { term: 'Don’t Come', text: 'Like Don’t Pass, started after the point is set. 12 is a push.' },
          { term: 'Contract bets', text: 'Pass and Come bets cannot be taken down once a point is set.' },
        ],
      },
      {
        title: 'Odds',
        kind: 'values',
        items: [
          { term: 'Pass or Come odds, 4 or 10', value: '2 to 1' },
          { term: 'Pass or Come odds, 5 or 9', value: '3 to 2' },
          { term: 'Pass or Come odds, 6 or 8', value: '6 to 5' },
          { term: 'Lay odds, 4 or 10', value: '1 to 2' },
          { term: 'Lay odds, 5 or 9', value: '2 to 3' },
          { term: 'Lay odds, 6 or 8', value: '5 to 6' },
        ],
      },
      {
        title: 'Place',
        kind: 'values',
        items: [
          { term: 'Place 4 or 10', value: '9 to 5' },
          { term: 'Place 5 or 9', value: '7 to 5' },
          { term: 'Place 6 or 8', value: '7 to 6' },
        ],
      },
      {
        title: 'One roll and hardways',
        kind: 'values',
        items: [
          { term: 'Field: 3, 4, 9, 10, 11', value: '1 to 1' },
          { term: 'Field: 2 or 12', value: '2 to 1' },
          { term: 'Any seven', value: '4 to 1' },
          { term: 'Any craps', value: '7 to 1' },
          { term: 'Horn: 2 or 12', value: '30 to 1' },
          { term: 'Horn: 3 or 11', value: '15 to 1' },
          { term: 'Hard 4 or 10', value: '7 to 1' },
          { term: 'Hard 6 or 8', value: '9 to 1' },
        ],
      },
      {
        title: 'Notes',
        kind: 'terms',
        items: [
          { term: 'Odds limits', text: 'Pass and Come odds up to 3x on 4 and 10, 4x on 5 and 9, 5x on 6 and 8. Lay odds up to 6x.' },
          { term: 'Come and lay odds', text: 'Odds on Come and Don’t Come bets are off on the come out roll. If that roll would settle them, the odds are returned as a push.' },
          { term: 'Place bets', text: 'Off on the come out roll. They stay up after a win and lose on a 7.' },
          { term: 'Hardways', text: 'Off on the come out roll. They stay up after a win and lose on a 7 or when the number rolls the easy way.' },
          { term: 'Big 6 and Big 8', text: 'Pay 1 to 1 and lose on any 7.' },
          { term: 'Limits', text: 'Bets run from $5 to $500. Odds and one roll bets can start at $1.' },
          { term: 'Payouts', text: 'Winnings are paid in whole dollars, rounded down.' },
        ],
      },
    ],
  },
};

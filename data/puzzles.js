/*
 * Daily puzzles, keyed by date (YYYY-MM-DD, the player's local date).
 *
 * Each day has one entry per round in SENATORDLE_CONFIG.rounds ("normal", "hard").
 *
 *   answer  The answer's id in data/senators.js.
 *   clues   Listed from vaguest to most specific. Each clue is either:
 *             - a plain string, or
 *             - an object: { text, reveals?, category? }
 *               reveals:  ["state"] and/or ["party"]. Once the player reaches
 *                         this clue, search results stop showing that fact
 *                         ("(D-GA)" becomes "(GA)" or "(D)").
 *               category: optional short label (e.g. "Previous Job"), kept for
 *                         the planned "chosen hints" feature.
 *
 * PLACEHOLDER DATA: sample rounds taken from Senator_Clues.txt.
 */
window.PUZZLES = {
  '2026-11-14': {
    normal: {
      answer: 'ted-cruz',
      clues: [
        'This senator is a man.',
        'This senator graduated from an Ivy League school.',
        'This senator is currently serving.',
        "Before taking office, this senator served as their state's Solicitor General.",
        'This senator was the first Hispanic American elected in their state.',
        'This senator was first elected in 2012, with 56% of the vote.',
        { text: 'This senator is a member of the Republican Party.', reveals: ['party'] },
        'This senator has run for President.',
        'In their most recent election, this senator defeated Colin Allred.',
        'This senator placed second in the 2016 GOP Presidential Primaries.',
      ],
    },
    hard: {
      answer: 'marsha-blackburn',
      clues: [
        'This senator was born and educated in Mississippi.',
        'This senator served as a U.S. representative before becoming a senator.',
        'This senator was re-elected in 2024.',
        'This senator is a woman.',
        'This senator was first elected to the Senate at age 66.',
        { text: 'This senator is a member of the Republican Party.', reveals: ['party'] },
        'This senator was the first woman elected in their state.',
        'This senator is heavily associated with the Tea Party Movement.',
        "In this senator's first election, they defeated former governor Phil Bredesen.",
        { text: 'This senator will leave the Senate in early 2027 to become governor of Tennessee.', reveals: ['state'] },
      ],
    },
  },

  '2026-11-15': {
    normal: {
      answer: 'bernie-sanders',
      clues: [
        'This senator served as a mayor before being elected.',
        'This senator is currently serving.',
        'This senator does not go by their legal first name.',
        'This senator was first elected to the Senate at age 65.',
        "This senator previously served as a U.S. representative for their state's at-large congressional district.",
        'This senator won every county in their state in their first three senate elections.',
        'This senator was first elected in 2006.',
        { text: 'This senator is neither a Democrat nor Republican.', reveals: ['party'] },
        'This senator is ideologically associated with Democratic Socialism.',
        'This senator placed second in the 2016 Democratic Presidential Primaries.',
      ],
    },
    hard: {
      answer: 'jon-ossoff',
      clues: [
        'This senator is the senator for their birth state.',
        'This senator does not go by their legal first name.',
        "This senator's mother was born in Australia.",
        'This senator lost their first race for public office.',
        { text: 'This senator is a member of the Democratic party.', reveals: ['party'] },
        'This senator defeated an incumbent to join the senate.',
        "This senator was first elected on the same day as their state's other senator.",
        'This senator worked as an investigative journalist and documentary filmmaker before running for office.',
        'This senator was the youngest elected since 1980.',
        'This senator was re-elected in 2026 by defeating Mike Collins in a landslide.',
      ],
    },
  },
};

/* Global configuration and shared constants. */
window.SENATORDLE_CONFIG = {
  // Puzzle #1 is played on this date. Puzzle numbers count up from here.
  launchDate: '2026-11-14',

  // Rounds played each day, in order.
  rounds: [
    { key: 'normal', label: 'Normal' },
    { key: 'hard', label: 'Hard' },
  ],

  // Max results shown in the search dropdown.
  maxResults: 40,

  // Used for any senator without an `image` in data/senators.js.
  placeholderImage: 'images/Generic_Image.png',

  // How long (ms) "Skip" and "Give up" must be held down.
  holdDuration: 800,

  // Party codes used in data/senators.js. Anything missing here is shown as-is.
  parties: {
    D: { name: 'Democratic', short: 'D' },
    R: { name: 'Republican', short: 'R' },
    I: { name: 'Independent', short: 'I' },
  },

  states: {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
    MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
    OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  },
};

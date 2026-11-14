# Senatordle

The daily U.S. senator guessing game. Each day has two rounds, **Normal** and **Hard**. Each round has a mystery senator and about 10 handwritten clues, going from vague to specific. After each clue you can guess or skip.

## Running it

It's a static site with no build step and no dependencies.

- **Locally:** open `index.html` in a browser, or serve the folder (`python -m http.server`) and go to `http://localhost:8000`.
- **Hosting:** GitHub Pages works as-is. Settings → Pages → deploy from `main`, root folder.

## Project layout

```
index.html          Page markup and dialogs
css/style.css       Styles (light and dark)
js/config.js        Launch date, rounds, state and party lists
js/storage.js       localStorage: saved games, stats, flags
js/search.js        Senator search box (name match + state/party filters)
js/app.js           Game controller: picks the puzzle, runs rounds, renders, shares
data/senators.js    Senator database (everyone a player can guess)
data/puzzles.js     Daily puzzles keyed by date
```

## Adding data

### Senators: `data/senators.js`

```js
{ id: 'cruz-ted', name: 'Ted Cruz', aliases: ['Rafael Cruz'], state: 'TX', party: ['R'], start: 2013, end: null }
```

`party` is an array, so party switchers work (`['D', 'R']`). Leave out `end` (or set it to `null`) if the senator is still serving. Optional fields: `aliases`, `sortName`, `wiki`.

### Puzzles: `data/puzzles.js`

```js
'2026-11-14': {
  normal: { answer: 'cruz-ted', clues: [
    'This senator is a man.',
    { text: 'This senator is a member of the Republican Party.', reveals: ['party'] },
    ...
  ]},
  hard: { answer: 'blackburn-marsha', clues: [ ... ] },
}
```

- Dates use the player's local date. A day with no entry shows a "No puzzle today" screen.
- `reveals: ['state' | 'party']` marks the clue that gives that fact away. The matching search filter, and the state or party shown in search results, stay hidden until the player reaches that clue.
- `category` (optional) is a short label like `"Previous Job"`. Locked clues show it instead of "Locked". It's there to support the planned "chosen hints" feature.

When the page loads it checks the data and prints problems to the browser console, such as an unknown answer id, a duplicate id or a bad state code.

## Gameplay rules

- You start with clue 1. A wrong guess or a skip reveals the next clue.
- A wrong guess or a skip on the last clue ends the round, and so does **Give up**.
- Your score is the clue number you solved it on.
- Progress and stats are saved in localStorage. Stats and streaks are kept separately for each round, and only today's puzzle counts toward them.
- `?date=YYYY-MM-DD` plays a past puzzle (archive). It doesn't count toward stats, and future dates aren't allowed.

/*
 * Senator database. Every senator a player can guess must be listed here.
 *
 * Fields:
 *   id       (required) Unique slug. Puzzles use this to name the answer.
 *   name     (required) Display name.
 *   state    (required) Two-letter state code.
 *   party    (required) Array of party codes held while serving, e.g. ["D"] or ["D","R"].
 *   start    (required) Year first took office in the Senate.
 *   end      (optional) Year left the Senate. Use null or leave it out if still serving.
 *   aliases  (optional) Other names to match in search (legal names, nicknames).
 *   sortName (optional) Name to sort by. Defaults to the last word of `name`.
 *   wiki     (optional) URL shown on the results card.
 *
 * PLACEHOLDER DATA: a starter set taken from the examples in Senatordle.txt.
 * Check it and expand it before launch.
 */
window.SENATORS = [
  { id: 'cruz-ted', name: 'Ted Cruz', aliases: ['Rafael Cruz'], state: 'TX', party: ['R'], start: 2013 },
  { id: 'blackburn-marsha', name: 'Marsha Blackburn', state: 'TN', party: ['R'], start: 2019 },
  { id: 'sanders-bernie', name: 'Bernie Sanders', aliases: ['Bernard Sanders'], state: 'VT', party: ['I'], start: 2007 },
  { id: 'ossoff-jon', name: 'Jon Ossoff', aliases: ['Thomas Jonathan Ossoff'], state: 'GA', party: ['D'], start: 2021 },
  { id: 'schumer-chuck', name: 'Chuck Schumer', aliases: ['Charles Schumer'], state: 'NY', party: ['D'], start: 1999 },
  { id: 'mcconnell-mitch', name: 'Mitch McConnell', aliases: ['Addison Mitchell McConnell'], state: 'KY', party: ['R'], start: 1985 },
  { id: 'warren-elizabeth', name: 'Elizabeth Warren', state: 'MA', party: ['D'], start: 2013 },
  { id: 'harris-kamala', name: 'Kamala Harris', state: 'CA', party: ['D'], start: 2017, end: 2021 },
  { id: 'obama-barack', name: 'Barack Obama', state: 'IL', party: ['D'], start: 2005, end: 2008 },
  { id: 'biden-joe', name: 'Joe Biden', aliases: ['Joseph Biden'], state: 'DE', party: ['D'], start: 1973, end: 2009 },
  { id: 'clinton-hillary', name: 'Hillary Clinton', aliases: ['Hillary Rodham Clinton'], state: 'NY', party: ['D'], start: 2001, end: 2009 },
  { id: 'collins-susan', name: 'Susan Collins', state: 'ME', party: ['R'], start: 1997 },
  { id: 'fetterman-john', name: 'John Fetterman', state: 'PA', party: ['D'], start: 2023 },
  { id: 'vance-jd', name: 'JD Vance', aliases: ['J.D. Vance', 'James David Vance'], state: 'OH', party: ['R'], start: 2023, end: 2025 },
  { id: 'graham-lindsey', name: 'Lindsey Graham', state: 'SC', party: ['R'], start: 2003 },
  { id: 'rubio-marco', name: 'Marco Rubio', state: 'FL', party: ['R'], start: 2011, end: 2025 },
  { id: 'booker-cory', name: 'Cory Booker', state: 'NJ', party: ['D'], start: 2013 },
  { id: 'graham-bob', name: 'Bob Graham', aliases: ['Daniel Robert Graham'], state: 'FL', party: ['D'], start: 1987, end: 2005 },
  { id: 'thurmond-strom', name: 'Strom Thurmond', state: 'SC', party: ['D', 'R'], start: 1954, end: 2003 },
  { id: 'gore-al', name: 'Al Gore', aliases: ['Albert Gore'], state: 'TN', party: ['D'], start: 1985, end: 1993 },
  { id: 'kerry-john', name: 'John Kerry', state: 'MA', party: ['D'], start: 1985, end: 2013 },
  { id: 'kennedy-ted', name: 'Ted Kennedy', aliases: ['Edward Kennedy'], state: 'MA', party: ['D'], start: 1962, end: 2009 },
  { id: 'kennedy-robert', name: 'Robert F. Kennedy', aliases: ['Bobby Kennedy', 'RFK'], state: 'NY', party: ['D'], start: 1965, end: 1968 },
  { id: 'kennedy-jfk', name: 'John F. Kennedy', aliases: ['JFK', 'Jack Kennedy'], state: 'MA', party: ['D'], start: 1953, end: 1960 },
  { id: 'johnson-lbj', name: 'Lyndon B. Johnson', aliases: ['LBJ'], state: 'TX', party: ['D'], start: 1949, end: 1961 },
  { id: 'sasse-ben', name: 'Ben Sasse', state: 'NE', party: ['R'], start: 2015, end: 2023 },
  { id: 'mullin-markwayne', name: 'Markwayne Mullin', state: 'OK', party: ['R'], start: 2023 },
  { id: 'mccormick-dave', name: 'Dave McCormick', aliases: ['David McCormick'], state: 'PA', party: ['R'], start: 2025 },
  { id: 'gillibrand-kirsten', name: 'Kirsten Gillibrand', state: 'NY', party: ['D'], start: 2009 },
  { id: 'kennedy-john-la', name: 'John Kennedy', aliases: ['John Neely Kennedy'], state: 'LA', party: ['R'], start: 2017 },
  { id: 'scott-rick', name: 'Rick Scott', state: 'FL', party: ['R'], start: 2019 },
  { id: 'tuberville-tommy', name: 'Tommy Tuberville', state: 'AL', party: ['R'], start: 2021 },
  { id: 'grassley-chuck', name: 'Chuck Grassley', aliases: ['Charles Grassley'], state: 'IA', party: ['R'], start: 1981 },
  { id: 'hawley-josh', name: 'Josh Hawley', state: 'MO', party: ['R'], start: 2019 },
  { id: 'scott-tim', name: 'Tim Scott', state: 'SC', party: ['R'], start: 2013 },
  { id: 'lee-mike', name: 'Mike Lee', state: 'UT', party: ['R'], start: 2011 },
];

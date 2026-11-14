#!/usr/bin/env python3
"""
Build data/senators.js from Wikimedia data.

Covers everyone who served in the U.S. Senate on or after 1990-01-01, including
senators already in office on that date.

Sources:
  * Wikidata SPARQL (the structured data behind Wikipedia's infoboxes):
    each senator's Senate terms, with seat (state) and party.
  * Wikipedia API (prop=pageimages): each senator's article photo, with
    Wikidata's image (P18) as a fallback.

Usage (from the repo root):
    python tools/fetch_senators.py                    # fetch data, download missing photos
    python tools/fetch_senators.py --refresh-images   # download every photo again
    python tools/fetch_senators.py --no-images        # data only

Fix bad data in tools/senator_overrides.json, not in the generated file,
or the next run will overwrite your edits.
"""

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_JS = os.path.join(ROOT, 'data', 'senators.js')
IMG_DIR = os.path.join(ROOT, 'images', 'senators')
OVERRIDES = os.path.join(ROOT, 'tools', 'senator_overrides.json')

CUTOFF = '1990-01-01'
THUMB_WIDTH = 256
USER_AGENT = 'SenatordleDataBuilder/1.0 (hobby game; one-off data fetch script)'

SPARQL_URL = 'https://query.wikidata.org/sparql'
WIKI_API = 'https://en.wikipedia.org/w/api.php'
US_SENATOR = 'Q4416090'

STATES = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
    'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
    'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
    'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
    'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
    'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
    'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
    'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
}
SEAT_RE = re.compile(r'^(.+?) Class [123] senate seat$')


# --------------------------------------------------------------------------- HTTP

def http_get(url, params=None, accept='application/json', data=None, retries=4):
    if params:
        url += ('&' if '?' in url else '?') + urllib.parse.urlencode(params)
    headers = {'User-Agent': USER_AGENT, 'Accept': accept}
    body = urllib.parse.urlencode(data).encode() if data else None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=body, headers=headers)
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                wait = int(e.headers.get('Retry-After', 0) or 0) or 5 * (attempt + 1)
                print(f'  HTTP {e.code}, retrying in {wait}s…', file=sys.stderr)
                time.sleep(wait)
                continue
            raise
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
            raise


def sparql(query):
    raw = http_get(SPARQL_URL, data={'query': query}, accept='application/sparql-results+json')
    rows = json.loads(raw)['results']['bindings']
    return [{k: v['value'] for k, v in row.items()} for row in rows]


def qid(uri):
    return uri.rsplit('/', 1)[-1]


# --------------------------------------------------------------------------- Wikidata

def fetch_terms():
    """Every 'position held: United States senator' statement, with its qualifiers."""
    print('Querying Wikidata for Senate terms…')
    return sparql(f'''
SELECT ?p ?name ?article ?start ?end ?seatLabel ?grpLabel ?tstart ?tend WHERE {{
  ?p p:P39 ?st . ?st ps:P39 wd:{US_SENATOR} .
  OPTIONAL {{ ?p rdfs:label ?name FILTER(LANG(?name) = "en") }}
  OPTIONAL {{ ?st pq:P580 ?start }}
  OPTIONAL {{ ?st pq:P582 ?end }}
  OPTIONAL {{ ?st pq:P768 ?seat }}
  OPTIONAL {{ ?st pq:P4100 ?grp }}
  OPTIONAL {{ ?st pq:P2937 ?term .
             OPTIONAL {{ ?term wdt:P580 ?tstart }}
             OPTIONAL {{ ?term wdt:P582 ?tend }} }}
  OPTIONAL {{ ?article schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}''')


def fetch_people(qids):
    """Family name, aliases, P18 image and party memberships for the given people."""
    print(f'Querying Wikidata for details on {len(qids)} people…')
    info = {q: {'family': None, 'aliases': set(), 'p18': None, 'parties': []} for q in qids}
    qids = sorted(qids)
    for i in range(0, len(qids), 150):
        values = ' '.join(f'wd:{q}' for q in qids[i:i + 150])
        for r in sparql(f'''
SELECT ?p ?familyLabel ?alias ?img WHERE {{
  VALUES ?p {{ {values} }}
  OPTIONAL {{ ?p wdt:P734 ?family }}
  OPTIONAL {{ ?p skos:altLabel ?alias FILTER(LANG(?alias) = "en") }}
  OPTIONAL {{ ?p wdt:P18 ?img }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}'''):
            d = info[qid(r['p'])]
            if r.get('familyLabel') and not re.match(r'^Q\d+$', r['familyLabel']):
                d['family'] = d['family'] or r['familyLabel']
            if r.get('alias'):
                d['aliases'].add(r['alias'])
            if r.get('img'):
                d['p18'] = d['p18'] or r['img']
        for r in sparql(f'''
SELECT ?p ?partyLabel ?start ?end WHERE {{
  VALUES ?p {{ {values} }}
  ?p p:P102 ?ps . ?ps ps:P102 ?party .
  OPTIONAL {{ ?ps pq:P580 ?start }}
  OPTIONAL {{ ?ps pq:P582 ?end }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}'''):
            info[qid(r['p'])]['parties'].append(
                (r.get('partyLabel', ''), r.get('start', ''), r.get('end', '')))
        time.sleep(1)
    return info


# --------------------------------------------------------------------------- Transform

def party_code(label):
    if not label:
        return None
    if 'Democratic' in label:   # includes Minnesota's Democratic–Farmer–Labor Party
        return 'D'
    if 'Republican' in label:
        return 'R'
    return 'I'                  # independent politician, Independence Party of Minnesota, etc.


def slugify(text):
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def clean_alias(alias, name):
    alias = alias.strip()
    if alias.lower() == name.lower() or len(alias) > 40 or ' ' not in alias:
        return None
    if re.match(r'^(Sen\.?|Senator|Mr\.|Mrs\.|Ms\.|Dr\.|Hon\.) ', alias):
        return None
    if not re.fullmatch(r"[A-Za-zÀ-ÿ.'’\- ]+", alias):
        return None
    return alias


def display_name(row):
    """English Wikidata label, else the Wikipedia article title without '(politician)' etc."""
    if row.get('name'):
        return row['name']
    if row.get('article'):
        title = urllib.parse.unquote(row['article'].rsplit('/wiki/', 1)[-1]).replace('_', ' ')
        return re.sub(r'\s*\(.*\)$', '', title)
    return qid(row['p'])


def build(rows, today):
    """Group term rows by person and keep those who served on or after CUTOFF."""
    people = {}
    for r in rows:
        m = SEAT_RE.match(r.get('seatLabel', ''))
        if not m or m.group(1) not in STATES:
            continue                        # fictional characters and incomplete records
        start = (r.get('start') or r.get('tstart') or '')[:10]
        end = (r.get('end') or r.get('tend') or '')[:10]
        if not start or start > today:
            continue                        # not yet sworn in
        p = people.setdefault(qid(r['p']), {
            'qid': qid(r['p']), 'name': display_name(r), 'article': r.get('article'), 'terms': [],
        })
        p['terms'].append({
            'start': start,
            'end': end,
            'explicit_end': (r.get('end') or '')[:10],
            'state': STATES[m.group(1)],
            'party': r.get('grpLabel'),
        })
    return {q: p for q, p in people.items()
            if any(not t['end'] or t['end'] >= CUTOFF for t in p['terms'])}


def resolve_parties(p, memberships):
    """Senate parties in date order. Terms without a party fall back to P102 memberships."""
    found = []
    dated = sorted((m for m in memberships if m[1] or m[2]), key=lambda m: m[1] or m[2])
    for t in sorted(p['terms'], key=lambda t: t['start']):
        if t['party']:
            labels = [t['party']]
        else:
            # Every dated membership overlapping the term, in date order (catches
            # mid-term switches). Otherwise, any undated memberships.
            labels = [lab for lab, s, e in dated
                      if (not s or s[:10] <= (t['end'] or '9999')) and (not e or e[:10] >= t['start'])]
            if not labels:
                labels = [lab for lab, s, e in memberships if not s and not e]
        for label in labels:
            code = party_code(label)
            if code and code not in found:
                found.append(code)
    return found


# --------------------------------------------------------------------------- Wikipedia photos

def fetch_page_images(titles):
    """title -> (thumbnail URL, file name) using the Wikipedia pageimages API."""
    print(f'Querying Wikipedia for {len(titles)} article photos…')
    out = {}
    titles = sorted(set(titles))
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        data = json.loads(http_get(WIKI_API, {
            'action': 'query', 'format': 'json', 'formatversion': 2, 'redirects': 1,
            'prop': 'pageimages', 'piprop': 'thumbnail|name', 'pithumbsize': THUMB_WIDTH,
            'titles': '|'.join(batch),
        }))
        q = data.get('query', {})
        # Map requested titles through normalization/redirects to final titles.
        alias = {t: t for t in batch}
        for key in ('normalized', 'redirects'):
            for n in q.get(key, []):
                for k, v in alias.items():
                    if v == n['from']:
                        alias[k] = n['to']
        pages = {pg['title']: pg for pg in q.get('pages', [])}
        for t in batch:
            pg = pages.get(alias[t], {})
            if pg.get('thumbnail'):
                out[t] = (pg['thumbnail']['source'], pg.get('pageimage'))
        time.sleep(0.5)
    return out


def commons_thumb(file_url):
    """Thumbnail URL for a Wikidata P18 value (a Special:FilePath URL)."""
    name = urllib.parse.unquote(file_url.rsplit('/', 1)[-1])
    return (f'https://commons.wikimedia.org/wiki/Special:FilePath/{urllib.parse.quote(name)}?width={THUMB_WIDTH}',
            name)


def download(url, path):
    with open(path, 'wb') as f:
        f.write(http_get(url, accept='image/*'))


# --------------------------------------------------------------------------- Output

def js_value(v):
    return json.dumps(v, ensure_ascii=False)


def write_js(senators):
    order = ['id', 'name', 'state', 'party', 'start', 'end', 'aliases', 'sortName', 'image', 'imageSource', 'wiki', 'qid']
    lines = []
    for s in senators:
        parts = [f'{k}: {js_value(s[k])}' for k in order if s.get(k) not in (None, [], '')]
        lines.append('  { ' + ', '.join(parts) + ' },')
    header = f'''/*
 * Senator database. AUTO-GENERATED by tools/fetch_senators.py on {dt.date.today().isoformat()}.
 * Do not edit by hand: put fixes in tools/senator_overrides.json and run the script again.
 *
 * Covers everyone who served in the U.S. Senate on or after {CUTOFF}.
 * Sources: Wikidata (terms, seats, parties) and Wikipedia (photos).
 *
 * Fields:
 *   id          Unique slug. Puzzles use this to name the answer.
 *   name        Display name.
 *   state       Two-letter state code. For a senator who represented more than
 *               one state, the most recent one.
 *   party       Senate party codes in date order, e.g. ["R"] or ["D","I"].
 *   start/end   First and last year in the Senate. No `end` means still serving.
 *   aliases     Other names that search will match.
 *   sortName    Surname, used to sort search results.
 *   image       Local photo path. A senator without one uses the placeholder image.
 *   imageSource Wikipedia/Commons file page for the photo (license and attribution).
 *   wiki        Wikipedia article URL.
 *   qid         Wikidata item id.
 */
window.SENATORS = [
'''
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(header + '\n'.join(lines) + '\n];\n')


# --------------------------------------------------------------------------- Main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--no-images', action='store_true', help='skip photo lookup and download')
    ap.add_argument('--refresh-images', action='store_true', help='download every photo again')
    args = ap.parse_args()

    today = dt.date.today().isoformat()
    people = build(fetch_terms(), today)
    print(f'Found {len(people)} senators serving on or after {CUTOFF}.')
    details = fetch_people(people.keys())

    overrides = {}
    if os.path.exists(OVERRIDES):
        with open(OVERRIDES, encoding='utf-8') as f:
            overrides = {k: v for k, v in json.load(f).items() if not k.startswith('_')}

    senators = []
    for q, p in people.items():
        d = details[q]
        terms = sorted(p['terms'], key=lambda t: t['start'])
        serving = any(not t['explicit_end'] or t['explicit_end'] > today for t in terms)
        last_end = max(t['explicit_end'] for t in terms) if not serving else None
        name = p['name']
        s = {
            'qid': q,
            'name': name,
            'state': terms[-1]['state'],
            'party': resolve_parties(p, d['parties']),
            'start': int(terms[0]['start'][:4]),
            'end': int(last_end[:4]) if last_end else None,
            'aliases': sorted({a for a in (clean_alias(x, name) for x in d['aliases']) if a})[:6],
            'sortName': d['family'],
            'wiki': p['article'],
            '_p18': d['p18'],
        }
        s.update({k: v for k, v in overrides.get(q, {}).items() if not k.startswith('_')})
        senators.append(s)

    # Readable, stable ids: "ted-cruz". Same-name senators also get the state: "john-kennedy-la".
    base = {}
    for s in senators:
        base.setdefault(slugify(s['name']), []).append(s)
    for slug, group in base.items():
        for s in group:
            s['id'] = s.get('id') or (slug if len(group) == 1 else f"{slug}-{s['state'].lower()}")

    senators.sort(key=lambda s: (slugify(s.get('sortName') or s['name'].split()[-1]), s['name']))

    if not args.no_images:
        os.makedirs(IMG_DIR, exist_ok=True)
        titles = {s['wiki'].rsplit('/wiki/', 1)[-1]: s for s in senators if s.get('wiki')}
        page_imgs = fetch_page_images([urllib.parse.unquote(t).replace('_', ' ') for t in titles])
        print('Downloading photos…')
        for t, s in titles.items():
            title = urllib.parse.unquote(t).replace('_', ' ')
            src = page_imgs.get(title)
            if not src and s.get('_p18'):
                src = commons_thumb(s['_p18'])
            if not src:
                continue
            url, fname = src
            ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower()
            ext = ext if ext in ('.jpg', '.jpeg', '.png', '.gif', '.webp') else '.jpg'
            rel = f"images/senators/{s['id']}{ext}"
            path = os.path.join(ROOT, rel)
            if args.refresh_images or not os.path.exists(path):
                try:
                    download(url, path)
                    time.sleep(0.3)
                except Exception as e:  # keep going; that senator uses the placeholder
                    print(f"  ! photo failed for {s['name']}: {e}", file=sys.stderr)
                    continue
            s['image'] = rel
            if fname:
                s['imageSource'] = 'https://en.wikipedia.org/wiki/File:' + urllib.parse.quote(fname.replace(' ', '_'))
    else:
        # Keep links to photos that are already on disk.
        for s in senators:
            for ext in ('.jpg', '.jpeg', '.png', '.gif', '.webp'):
                if os.path.exists(os.path.join(IMG_DIR, s['id'] + ext)):
                    s['image'] = f"images/senators/{s['id']}{ext}"
                    break

    for s in senators:
        s.pop('_p18', None)
    write_js(senators)

    # ---- Report
    print(f'\nWrote {len(senators)} senators to {os.path.relpath(OUT_JS, ROOT)}')
    missing_party = [s['name'] for s in senators if not s['party']]
    missing_img = [s['name'] for s in senators if not s.get('image')]
    if missing_party:
        print(f'  No party found ({len(missing_party)}): {", ".join(missing_party)}')
    if not args.no_images:
        print(f'  No photo ({len(missing_img)}): {", ".join(missing_img) or "none"}')
    switchers = [f"{s['name']} ({'/'.join(s['party'])})" for s in senators if len(s['party']) > 1]
    print(f'  Party switchers ({len(switchers)}): {", ".join(switchers)}')

    # Sanity check: there should be about 100 senators serving on any given date.
    print('  Senators serving on Jan 4 of each year (should be ~100):')
    line = []
    for y in range(1990, int(today[:4]) + 1):
        day = f'{y}-01-04' if y > 1990 else '1990-01-02'
        n = 0
        for p in people.values():
            terms = sorted(p['terms'], key=lambda t: t['start'])
            # A latest term with no explicit end date means "still serving".
            ends = [t['end'] for t in terms[:-1]] + [terms[-1]['explicit_end']]
            n += any(t['start'] <= day and (not e or e >= day) for t, e in zip(terms, ends))
        line.append(f'{y}:{n}')
    print('   ', '  '.join(line))


if __name__ == '__main__':
    main()

'use strict';
// Builds a small, complete test film on disk: 1 character, 1 location, 3 shots.

const fs = require('fs');
const os = require('os');
const path = require('path');
const film = require('../lib/film');
const md = require('../lib/md');
const { lock } = require('../lib/lock');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'filmism-test-'));
}

function edit(dir, rel, fn) {
  film.write(dir, rel, fn(film.read(dir, rel)));
}

function answer(text, n, value) {
  return md.editSection(text, (t) => t.startsWith(`${n}.`), (b) =>
    md.setField(md.setField(b, 'Status', 'answered'), 'Answer', value));
}

const SHOTS = `
### Shot 01 — Wake
- **Beat:** Nina wakes in the empty classroom
- **Characters:** nina (school)
- **Location:** classroom
- **Framing:** medium close-up
- **Camera:** slow push-in
- **Length:** 5 s
- **Action:** she lifts her head from the desk and blinks
- **Dialogue:** —
- **Sound:** ticking clock, distant rain
- **Device:** —
- **Keyframe:**
- **Clip:**
- **Status:** planned

### Shot 02 — The Board
- **Beat:** She sees a message on the blackboard
- **Characters:** —
- **Location:** classroom
- **Framing:** wide, eye level
- **Camera:** static
- **Length:** 4 s
- **Action:** chalk dust drifts in the light
- **Dialogue:** —
- **Sound:** silence, one chalk squeak
- **Device:** insert shot
- **Keyframe:**
- **Clip:**
- **Status:** planned

### Shot 03 — Night
- **Beat:** She walks out into the night
- **Characters:** nina (night)
- **Location:** school gate at night
- **Framing:** low-angle wide
- **Camera:** tracking left
- **Length:** 5 s
- **Action:** she pushes the gate open and steps into the street
- **Dialogue:** "Nobody is coming."
- **Sound:** rain, a far siren
- **Device:** —
- **Keyframe:**
- **Clip:**
- **Status:** planned
`;

function makeFilm({ locked = true } = {}) {
  const parent = tmp();
  const dir = film.createFilm('Test Film', { idea: 'A girl wakes alone in a school at night', parent });

  edit(dir, 'FILM.md', (t) => {
    t = md.setField(t, 'Logline', 'A girl wakes alone in a school and must find out why.');
    t = md.setField(t, 'Tone', 'quiet, eerie');
    return md.setField(t, 'Runtime', '30 s');
  });
  edit(dir, 'STORY.md', (t) => {
    t = answer(t, 2, 'mystery, quiet horror');
    t = answer(t, 3, 'present day, one night');
    t = answer(t, 4, 'an empty city school');
    return answer(t, 5, 'Nina, 12, alone');
  });
  edit(dir, 'BIBLE.md', (t) => {
    t = md.setField(t, 'Avoid', 'modern phones, neon');
    t = md.setField(t, 'Midjourney params', '--style raw');
    return md.editSection(t, 'STYLE', () =>
      '\nShot on 35mm Kodak Vision3 500T, cold teal shadows, warm practical lights, soft grain, shallow depth of field.\n');
  });
  film.createCharacter(dir, 'Nina');
  edit(dir, 'characters/nina/CANON.md', (t) => {
    t = md.setField(t, 'Role', 'lead');
    t = md.editSection(t, 'Canon', () => '\nTwelve-year-old girl, thin, short black bob haircut, pale freckled face, big dark eyes.\n');
    return md.editSection(t, 'Looks', () =>
      '\n### school\n\nNavy school uniform, white collar, red scarf.\n\n### night\n\nYellow raincoat over the uniform, red scarf, wet hair.\n');
  });
  film.createLocation(dir, 'Classroom');
  edit(dir, 'locations/classroom/LOCATION.md', (t) =>
    md.editSection(t, 'Canon', () => '\nOld classroom, wooden desks in rows, green blackboard, tall windows.\n'));
  edit(dir, 'SHOTS.md', (t) => t + SHOTS);

  if (locked) {
    lock(dir, 'story');
    lock(dir, 'bible');
    lock(dir, 'character:nina');
    lock(dir, 'location:classroom');
  }
  return dir;
}

module.exports = { tmp, edit, answer, makeFilm };

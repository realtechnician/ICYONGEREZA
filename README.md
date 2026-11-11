# Icyongereza

A self-contained English course for a Kinyarwanda speaker. It is one web page: she opens it on her phone every day and follows the day's lesson. No accounts, no server, no other apps.

Month 1 is included: 4 weeks, 24 lessons (Monday to Saturday) and 4 weekly tests.

## What a day looks like

Each day has six blocks, about 90 minutes in total:

1. **Gusubiramo (Review)**: phrases from earlier days come back after 1, 3, 7 and 21 days.
2. **Amajwi (Sound lab)**: one hard English sound, listen-and-repeat words, then "which word did you hear?"
3. **Isomo rishya (New lesson)**: 10-12 phrases with Kinyarwanda meaning, a sound spelling and audio, then a dialogue.
4. **Kumva (Listening)**: hear a phrase and choose its meaning; put the words of a sentence in order.
5. **Kuvuga (Speaking)**: repeat sentences out loud, then a role-play where the phone speaks the other person.
6. **Kwandika (Writing)**: type the English for five phrases.

Day 7 of each week is a test. She needs 80% to open the next week. Week 4 ends with the gate: a one-minute self-introduction.

## Files

| File | What it does |
|---|---|
| `index.html`, `style.css`, `app.js` | The app |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline use and "Add to Home screen" |
| `lessons/index.json` | The list of weeks the app loads |
| `lessons/week-01.json` ... `week-04.json` | The lessons |
| `lessons/sounds.json` | The sound-lab explanations |

## Run it on your computer

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in Chrome.

## Publish on GitHub Pages

1. On GitHub, open the repository, then **Settings → Pages**.
2. Under **Source** choose **Deploy from a branch**, pick the branch that holds these files and the folder `/ (root)`, and save.
3. After a minute the page is live at `https://<your-username>.github.io/ICYONGEREZA/`.
4. On her phone, open that address in Chrome and choose **Add to Home screen**.

## Check the Kinyarwanda first

The Kinyarwanda was written by an AI and will contain mistakes. In the app, open **Aho ugeze → Kugenzura Ikinyarwanda (Chris)** to see every line flagged as uncertain. Fix lines in `lessons/week-NN.json` and delete `"check": true` from each one you have verified. Please also read the unflagged lines, the `grammar_rw` notes and `lessons/sounds.json`.

## Add a new week

1. Copy `lessons/week-04.json` to `lessons/week-05.json` and replace the content. Keep the same shape:
   - each day has `id` (`w05d1`), `week`, `day`, `title`, `sound` (a key from `sounds.json`), `pairs`, `items`, `dialogue`, and optionally `grammar_rw`;
   - each item has a unique `id` (`w05d1-p01`), `en`, `rw`, `say`, and optionally `ex` with `en` and `rw`;
   - she plays the speaker called `Benia` in the role-play.
2. Add the week number to `lessons/index.json`.
3. Add the new file name to the list in `sw.js` and change `icyongereza-v1` there to `icyongereza-v2`, so phones pick up the update.

## Good to know

- Audio is the phone's built-in English voice. She can pick the voice and speed under **Aho ugeze → Ijwi**.
- The blue **Vuga** button checks her speech. It appears only in browsers that support speech recognition (Chrome on Android does) and needs an internet connection.
- Her recordings and progress stay on her phone. Use **Bika kopi (Export)** before she changes phones.

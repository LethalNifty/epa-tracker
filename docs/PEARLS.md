# Pearls

Teaching points staff say on the wards, caught on the phone and turned into
GI Boards Anki cards on the computer.

## On the phone (GI Hub)

- **Catch:** + then **Catch a pearl**. One box (type or use the keyboard mic),
  the date filled in, an optional "who said it" and an optional Guides topic
  guessed from the words. Teaching point only, no patient details: the app
  flags anything the Endo number guard would remove (long numbers, MRN, PHIN,
  date of birth) and names after Mr, Mrs, Ms or Miss.
- **Keep:** Study shows a Pearls card that opens the Pearls page (search, edit,
  delete with Undo). A pearl tagged with a topic also shows on that topic's
  card in Guides. Pearls are in the backup.
- **Send:** **Send N pearls** hands a text file to the share sheet. Save it to
  Files, in Google Drive at `My Drive › Fellowship › GI Anki › pearls`. Only a
  finished share marks the pearls sent; Undo puts them back, and an edited
  pearl can be sent again.

Who said it never leaves the phone: it is not in the file.

## The file

Named `gi-pearls-YYYY-MM-DD-HHMM.txt`, UTF-8, oldest pearl first:

```
GI Hub pearls
Sent 2026-10-12 · 2 pearls
Format: [id] date · topic, then the pearl. Who said it stays on the phone.

[pmv4tq1ab] 2026-10-11 · Ascites, SBP, hyponatremia and HRS-AKI
Albumin 1.5 g/kg on day 1 and 1 g/kg on day 3 for SBP

[pmv4tq2cd] 2026-10-12 · No topic
A pearl can run
over several lines.
```

- Each pearl starts with a header line `[id] YYYY-MM-DD · topic`, matching
  `^\[(p[a-z0-9]+)\] (\d{4}-\d{2}-\d{2}) · (.+)$`. The topic is the Guides
  topic's name, or `No topic`.
- The pearl's text follows on one or more lines. Blank lines inside a pearl
  are folded away, so a blank line always ends a pearl.
- The id is stable for the life of the pearl. A pearl sent again (after Undo,
  or Send again on an edited pearl) keeps its id, so the computer side can skip
  pearls already made into cards.

## On the computer

Say "pearl cards". The cards runbook (`tools/anki/CARDS.md` in the Claude Code
repository) takes it from there: new pearl files in the Drive folder become a
pearls batch, checked against current Canadian then American guidelines,
through the two reviewers and the GI Studio, and banked into GI Boards with the
tag `pearl`.

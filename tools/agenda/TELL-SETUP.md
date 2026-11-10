# Tell GI Hub: setting it up

Once, in this order. Everything here is free: the sender is the reminder
sender's free Cloudflare Worker, and Claude runs on your own plan.

Two keys come out of step 1: the Shortcut key and the Claude key. Each goes
in exactly one place below. Never paste them anywhere else: not in a chat,
not in this repository. If one gets out, New keys in Settings makes both
again (then redo the network secret in step 2 and the shortcut's header in
step 4).

## 1. Turn it on in GI Hub

Settings (the gear on Week), Tell GI Hub, Turn on Tell GI Hub. Reminders
must be on first. GI Hub makes both keys and gives the sender only their
fingerprints. Copy each one when a step asks for it.

## 2. Claude's task

First its environment, at claude.ai/code on the phone (so the Claude key
never leaves it): the environment button under the message box, New
environment, name Tell GI Hub, network access None, Add environment. Then
open that environment's settings, Network secrets, Add secret:

- Secret type: Bearer (the default)
- Allowed websites: `gi-hub-agenda.lethalnifty.workers.dev`
- Custom headers: the row already reads `Authorization` with the prefix
  `Bearer`, so paste only the Claude key from step 1 as the Value, then Add

None is enough: a network secret's host is reachable at any level, and the
repository comes in through GitHub's own proxy.

Then the task, at claude.ai/code/routines, New task:

- Name: Tell GI Hub
- Prompt, pasted as is:

  ```
  Read tools/agenda/TELL.md in this repository and do exactly what it says, once. Then stop.
  ```

- Trigger: API. Create shows the token once, so copy it then. The Fire URL,
  ending in `/fire`, is in the task's API trigger panel. Both are for step 3.
- Repository (under Advanced settings, General): this one
  (LethalNifty/epa-tracker), then Cloud environment: Tell GI Hub. If the
  list says No repositories found, first install the Claude GitHub App at
  `github.com/apps/claude/installations/new`: LethalNifty, Only select
  repositories, epa-tracker.
- Model: Sonnet 5.5
- Connectors: remove every one. The task needs none, and an included
  connector could act during a run.

## 3. Tell the sender how to start it

From `tools/agenda` on the desktop, run each and paste what it asks for:

```bash
npx wrangler secret put TASK_URL
```

The routine's API address, ending in `/fire`.

```bash
npx wrangler secret put TASK_TOKEN
```

The routine's token.

Until both are in, Week says "Waiting for Claude: the task isn't set up
yet" once something has waited a quarter hour.

## 4. The shortcut

In Reminders, make a list called To GI Hub. Then in Shortcuts, a new
shortcut called Tell GI Hub:

1. Dictate Text.
2. Add New Reminder: tap the grey Reminder, which is its name, and pick
   Dictated Text, in the list To GI Hub. Dictated Text in the box after
   "with" only adds a note, and with no name the shortcut stops with No
   title was provided.
3. Find Reminders. It starts as Filter New Reminder: tap New Reminder and
   Clear, so it reads Find All Reminders. Then two filters, with All true:
   List is To GI Hub, and Is Not Completed (tap the second filter's List,
   pick Is Completed, then set it to is not).
4. Repeat with Each, in the same shortcut:
   1. Format Date: the Repeat Item's Date Created (Creation Date on some
      phones), ISO 8601, with the time.
   2. Get Contents of URL: `https://gi-hub-agenda.lethalnifty.workers.dev/inbox`
      - Method: POST
      - Header: `Authorization`, value `Bearer `, a space, then the
        Shortcut key from step 1
      - Request Body: JSON, with `text` set to the Repeat Item's Title
        (once picked, it shows as just Repeat Item) and `at` set to the
        Formatted Date
   3. Get Dictionary Value: `ok` in the Contents of URL.
   4. If the Dictionary Value has any value: Remove Reminders (the Repeat
      Item), then Show Notification "Sent to GI Hub".

The first run asks for the microphone, Reminders, the sender and deleting
reminders: allow each, Always Allow where it's offered. If it still asks
before every delete: iPhone Settings, Apps, Shortcuts, Advanced, Allow
Deleting Without Confirmation. When the delete question offers Add To
Calendar, skip it: GI Hub is the calendar.

With no signal, what you said waits in To GI Hub and goes the next time the
shortcut runs. The same words sent twice count once.

## 5. Back Tap

iPhone Settings, Accessibility, Touch, Back Tap, Double Tap: Tell GI Hub.

## 6. Try it

Double tap the back of the phone and say "Dentist Friday at 9". In a
few minutes GI Hub says what it added, and it's on the Claude added card at
the top of Week. Tap Undo there.

Then Settings, Tell GI Hub, Run the test set: 20 sentences go through Claude
like anything said, but never into GI Hub. A few minutes later, Check the
test shows how many came out right, with the misses. Run it again after any
change to `TELL.md`.

## Ideas, on the desktop

Ideas for GI Hub or Heidi wait in the sender. From `tools/agenda`:

```bash
npx wrangler kv key list --binding AGENDA --remote --prefix idea:
```

Then, for each name it lists:

```bash
npx wrangler kv key get "idea:<id>" --binding AGENDA --remote
```

```bash
npx wrangler kv key delete "idea:<id>" --binding AGENDA --remote
```

## When something's off

- Week says "Waiting for Claude: it couldn't start (error 401)" or 404:
  `TASK_URL` or `TASK_TOKEN` is wrong. Redo step 3.
- Week says just Waiting for Claude, with no reason: open the task's latest
  run at claude.ai/code/routines. A 401 from gi-hub-agenda there means the
  network secret isn't the current Claude key: delete the secret and add
  it again (step 2), with only the key as its Value.
- The shortcut never says Sent: check its header has the Shortcut key, and
  that Tell GI Hub is still on in Settings.
- Turning Tell GI Hub off in Settings shuts the inbox: both keys stop
  working at once.

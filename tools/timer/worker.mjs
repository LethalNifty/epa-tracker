// GI Hub's reminder timer: a Cloudflare Worker that asks GitHub to run the
// reminder workflow (.github/workflows/reminders.yml) every 15 minutes.
// GitHub's own schedule runs it hours apart, so reminders came late or not at
// all; the sender still decides what is due, and its windows stop double sends.
// Its own Worker (wrangler.toml beside this file), never in functions/, which
// deploys to the fellows' site. The GitHub token is the Cloudflare secret
// GH_TOKEN: a fine-grained token for this repository with Actions read and write.
const DISPATCH = "https://api.github.com/repos/LethalNifty/epa-tracker/actions/workflows/reminders.yml/dispatches";

export async function dispatch(env, fetchImpl = fetch) {
  if (!env.GH_TOKEN) throw new Error("No GH_TOKEN secret: run npx wrangler secret put GH_TOKEN");
  const res = await fetchImpl(DISPATCH, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.GH_TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      // GitHub turns away requests without one, and a Worker sends none by itself.
      "User-Agent": "gi-hub-timer",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ref: "main"}),
  });
  // A thrown error is what shows in Cloudflare's logs; it never carries the token.
  if (res.status !== 204) throw new Error("GitHub refused the reminder run (" + res.status + ")");
}

export default {
  async scheduled(event, env) { await dispatch(env); },
};

/**
 * Starter concepts shown in the empty gallery. Short, illustratable editorial
 * ideas (one judgment / metaphor each) in the AI/dev/systems register Nib is
 * built for — the kind of concept a recurring character can physically perform.
 * Original wording.
 */
export const EXAMPLE_PROMPTS: string[] = [
  "one fish, many dishes",
  "the information well",
  "the idea press",
  "content left to ferment",
  "building the trust bridge, plank by plank",
  "RAG: fetch the right page first, then write the answer",
  "ship it before you're ready, fix it in the open",
]

/** Example article URLs to demo the fetch flow — all extract cleanly. */
export const EXAMPLE_ARTICLE_URLS: { label: string; url: string }[] = [
  { label: "Feedback loops · James Clear", url: "https://jamesclear.com/feedback-loops" },
  { label: "Do things that don't scale · PG", url: "https://paulgraham.com/ds.html" },
  { label: "The Feynman technique · fs.blog", url: "https://fs.blog/feynman-learning-technique/" },
]

/** Short sample posts for Article mode — each has several illustratable ideas. */
export const EXAMPLE_ARTICLES: { title: string; body: string }[] = [
  {
    title: "What a RAG pipeline really does",
    body:
      "A retrieval-augmented model doesn't actually \"know\" your docs — it looks them up first. The pipeline chops your sources into chunks, finds the few most relevant to the question, and hands only those to the model as context. The model then writes its answer from what it was handed, not from memory. That's the whole trick, and also the whole risk: when retrieval grabs the wrong chunk, the model confidently writes from the wrong page. Get the fetch right and the rest follows; get it wrong and no amount of clever prompting saves you.",
  },
  {
    title: "Why your agent gets stuck",
    body:
      "Agents rarely fail because the model is dumb; they fail because the loop is. Give one too many tools and it dithers over which to reach for. Let the context window fill and the earliest instructions quietly fall off the edge, so it forgets the goal it started with. Without a clear stop condition it loops, re-checking work it already finished. The fix is rarely a bigger model — it's a smaller surface: fewer tools, a goal it can't lose, and a hard limit on how many turns it gets before it has to show its work.",
  },
  {
    title: "How small teams ship fast",
    body:
      "Small teams move fast not by working harder but by shortening the loop between idea and feedback. Ship something tiny, watch what happens, adjust, and repeat — each turn of the wheel teaches more than a month of planning. Momentum is a flywheel: the first push is heavy, but every shipped change makes the next one easier. Guard against scope creep, which quietly turns a one-day fix into a one-month project. And keep the whole picture in one head or on one page, so nobody is building half a bridge.",
  },
]

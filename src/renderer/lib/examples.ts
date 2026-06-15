/**
 * Starter concepts shown in the empty preview area. Short, illustratable
 * editorial ideas (one judgment / metaphor each) — original wording.
 */
export const EXAMPLE_PROMPTS: string[] = [
  "trust is built one piece of evidence at a time",
  "small habits compound into a big result",
  "sort incoming work by purpose, not by arrival",
  "saying no protects the few things that matter",
  "ship, learn, adjust — the feedback loop",
  "the last 20% takes 80% of the effort",
]

/** Short sample posts for Article mode — each has several illustratable ideas. */
export const EXAMPLE_ARTICLES: { title: string; body: string }[] = [
  {
    title: "Why to-do lists fail",
    body:
      "Most to-do lists fail because they treat every task as equal. In reality, a handful of items carry almost all the value and the rest is noise that just makes you feel busy. The first move is to sort by purpose, not by the order things arrived. Then protect your focus: saying no to good-enough work is what makes room for the few things that matter. Watch the long tail, too — the last twenty percent of a task often eats eighty percent of the effort, so decide in advance how \"done\" is good enough. Finally, treat the list as a loop, not a monument: review it, cut what's stale, and start again tomorrow.",
  },
  {
    title: "Earning user trust",
    body:
      "Trust isn't announced; it's accumulated. Users believe what they can verify, so every clear receipt, honest error message, and kept promise lays down another plank. Move in small, reversible steps — a big confident claim with nothing behind it reads as a red flag, while a quiet feature that just works builds quiet confidence. Be visible when things break: owning a failure openly often earns more trust than a flawless month. And keep your story consistent across every surface, because one contradiction can undo a dozen good interactions.",
  },
  {
    title: "How small teams ship fast",
    body:
      "Small teams move fast not by working harder but by shortening the loop between idea and feedback. Ship something tiny, watch what happens, adjust, and repeat — each turn of the wheel teaches more than a month of planning. Momentum is a flywheel: the first push is heavy, but every shipped change makes the next one easier. Guard against scope creep, which quietly turns a one-day fix into a one-month project. And keep the whole picture in one head or on one page, so nobody is building half a bridge.",
  },
]

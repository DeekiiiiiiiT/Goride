# The Vibe Coder's Playbook

How to build real, working software with AI, even if you don't write code yourself.

## The team
- **You (the owner):** decide what gets built and why, design the screens, run the steps the AI can't, check the results, and say yes or no.
- **The planner AI** (e.g. Claude): reads your code and data, writes the plan, checks every result, writes prompts for the builder.
- **The builder AI** (e.g. Cursor): writes most of the code from the planner's prompts.
- **A design tool** (e.g. Google Stitch): turns a written description into screen designs.

The planner and the builder are kept separate on purpose. One builds; the other checks. Never let the same AI build something and also grade it.

---

## Step 1 — Say what it's for, in one sentence
Describe the job a real person gets done, not the technology.
- Good: "A shop owner adds a new product in under 2 minutes."
- Bad: "Build a product import system."

If you can't say it in one sentence, it isn't ready to build.

## Step 2 — Look before you plan
Have the planner read the existing code **and the real data** before suggesting anything. Most surprises hide in the data: missing links, empty tables, messy spreadsheets.

> *"Before planning, read the code and the live data for [feature]. Tell me what exists, what's missing and what's broken. Don't change anything."*

## Step 3 — Write the blueprint (one plan file)
One file per feature. It always has four sections, built in this order:
1. **Data:** the tables, the rules the data must follow, and automatic checks that fail if a rule is broken.
2. **Server:** the actions the app can perform, and a test for each.
3. **Screens:** every screen and **every button**, and what each one must do.
4. **Tests:** how you'll prove the whole thing works.

The plan file also holds two lists:
- **Problems found:** numbered, each with **one chosen fix**. No "options" and no "decide later".
- **Done-tests, written before building:** real-world checks in plain words, like "Add a product → it appears in the shop within a minute."

Then go back and forth with the planner until it can't find a single gap. That back-and-forth is what makes a good blueprint, so don't rush it.

## Step 4 — Design the screens
1. The planner writes a design prompt from the blueprint: colours, principles, each screen, every button, and how things behave.
2. You create the screens in the design tool.
3. From then on, **the design is the spec for the look**: layout, section order, card and chip styles, spacing, colours, fonts, dark mode. Build that exactly; don't redesign during the build.
4. **The plan is the spec for the content.** Every number, badge, car, button and sentence on a screen must come from real data or a feature the plan lists. Design tools invent facts (scores, certifications, specs, IDs, prices, extra buttons) — those are dropped, never built as fake data.
5. For each screen the planner writes a short **Keep / Drop / Add** list in the plan: *Keep* what matches the plan, *Drop* what the design invented, *Add* what the plan needs but the design left out (built in the same style).
6. Only ask for a new design when the **layout** itself is wrong (a whole section missing, the screen can't be used). Wrong content is fixed by the Keep / Drop / Add list, not by redesigning.

## Step 5 — Build in layers, one at a time
Build **Data → Server → Screens → Tests**, in that order. Finish and check each layer before starting the next.
- The planner writes the builder's prompt for **one layer only**.
- When the builder says "done", the planner checks the actual code, runs the tests, and reports what's really true.
- You run anything that touches the real database, then paste the result back.
- **Change the screen, change its test, in the same round.** If a button is renamed, moved, added or removed, or a feature is cut, the click-through tests for that screen are updated in the same piece of work. "Done" means the screen works **and** its tests pass. (On 10 Nov, half a day went to tests left over from the 5 Nov Inventory cut-down, and real bugs hid among the "it's just old tests" failures.)

**Before every push, in this order:**
1. **Build.** Claude or Cursor makes the change, including its tests.
2. **Code review.** Type `/code-review` in Claude Code and let it fix what it finds. Skip this for small text or colour changes.
3. **Playwright on your computer.** Run `pnpm test:inventory`, or one test like `pnpm test:inventory 05`, with Docker Desktop open. If a test fails, fix it and re-run just that test.
4. **Push.** The fast checks run automatically (about 45 seconds, `pnpm check`). GitHub is the final confirmation, not the place to find problems.

Review comes before the tests because the review often changes code. That way, the tests check the final version.

## Step 6 — Prove it on a private copy first
Before anything risky touches real data, the planner tests it on a **private copy of your database** running on your own computer (for example in Docker).

**When to use it:** anything that changes data, money or who can log in. Skip it for small text or colour changes; it costs extra AI credits.

**Rules for proving:**
- **A test only counts if nothing is faked:** no pretend server answers, no hidden test-only switches in the app, and no loosening who can log in just to make a test pass.
- **Test the way the app really works**, through the same path real users take, not a shortcut. Some bugs only appear on the real path.
- **Use made-up test data** that can never match real records.
- **Every bug you fix gets a new test**, so it can never quietly come back.

## Step 7 — Go live behind a switch
The app you open in your browser shows the **real** database, so a feature proven on the private copy won't appear there until it goes live.

1. Release the feature **switched off**.
2. Load a small amount of real data, from trusted sources only.
3. Check that the data landed correctly.
4. **Switch it on.**
5. Do one real run yourself, with screenshots, and compare it against your done-tests.

## Step 8 — Close out
- Update the plan file: what's live and what's left.
- Have the planner save what it learned, so the next session starts smarter.
- Save your work to version control (commit) only when **you** decide. Don't let any AI create or switch branches on its own.

---

## Golden rules
1. **Fix the root cause, not the symptom.** If a fix doesn't hold, the real cause hasn't been found yet.
2. **Verify, don't trust.** "Done", "passed" and "fixed" mean nothing until someone checks the code, the data or a screenshot.
3. **Never bulk-approve.** Find out exactly what a button does before pressing it a hundred times.
4. **Check every spreadsheet before uploading.** Spreadsheet programs shift columns and turn values like "2/4" into dates.
5. **Trusted sources only.** A random website or an AI summary is not proof that data is correct.
6. **One question per screen, plain words first.** If you don't understand a screen, your users won't either.
7. **Short chat, detailed plan file.** The file is the project's memory; the chat disappears.
8. **Use the switch.** New features stay off until they're proven on real data.
9. **A red test is never "just an old test".** Read why it fails before changing it. Either the app is broken (fix the app) or the screen changed on purpose (update the test in the same round).

## Copy-paste prompts
- **Start a feature:** *"New feature: [one sentence]. Read the code and live data first, then write a plan file with Data / Server / Screens / Tests, every screen and button, numbered problems with one fix each, and done-tests. Don't build yet."*
- **Tighten the plan:** *"Re-check the whole plan against the code, data, screens and tests. List anything missing and update the file."*
- **Design:** *"Write the design prompt for this plan: colours, principles, every screen and button, and how things behave."*
- **Build one layer:** *"Write the builder prompt for the [Data / Server / Screens] layer only. Include updating the tests for every screen you change, and run them locally before saying done."*
- **Check the builder:** *"The builder says it's done. Check the code, run the tests, and tell me what's really true."*
- **Prove it:** *"Test this on a private copy of the database before I run anything live."*
- **Status:** *"Where are we on this plan? Update the status at the top."*

---
name: audit-review
description: Plan and carry out a general audit review of documents, spreadsheets, data, systems, or code, and report evidence-backed findings.
---

# Audit review

Use this procedure for any audit request that does not have a more specific audit skill. Write the report in the language of the user's request.

## Scope

1. Restate the audit objective, the subject, the period or version under review, and the criteria the subject is measured against: a law, regulation, contract, internal policy, standard, or the user's stated expectation. Ask the user with `ask_user_question` only when the objective or the criteria cannot be found in the material.
2. List the material available in the workspace before reading it in depth. Record each source by its path and, for spreadsheets and databases, by sheet, table, or query.
3. Use `todo_write` to track the review steps when the review covers more than one source or criterion.

## Evidence

- Read the material yourself with the read and search tools, or with commands that only read. Do not rely on file names, summaries, or the user's description as evidence.
- Recompute totals, balances, counts, and dates that a conclusion depends on, and keep the command or calculation that produced each figure.
- Record each item of evidence with its exact location: file path, page, sheet and cell range, row identifier, line number, or command and output.
- Never correct, move, rename, or overwrite the material under review; state the correction in the report instead. When the user asks for a working paper or report file, save it as a new file in the workspace and name its path in the reply.
- Use `web_search` and `web_fetch` only for public criteria such as published regulations or standards, and cite the source address and its date.

## Findings

Report each finding with these five parts:

| Part | Content |
|---|---|
| Criteria | The requirement that applies, with its source |
| Condition | What the evidence shows, with its location |
| Cause | Why the condition occurred, or "not determined" when the evidence does not show it |
| Effect | The consequence or risk, quantified when the evidence allows |
| Recommendation | The action that would correct the condition or prevent it from recurring |

Rate each finding as high, medium, or low based on its effect, and say what the rating rests on.

## Report

1. Start with a summary: the objective, the scope covered, the number of findings by rating, and the overall conclusion.
2. List the findings, highest rating first.
3. List the limitations: material that was missing, unreadable, or out of scope, and any conclusion that depends on an assumption.
4. Keep observations that are not findings separate from the findings.

# TASK

Write the specification of issue #{{item.number}}: {{item.title}}

You are the tech lead. The developer who implements this issue will read only your specification and the
issue, so the specification must be complete enough to work without asking questions. Don't write code and
don't change files: the repository is mounted read-only.

# THE ISSUE

<issue>

{{item.body}}

</issue>

# EXPLORE BEFORE WRITING

Read the code that this issue touches or builds on, and the tests next to it. Look for what already exists
that the developer should reuse and for the patterns already in use, so the new code looks like it belongs.
Follow @CODING_STANDARDS.md when you name things.

# THE SPECIFICATION

Write it in Markdown with these sections:

- **Goal** — one paragraph: what changes for the user when this issue is done.
- **Scope** — what is included and, explicitly, what is not.
- **Files** — the files to create and to change, with one line each about why.
- **Contracts** — the exact names, types and signatures the developer must use.
- **Acceptance criteria** — a checklist of observable behaviors; each one becomes at least one test.
- **Tests** — the tests to write, named as sentences about behavior.
- **Open questions** — anything the issue leaves ambiguous, with the decision you recommend.

Your answer, before the `<output>` block, is the specification.

# OUTPUT

End your answer with the `<output>` block: `ready` is `true` when the issue has enough information to be
implemented, and `false` when it is missing something only a person can decide (say what in the open
questions).

You are working inside my ScreenOps hackathon repository.

Task: Create clear submission documentation that explains how Codex/OpenAI tools were used during the build.

Context:
ScreenOps is a privacy-first ambient agentic workspace intelligence system. It analyzes screen/audio context locally in the browser, extracts only structured intent signals, sends those signals to a FastAPI + LangGraph backend, and executes approved actions through MCP tools like Gmail, Calendar, and Sheets.

Create or update the following documentation files:

1. README.md
2. SUBMISSION.md
3. AI_USAGE.md
4. ARCHITECTURE.md
5. DEMO_SCRIPT.md

Do not exaggerate or claim features that are not implemented. Clearly separate:

* Implemented features
* Mocked/demo features
* Planned future features

In AI_USAGE.md, document how Codex/OpenAI was used in these areas:

* Ideation and scope refinement
* PRD breakdown into build tasks
* Frontend UI generation
* FastAPI backend scaffolding
* LangGraph workflow design
* MCP tool integration planning
* Human-in-the-loop approval flow
* Debugging and refactoring
* Demo script and submission preparation

For each usage area, include:

* What I asked Codex/OpenAI to help with
* What code or documentation it helped generate
* What I manually reviewed, modified, or verified
* Any limitations or mistakes I corrected

Use this structure:

# AI Usage Documentation

## Summary

Briefly explain that Codex/OpenAI was used as an AI-assisted development partner, not as a replacement for human decision-making.

## Tools Used

* ChatGPT
* Codex / coding agent
* OpenAI models/APIs if used in the project

## How AI Assisted the Build

Create sections for:

1. Product Ideation
2. Architecture Planning
3. Frontend Development
4. Backend Development
5. Agent Workflow / LangGraph
6. MCP Integration
7. Debugging
8. Documentation and Demo Preparation

## Human Oversight

Explain that all architecture decisions, privacy constraints, feature scope, final implementation choices, and submission decisions were reviewed by me.

## Example Prompts

Add 5–8 realistic example prompts I could have used, such as:

* "Break this PRD into an 11-hour hackathon build plan."
* "Generate a FastAPI /signals endpoint for structured intent JSON."
* "Create a React approval card UI for low, medium, and high risk agent actions."
* "Design a LangGraph workflow for intent routing, risk classification, approval, execution, and verification."
* "Write a demo script for a 90-second hackathon video."

## Build Timeline

Create a concise timeline of how the project was built during the hackathon:

* Setup
* Browser/local inference or mock replay
* Backend signal routing
* Approval UI
* MCP action execution/mocking
* Demo recording
* Final documentation

## Submission Notes

Add a final section explaining:

* The project was built during the hackathon.
* Starter templates/libraries may have been used where applicable.
* The core idea, implementation, and demo were created for this hackathon.
* AI assistance was used transparently and documented.

Also update README.md with:

* Project name and tagline
* Problem statement
* Solution overview
* Architecture diagram in text form
* Tech stack
* How to run locally
* Demo flow
* AI usage link pointing to AI_USAGE.md

Also update DEMO_SCRIPT.md with a 2-minute video flow:

1. Hook
2. Problem
3. Privacy-first solution
4. Working demo
5. Codex/OpenAI usage
6. Closing impact

Keep the writing professional, simple, and judge-friendly.
Use markdown formatting.
Do not include fake metrics, fake user numbers, or fake production claims.

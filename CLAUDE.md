RULES

## testing
- see docs/TEST_GUIDE.md for how to write tests

## Environment Variables
- NEVER USE `dotenv` to load environment variables. Use NodeJS 20+ native support for `.env` files.

## Scripts
- Always implement as `npm run <script-name>`, as seen in `package.json`.

## Commiting 
- NEVER commit to main -- always ask me whether I want a new branch instead
- NEVER commit unless explicitly told to

## merging PRs
- NEVER merge a PR unless explicitly told to
- when I say to "merge" a PR, I mean to take the current branch, and make a PR on github.com using `gh`
- Then, once that PR is merged on GH, you can pull the PR to here and clean up local dir, removing the branch locally

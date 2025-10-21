## Coding Guidelines

### Javascript:

- For JavaScript formatting, we will use npm package Prettier, which has a linter that shows warnings for every style inconsistency with their defined structure. This will make it very easy to enforce as it has a command “npx prettier --write .” which automatically formats the file. So we will include it in the build process.

- For style, we will use the Google's style guide. It keeps code consistent, clean, and easy to read by following a well-known standard. It would be a little bit harder to enforce, but will check style upon doing pull requests.

### Python:

- Similar to JS, we will use Google’s style guide, which has its own linter “pylint using pylintrc”. This script will be required to run before pushing code or creating a pull request. Also only two people will work on Python code, so enforcement will be much easier.

![CD Workflow](https://github.com/blackboard-innersource/gh-action-cdk-diff/workflows/CD%20Workflow/badge.svg)

# GitHub Action: CDK Diff

Diff two `cdk.out` directories.

## Usage

For all possible inputs and outputs see the [Action YAML](action.yml) file.

### Usage: Comment on Pull Request

This action is most useful for generating a diff of the generated CDK cloud assembly whenever you submit a pull request.
Here is an example workflow:

```yaml
name: pr

on:
  pull_request:
    branches:
      - master

# Needed because a merge commit could be generated and needs an author
env:
  GIT_AUTHOR_NAME: github-actions[bot]
  GIT_AUTHOR_EMAIL: 41898282+github-actions[bot]@users.noreply.github.com
  GIT_COMMITTER_NAME: GitHub
  GIT_COMMITTER_EMAIL: noreply@github.com

jobs:
  cdk-diff:
    runs-on: ubuntu-latest
    steps:
      - name: Setup NodeJS
        uses: actions/setup-node@v4
        with:
          node-version: "18"

      # Modify or remove based on your CDK language
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install CDK
        run: npm install -g aws-cdk@2

      - name: Checkout main
        uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 0

      # Modify based on how your project installs dependencies
      - name: Install main dependencies
        run: pip install pip-tools && pip-sync

      - name: CDK synth main
        run: cdk synth -o base.cdk.out

      - name: Checkout PR branch
        uses: actions/checkout@v4
        with:
          ref: ${{ github.head_ref }}
          fetch-depth: 0
          clean: false

      - name: Merge main to PR branch
        run: git merge origin/main

      # Modify based on how your project installs dependencies
      - name: Install PR branch dependencies
        run: pip-sync

      - name: CDK synth PR branch
        run: cdk synth -o head.cdk.out

      - name: Diff CDK synth outputs
        id: diff
        uses: blackboard-innersource/gh-action-cdk-diff@v1
        with:
          # Ignore the S3Key key in the diff. This helps reduce noise in the diff.
          ignore-keys: S3Key

      - name: Find Comment
        uses: peter-evans/find-comment@v3
        id: fc
        with:
          issue-number: ${{ github.event.pull_request.number }}
          comment-author: "github-actions[bot]"
          body-includes: CloudFormation

      - name: Create or update comment
        uses: peter-evans/create-or-update-comment@v4
        with:
          comment-id: ${{ steps.fc.outputs.comment-id }}
          issue-number: ${{ github.event.pull_request.number }}
          body-path: ${{ steps.diff.outputs.comment_file }}
          edit-mode: replace
```

Overall, what this workflow is doing:

- Running `cdk synth` on the `main` branch.
- Running `cdk synth` on the pull request branch.
- Diffing the outputs of those two synths.
- Posting new or updating existing comment in the pull request with the diff.

You can also only comment on the pull request when there is a diff by using `if`:

```yaml
- name: Comment on Pull Request
  if: steps.diff.outputs.has_diff == 1
  # etc...
```

## Developing

To run tests locally:

```shell script
make
```

## License

Please see the [LICENSE](LICENSE) file.

# C2PA Validator Test

Shared C2PA test files, and what each company's validator says about them.

- **`testfiles/conformant/<version>/`**: conformant C2PA files, by spec version (`2.2`, `2.3`, `2.4`, `2.5`, …).
  Subfolders are allowed.
- **`testfiles/experimental/<version>/`**: non-conformant C2PA files, by spec version. Subfolders are allowed.
- **`results/<company-id>.json`**: one file per company with its validator's results for the test files.
  Only that company's listed GitHub accounts can change it.
- **Viewer**: a React page (`web/`) that compares how every system handles every test file. It's published
  to GitHub Pages on every merge to `main`, along with `combined.json`.

## Contributing

Everything arrives as a pull request.

### Add test files

Put them in `testfiles/conformant/<version>/` or `testfiles/experimental/<version>/` and open a pull request.
Anyone can add test files. Only maintainers can change or remove files that are already there.

### Add or update your results

1. Ask a maintainer to add your company to [`owners.json`](owners.json) with the GitHub logins that may
   edit its results:

   ```json
   "acme": { "name": "Acme", "github": ["alice", "bob"] }
   ```

2. Run your validator over `testfiles/` and write `results/acme.json`:

   ```json
   {
     "$schema": "../schema/result.schema.json",
     "company": "Acme",
     "date": "2026-11-19",
     "results": [
       {
         "file": "conformant/2.5/photo.jpg",
         "c2paValid": true,
         "aiStatus": "Edited with AI",
         "userMessage": "This image was edited using generative AI.",
         "error": null,
         "signals": ["c2pa.edited", "digitalSourceType: compositeWithTrainedAlgorithmicMedia"]
       }
     ]
   }
   ```

   | Field         | Meaning                                                              |
   | ------------- | -------------------------------------------------------------------- |
   | `company`     | Your company name, exactly as in `owners.json`.                      |
   | `date`        | When the results were produced, `YYYY-MM-DD`.                        |
   | `file`        | The test file's path relative to `testfiles/`.                       |
   | `c2paValid`   | Is it a valid C2PA file?                                             |
   | `aiStatus`    | `"AI"`, `"Edited with AI"`, `"Unknown"` or `"No AI"`.                |
   | `userMessage` | The text your product would show a user to describe the file.        |
   | `error`       | The error text, or `null` if there is none.                          |
   | `signals`     | The signals your validator used, as strings. Can be empty.           |

   The full JSON Schema is [`schema/result.schema.json`](schema/result.schema.json).

3. Open a pull request. The **Check pull request** workflow confirms you're listed for that results file
   and that the file matches the schema.

## How permissions are enforced

A public repository can be read and forked by anyone, but only people with write access can merge. On top
of that:

- **`scripts/check-pr.mjs`** (run by `.github/workflows/check-pr.yml`) fails a pull request if its author
  edits a results file they don't own, puts a test file in the wrong place, changes an existing test file,
  or touches anything else, unless they're a maintainer. It reads `owners.json` and runs its own code from
  the target branch, never from the pull request, so a pull request can't grant itself access.
- **`.github/CODEOWNERS`**, generated from `owners.json` by `node scripts/codeowners.mjs`, asks each
  company to review changes to its results file and makes maintainers the owners of everything else.

Set up the repository once:

1. **Settings → Rules → Rulesets → New branch ruleset** for `main`:
   - Require a pull request before merging (1 approval).
   - Require status checks to pass: **check**.
   - Block force pushes.
2. **Settings → Pages → Source: GitHub Actions**.
3. Put your maintainers' logins in `owners.json`, then run `node scripts/codeowners.mjs` and commit.

## Scripts

Plain Node.js 22+, no dependencies.

```sh
node scripts/combine.mjs                # writes combined.json from results/*.json
node scripts/codeowners.mjs             # regenerates .github/CODEOWNERS from owners.json
git diff --name-status --no-renames main...HEAD | node scripts/check-pr.mjs --author <login>
```

`combined.json` holds every test file (`testFiles`), every company (`companies`) and every result
(`results`, each tagged with its company id). Invalid results files are left out and reported.

## Viewer

The viewer is built for hundreds of test files across many systems:

- **Matrix**: one row per test file, one column per system. Each cell shows whether that system decoded
  the file as valid and which AI label it gave. Files are grouped by spec version, and each group can be
  collapsed.
- **Agreement**: each file is marked "Agree" or "Differ: validity / AI label", and cells that disagree
  with the majority are highlighted. The headline numbers and the **Show** filter jump straight to
  disagreements or to files that are missing a result.
- **Side-by-side comparison**: click a file to see what every system would show a user for it, with
  errors and signals next to each other and a preview of the file. Each file has a link
  (`#file/<path>`) you can share.
- **Coverage**: a bar per system showing how many test files it has reported on and how many it decoded
  as valid.

```sh
cd web
npm install
npm run dev     # combines the results, then serves the viewer
npm run build   # static site in web/dist
```

`testfiles/experimental/2.5/` holds the generative-AI examples from c2pa-ai-examples, sorted into `ai`, `includes-ai`, `no-ai`, `unknown` and `invalid`.

## Test file sources

- **`experimental/1.4`, `experimental/2.4`, and the format folders in `experimental/2.5`** (`archive`,
  `audio`, `data`, `image`, `model`, `pdf`, `text`, `video`): from
  [c2pa-org/public-testfiles](https://github.com/c2pa-org/public-testfiles), `main` plus pull requests
  #35–#38, under [CC BY-SA 4.0](LICENSE-public-testfiles). `legacy/1.4` there is `1.4` here.
- **`experimental/2.5/{ai,includes-ai,no-ai,unknown,invalid}`**: the generative-AI examples from
  c2pa-ai-examples.

A file goes in `conformant/` only when c2pa-rs, using just the official
[C2PA trust lists](https://github.com/c2pa-org/conformance-public/tree/main/trust-list), reports it as
`Trusted`: signed by a certificate on the list, with no validation failures. Anything else goes in
`experimental/`.

## Where the results come from

- **Plug-Fest Bot** (`results/plug-fest-bot.json`): the deployed bot's public API (c2pa-rs `4973da7`), run
  with plug-fest-bot's `scripts/validator-results.mjs`.
- **Sightengine** (`results/sightengine.json`): not submitted by Sightengine. We ran each test file through
  its public, in-browser checker at <https://sightengine.com/c2pa-check> (c2pa-web 0.11.0) on 2026-11-20
  with a headless browser and recorded what the page showed. Its headline maps to `aiStatus` (AI-generated
  → AI, camera capture → No AI, anything else → Unknown). `c2paValid` is false when the page reports a
  failed validation, no credential, an unsupported format or an engine error; an untrusted signer alone
  doesn't count.

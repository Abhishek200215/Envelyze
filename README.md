# Envelyze

**Email HTML, inspected before it ships.**

Envelyze is a browser-only QA tool for email templates. Paste a template (or drop an `.html` file), press **Format & check** (or Ctrl/⌘ + Enter), and it:

- re-indents the markup, keeping inline tags with their text, and preserving Outlook conditionals, VML and ghost tables
- checks every line against HTML, CSS and email-client rules
- applies safe fixes (when **Apply fixes** is on) and lists everything else under **Needs your attention**, with the output line number of each finding

There are no dependencies and no server. Open `index.html` (or the single-file `Envelyze.html`) in a browser.

## What it checks

| Group | Examples |
|---|---|
| **Tag structure** | unclosed or stray tags, `<div>` directly in `<tr>`, `<td>` outside `<tr>`, `<table>` inside `<p>`, link inside link, broken comments, unbalanced or mis-closed Outlook conditionals. Outlook's code and other clients' code are validated separately, so ghost tables are not flagged |
| **Document setup** | doctype, declared charset vs raw characters, `<html>/<head>/<body>`, charset, viewport, `<title>`, `x-apple-disable-message-reformatting`, dark-mode `color-scheme` meta, VML namespace, preheader, unsubscribe link, lines over 998 characters (SMTP limit) |
| **HTML validity** | unknown tags with typo suggestions (`<tabel>` → `<table>`), `<div />`, `</br>`, `</img>`, missing `>`, unclosed quotes, missing space between attributes, upper-case names, entity typos (`&nbps;`), missing `;` |
| **Attributes** | typos (`widht`, `cellpading`, `valing`, `scr`), attributes on the wrong element, invalid `align`/`valign`/`dir`/`lang`/`colspan`, colours missing `#`, `width="600px"`, duplicate ids, duplicate attributes, empty attributes |
| **Links / Images** | spaces in URLs, `http://`, malformed or doubled protocols, `www.` without `https://`, `javascript:`, URLs over 255 characters, bad `mailto:`/`tel:`, in-page anchors without a target, missing or placeholder alt text, missing width, `display:block`, SVG/WebP/base64 images, images wider than their cell |
| **Merge tags** | inventory of `{{ }}`, `%% %%`, `*| |*`, `${ }`, `[[ ]]` and DARTmail `#FIELD#` profile fields, unbalanced delimiters, mixed syntaxes |
| **CSS validity** | missing `:` or `;`, unknown properties with suggestions, quoted colours, invalid hex, missing units, `!importnat`, missing font fallbacks, stray or missing braces, broken `@media` queries, `[class="x"]` selectors that can never match |
| **Email client support** | `<script>`, forms, `<svg>`, external stylesheets, event handlers, `@import`, `position`, CSS variables, flex/grid, `calc()`, rem/vh units, background images without VML |
| **Media queries** | duplicate breakpoints, conflicting values, breakpoint order bugs (a later, wider block overriding a narrower one), rules after `@media` that override it, `@media` rules that can't beat an inline style without `!important` |
| **Unused & redundant code** | unused CSS rules and classes (attribute selectors and email-client classes are respected), id selectors matching nothing, duplicate selectors, empty rules, longhands overridden by a later shorthand, empty and attribute-less wrapper tags, stacked `<br>`/`&nbsp;`, comments, commented-out code, editor `<meta>` tags |
| **ASCII / special characters** | the DARTmail Helper character list, flagged with the entity to use. Invisible characters (non-breaking space, zero-width space, soft hyphen, BOM) and any other non-ASCII text, in content, attributes, CSS and URLs. Windows-1252 entities such as `&#150;` are replaced with the Unicode one |
| **Pre-send QA** | links or images on localhost, internal IPs, local file paths or staging/test servers; `example.com` placeholder links; leftover dummy copy (Lorem ipsum, TODO/TBD, `xx,xx €`, "[Insert …]", "text here"); out-of-date copyright year; links missing UTM parameters while others have them; different `utm_campaign` values; mailto subjects with raw spaces; image-heavy emails with almost no text |
| **Simpler CSS** | shorthands written longer than needed (`padding: 0px 0px 0px 0px` → `padding: 0`, `margin: 10px 20px 10px 20px` → `margin: 10px 20px`, `margin: 0 0 12px 0` → `margin: 0 0 12px`, also `border-width/-style/-color/-radius`), zero written with a unit (`0px` → `0`), four `padding-*`/`margin-*` sides that can be one shorthand. Inline styles and `<style>` rules |
| **CSS with no effect** | `margin` on `<td>`/`<th>`/`<tr>` (use padding), `padding` on `<tr>`, `margin: 0 auto` on a table without `align="center"` (Outlook ignores it) |
| **Table layout** | rows with different cell counts (missing `<td>` or `colspan`), cell widths that add up to more than the table width |
| **Outlook** | hidden elements without `mso-hide:all`, `max-width` layouts with no ghost table or width attribute |
| **Accessibility / Copy** | text colour contrast (from the real background, including `bgcolor` and VML fills; hidden text and text over images are skipped), `lang`, empty link text, "click here" links, repeated words, double spaces |

### Look and feel

- Three themes: **Aurora** (default), **Sunrise** and **Midnight**. The code editors are dark in every theme.
- The formatted output is syntax-coloured (tags, attributes, values, CSS, Outlook conditionals, merge tags and entities), and lines with findings are marked in the gutter.

### Reading the results

- **Verdict banner:** *Ready to send*, *No blocking errors · N to review*, or *N problems to fix before sending*.
- **Count cards:** click *To fix by hand*, *To review* or *Notes* to show only those findings. *Category* narrows the list to one group.
- **Severity badges:** each finding is tagged Error, Review, Note or Fixed, with a matching colour bar. Groups that contain errors are listed first.
- **Output markers:** line numbers in the formatted HTML are coloured by the worst finding on that line. Hover to read the findings, click to filter the report to that line. Every `L123` chip in the report jumps to its line.
- **Special characters panel:** every special character in the email, with a plain answer for each:
  - **Status:** *Needs encoding* (written raw), *Invisible — check* (no-break or zero-width space and similar), *Optional* (`$`/`~` from the DARTmail list), *Replaced in output* (the tool wrote the code) or *Already encoded* (your HTML already uses `&nbsp;`, `&#185;` …).
  - **In this email:** the total, split into raw (and where: text, attribute, CSS, URL), replaced by the tool, and already written as each entity.
  - **Paste this:** the one code to use, with a Copy button. For CSS it's the CSS escape (`\0000DF`), and for URLs the percent-encoding. *Other codes* has named, decimal, hex, CSS, URL and the character itself.
  - **Where:** the real text around each occurrence with the character highlighted, and its line number.
  - The cards at the top filter the table. *Encode them in the output* replaces every raw character the tool can safely change (text, attributes, URLs). CSS is left for you, with the CSS code shown. *Copy list* copies the table for Excel or Sheets.
- **Autosave:** the HTML you paste is kept in the browser, so a refresh or a closed tab doesn't lose it. *Clear* removes it.
- **Settings** are grouped (Automatic fixes, Checks, Output) and remembered in the browser. *Reset to defaults* restores them.

### Switches

Every check group can be switched off in the toggle row. Points to know:

- **Apply fixes** off reports everything without changing the markup (the output is still re-indented).
- **Force px/% width fixes**: when a `width` attribute and the style disagree, the tool reports it. It only rewrites the style to match the attribute when this switch is on, because which value is right is your call.
- **Shorten CSS values** (off by default): rewrites the long shorthands, `0px` values and four-side longhands to their short form in the output. Off, they are listed for review.
- **Encode special characters** (off by default) turns non-ASCII characters in text, `alt` and `title` into HTML entities.

### Severity

- **Fixed**: changed automatically, safe to keep.
- **To fix by hand** (red): definitely broken.
- **To review** (amber): likely a problem, check it.
- **Notes** (grey): good to know.

## ASCII checker

The character list comes from the DARTmail Helper's `CheckHTML()` routine. A few of that tool's replacement entities were Windows-1252 codes rather than Unicode (`€` → `&#128;`, `–` → `&#150;`, `™` → `&#153;`, `’` → `&#146;`, and others), and `•` mapped to the middle dot. The checker suggests the correct entities instead (`&euro;`, `&ndash;`, `&trade;`, `&rsquo;`, `&bull;`).

## Development

```
node --test tests/engine.test.js   # run the test suite
node build.js                      # rebuild Envelyze.html
```

Edit `index.html`, `style.css` and `javascript.js`, then run `node build.js` so the single-file version stays identical.

If a single check ever throws, it is listed under **Tool problems** and every other check, and the formatting, still runs. If you see that group, send the template so the check can be fixed.

`javascript.js` holds the checking engine (`EmailTool.process(html, options)`, which also runs in Node) followed by the page code. `tests/fixtures/` has the templates the suite runs against, including a large, deeply nested German newsletter (`big-german.html`, regenerate with `node tests/make-big-german.js`) and three well-built templates (`clean.html`, `mjml-style.html`, `hybrid-style.html`) that must produce no errors or review items.

Developed by [Abhishek E T](https://abhisheket.com).

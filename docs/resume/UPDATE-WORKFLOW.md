# Resume: where it lives, and how to update every copy

When the owner's resume changes, update **every** place below in the same session, in this order. Nothing here is a secret: logins go through 1Password and the owner's own browser sessions, never through this file.

## Where the resume lives

| Place | What | How to reach it |
|---|---|---|
| Google Doc, **working draft** (source of truth) | "Ernie Ikerd Resume Q4-2026 v3 (Draft)", doc `1UHAtbD_XopSApV-0ccozzINXonUsnaFMxYlpNagrzNQ`. Holds the open questions page and `[Q#]` placeholders. | Google Docs connector (`update_doc`, `replaceAllText`); Drive `read_file_content` to read. |
| Google Doc, **send copy** | "Ernesto Ikerd Resume (send copy, 2026-10-01)", doc `1w3rLlRnn5y8PPVfM00XlVcbuH-ggiWhl0cBLWQn5aDI`. The working draft minus the questions page and every placeholder. | Same connectors. Export: Drive `download_file_content` with `exportMimeType: application/pdf`. |
| jobbylooky: **PDF attached to replies** | `resume/Ernesto-Ikerd-Resume.pdf` (`RESUME_PATH` overrides). The Docker image copies `resume/`, so Chungus only gets a new file after a redeploy. | This repo. |
| jobbylooky: **Markdown snapshot** | `docs/resume/ernesto-ikerd-resume.md` | This repo. |
| **LinkedIn** | linkedin.com/in/ernesto-ikerd-6a5b108: headline, experience entries, current role. | Owner's Chrome (Claude in Chrome), already signed in. |
| **Indeed, Gmail account (primary)** | psylux@gmail.com: headline, uploaded resume PDF. This is the account Indeed's job matching runs on. | Sign in with "Sign in with a code instead"; the code goes to Gmail. |
| **Indeed, Yahoo account (legacy)** | eikerd42@yahoo.com: holds a 2016-era Indeed Resume. Owner's decision (2026-10-01): hide it from employers, don't delete it. | Code goes to Yahoo Mail. |
| **Dice** | Account email psylux@gmail.com; profile at dice.com/dashboard/profiles. | 1Password login (Dice item). |

Headline wording as of 2026-10-01: resume and Indeed "Senior Software Engineer — Front-End Focused, Full-Stack"; LinkedIn adds "| Angular · TypeScript · Node.js · Data Visualization".

## Update workflow

1. **Edit the working draft** (source of truth). Settle facts there first: dates, titles, numbers.
2. **Mirror the change into the send copy.** Same headline, summary and bullets, but never a `[Q#]` placeholder or the questions page.
3. **Export the send copy to PDF and check it.** Render each page (macOS PDFKit; a 15-line Swift script works where poppler isn't installed) and confirm: two pages, no `[` left in the text, no stray empty bullet at the end. **The owner approves the PDF before it goes anywhere.**
4. **jobbylooky:** copy the PDF to `resume/Ernesto-Ikerd-Resume.pdf`, update `docs/resume/ernesto-ikerd-resume.md`, branch, PR, merge, then **redeploy Chungus** so the image carries the new file.
5. **Profiles** (each change is published, so the owner approves the list first):
   - LinkedIn: headline and changed experience entries. Turn **Notify network off** on every form, and skip the "share this update" and "people you may know" prompts afterwards.
   - Indeed (Gmail account): headline under "About you"; upload the PDF and press **Save resume**.
   - Indeed (Yahoo account): keep it hidden from employers.
   - Dice: headline/summary and upload the PDF.
6. Write a handoff note saying exactly which places changed.

## Logins and automation

- **Passwords:** 1Password through `request_credentials` then `autofill_credential`. Agents never see or type a password.
- **Email codes:** focus the code field, then `enter_verification_code`; the owner types the code. Never read a code out of the mailbox.
- **Typing doesn't always register** on Indeed and LinkedIn forms. Use `form_input`, read the value back with JavaScript before saving, and press buttons with a scripted click if a coordinate click does nothing.
- **Indeed upload:** the "Upload a resume" button creates its file input on click. Find the `input[type=file]`, use `file_upload` with the PDF's path, then confirm "Save resume".
- **jobbylooky in the browser** rejects cross-site navigations (`Sec-Fetch-Site`). Open `https://chungus.tail1d505c.ts.net/` first, then set `location.href = '/jobby/'`.
- **Clipboard copy needs the Chrome window focused.** To move text between sites while the owner works elsewhere, read it in slices and post it through jobbylooky's `/api/import` instead.

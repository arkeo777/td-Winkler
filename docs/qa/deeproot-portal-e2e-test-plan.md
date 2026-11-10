# DeepRoots Portal: End-to-End QA Test Plan & Follow-Along Guide

**Scope:** The full customer journey, from first marketing touch through purchase, school onboarding, admin setup, and a teacher and student logging in and working through a full class cycle. Run it across multiple browsers and devices.
**Audience:** QA testers (no coding needed). Each step is a human action with a stated expected result.
**Version:** 1.1 (draft) · **Owner:** QA Lead · **Last updated:** 2026-11-10

> **Sources:** v1.1 is aligned with the *Rooted for the Future* deck (DeepRoots Portal & Optimization plan). That deck says most Portal screens are still mockups and targets an end-of-March go-live. Run Phases 1–4 (the public site, which goes live first) as soon as they exist. Run the rest as each area becomes real. Anything not yet built is marked **N/A – not built** in the checklist.

> **How to read this guide**
> - Each test case has an **ID**, **Who** (which persona performs it), **Action** (exactly what a human does), and **Expected result**.
> - Mark each step **P** (Pass), **F** (Fail), **B** (Blocked), or **N/A**. Log every F or B in the Defect Log (Appendix B).
> - Items in `[CONFIRM: …]` are placeholders. This draft was written without access to the DeepRoots Portal build, so the QA Lead must replace them with the real screen names, URLs, and rules before the first run.
> - Take a screenshot at every step marked 📸. Name it `<TestID>_<Browser>_<Pass|Fail>.png`.

---

## 1. Personas (who plays which role)

Assign each role to a named tester before starting. One person can play several roles, but **use a separate browser profile or private window for each role**. Never let two roles share a session.

| Persona | Description | Assigned tester |
|---|---|---|
| **Prospect** | School decision-maker who discovers DeepRoots (principal, head of school, district IT) | |
| **Purchaser** | Person who buys. Often the same as the Prospect, sometimes a business office or billing contact | |
| **DeepRoots Staff** | Internal staff in the staff portal: Sales, Customer Success, Finance, Support. They work leads, run the new-school workflow, and hand it off Sales → Success → Finance. Invite-only sign-in. | |
| **School Admin** | The school's primary administrator in the Portal | |
| **Teacher** | Classroom teacher at the new school | |
| **Student** | Student enrolled in the teacher's class | |
| **Homeschool parent** | Buys for their own children and acts as admin and teacher. Run the Homeschool variant (Section 4, Phase 6H). | |
| **Parent/Guardian** *(optional)* | Parent engagement portal is on the later roadmap. Skip until it exists. | |

---

## 2. Environment & Prerequisites

### 2.1 Environment
| Item | Value |
|---|---|
| Marketing site URL | Live: deeprootsbible.com. Staging: `[CONFIRM]` |
| Portal URL | Live: portal.deeproots.akoolai.com. Staging: `[CONFIRM]` |
| Learning platform (LMS) | Where teachers and students use the curriculum `[CONFIRM: URL and test tenant]` |
| Payment processor mode | **TEST / sandbox only.** Never use a real card. `[CONFIRM: Stripe / other]` |
| CRM | Salesforce (sandbox). The Portal syncs a copy of it. |
| Build / release under test | |

### 2.2 Test data (fill in before the run)
Use **plus-addressing** so every account lands in one QA inbox but is still unique. Add the run date and browser code so reruns never collide.

| Data | Example value (run on 11/09, Chrome = `CH`) |
|---|---|
| QA inbox | `deeproot.qa@yourcompany.com` |
| Prospect / Purchaser email | `deeproot.qa+buyer-1109-CH@yourcompany.com` |
| School Admin email | `deeproot.qa+admin-1109-CH@yourcompany.com` |
| Teacher 1 email | `deeproot.qa+teacher1-1109-CH@yourcompany.com` |
| Teacher 2 email | `deeproot.qa+teacher2-1109-CH@yourcompany.com` |
| Student emails / usernames | `deeproot.qa+student1-1109-CH@…` through `student10` `[CONFIRM: do students use email, username, or class code?]` |
| School name | `QA Test Academy 1109-CH` |
| School address | 123 Test Lane, Springfield, IL 62701 |
| Grades | 6–8 `[CONFIRM supported grade bands]` |
| Classes | `Science 7 – Period 1`, `Math 7 – Period 2` |
| Test card (success) | `[CONFIRM: e.g. Stripe 4242 4242 4242 4242, any future date, any CVC]` |
| Test card (decline) | `[CONFIRM: e.g. 4000 0000 0000 0002]` |
| Test card (3-D Secure) | `[CONFIRM: e.g. 4000 0027 6000 3184]` |
| Bulk upload files | `teachers_template.csv`, `students_template.csv` (download from the Portal in step 6. Keep one valid file and one file with deliberate errors.) |

### 2.3 Before every browser run
1. Close all windows of the browser under test.
2. Open a **new private/incognito window** (or a fresh browser profile) so no cookies or cached login carry over.
3. Confirm the browser version (`Help → About`) and write it in the Run Log (Appendix A).
4. Open the QA inbox in a **different** browser or device so email checks don't disturb the session under test.
5. Set the system clock and timezone to normal values. Note the tester's timezone because scheduling and due dates depend on it.

---

## 3. Browser & Device Matrix

Schools use a lot of Chromebooks and iPads. Treat those as first-class targets.

| Code | Browser / Device | OS | Priority | Run scope |
|---|---|---|---|---|
| **CH** | Chrome (latest) | Windows 11 | P1 | **Full run, Phases 1–10** |
| **CB** | Chrome on Chromebook | ChromeOS | P1 | Full run, Phases 7–9 (teacher and student). Smoke test the rest. |
| **SF** | Safari (latest) | macOS | P1 | Full run, Phases 1–10 |
| **iP** | Safari | iPadOS | P1 | Phases 1–4 (marketing and purchase on a tablet) + Phases 7–9 |
| **ED** | Edge (latest) | Windows 11 | P2 | Phases 1–6 (admin-heavy work), smoke test 7–9 |
| **FF** | Firefox (latest) | Windows or macOS | P2 | Phases 1–6, smoke test 7–9 |
| **iS** | Safari | iPhone (iOS latest) | P2 | Phases 1–3 (marketing on phone) + Phase 8 (student on phone) |
| **AN** | Chrome | Android phone | P3 | Phases 1–3 + Phase 8 |

**"Smoke test"** means: log in, open the main screen for that role, do one key action, log out.

**Recommended order:** Do the first full pass on **CH**. Once that is clean, run the other browsers. A run on a new browser creates a **new school** with that browser's code (e.g. `QA Test Academy 1109-SF`), so data never overlaps.

---

## 4. Test Phases (the follow-along script)

### Phase 1: Marketing & Discovery
*Goal: a prospect can find DeepRoots from each marketing channel, and the link tracking works.*

| ID | Who | Action | Expected result | P/F | Notes |
|---|---|---|---|---|---|
| MKT-01 | Prospect | Click the link in the current marketing email or newsletter `[CONFIRM: campaign name]` | Lands on the correct landing page. URL keeps its UTM tags (`utm_source`, `utm_medium`, `utm_campaign`). 📸 | | |
| MKT-02 | Prospect | Click the current social or paid ad link `[CONFIRM: LinkedIn/Facebook/Google Ads test link]` | Correct landing page. UTMs present. No 404, no mixed-content warning. | | |
| MKT-03 | Prospect | Search Google for "DeepRoots Portal" and click the organic result | Lands on the homepage. Page title and meta description are correct in the search result. | | |
| MKT-04 | Prospect | Type the website URL directly | Homepage loads over **https** with a valid padlock in under ~3 s. | | |
| MKT-05 | Prospect | Accept and then decline the cookie or consent banner (if present) | Banner behaves correctly and remembers the choice on refresh. | | |
| MKT-06 | QA | Check analytics or the tag manager for the visit `[CONFIRM: GA4 / other]` | The session appears with the correct source and campaign. | | |

### Phase 2: Website Exploration
*Goal: the site clearly explains the product and every path to "buy" or "talk to sales" works.*

| ID | Who | Action | Expected result | P/F | Notes |
|---|---|---|---|---|---|
| WEB-00 | Prospect | Visit each page in the plan: Home, Why, Curriculum, Testimonials, FAQ, Resources, Shop, Events, Contact | Each page exists and has real DeepRoots content (no placeholder text). Curriculum shows K–6 alignment, with missing grades marked "coming soon". | | |
| WEB-01 | Prospect | Click every item in the main navigation and footer | Every link loads the right page. No 404s or placeholder "lorem ipsum" text. | | |
| WEB-02 | Prospect | Open the **Features / Product** page | Content, images, and videos load and play. Screenshots match the current Portal. | | |
| WEB-03 | Prospect | Open the **Pricing** page `[CONFIRM: public prices or "contact us"?]` | Plans, prices, and per-student or per-school terms display correctly. Monthly/annual toggle works. 📸 | | |
| WEB-04 | Prospect | Open the FAQ, About, Privacy Policy, Terms, and Accessibility pages | All load. Privacy and Terms are current versions and mention student data (FERPA/COPPA) `[CONFIRM]`. | | |
| WEB-05 | Prospect | Resize the window to phone width (or use the phone devices in the matrix) | Layout adapts. Menu collapses to a hamburger that opens and closes. No horizontal scrolling. | | |
| WEB-06 | Prospect | Navigate the homepage using **only the keyboard** (Tab, Shift+Tab, Enter) | Focus is visible on every link and button. All CTAs can be reached and activated. | | |
| WEB-07 | Prospect | Click the **"Log in"** link on the marketing site | Goes to the right login (Portal or learning platform) `[CONFIRM]`. | | |
| WEB-08 | Prospect | Use site search (FAQ + site search) for "assessment" and for a nonsense word | Relevant results for the real word. A clear "no results" message for the nonsense word. | | |
| WEB-09 | Prospect | Open Events and register for one, if registration exists `[CONFIRM]` | Registration confirmation and email. | | |

### Phase 3: Interest & Lead Capture
*Goal: a prospect can express interest, and a human at DeepRoots receives it and follows up.*

| ID | Who | Action | Expected result | P/F | Notes |
|---|---|---|---|---|---|
| LEAD-01 | Prospect | Open **Request a Demo / Contact Us / Get Started** `[CONFIRM name]` and click Submit with **all fields empty** | Required-field errors appear next to each field. Form does not submit. | | |
| LEAD-02 | Prospect | Enter an invalid email (`abc@`) and an invalid phone number | Clear validation messages appear. | | |
| LEAD-03 | Prospect | Fill in valid data: name, the Prospect email, school name, role, number of students, phone, message. Submit. | Thank-you message or page appears. 📸 No duplicate submission if Submit is double-clicked. | | |
| LEAD-04 | Prospect | Check the QA inbox | Auto-reply or confirmation email arrives within `[CONFIRM: 5 min]`. Branding, links, and sender name are correct. Not in spam. 📸 | | |
| LEAD-05 | DeepRoots Staff | In the staff portal, open the **Marketing** section, then check Salesforce | The submission appears in Marketing (forms feed it directly) and in Salesforce with every field and the UTM source. Assigned to the right rep. | | |
| LEAD-06 | DeepRoots Staff | **Human step:** rep sends the follow-up email or schedules the demo (use the real template) `[CONFIRM: calendar booking link?]` | Prospect receives the email. Booking link works and the calendar invite arrives for both parties. | | |
| LEAD-07 | DeepRoots Staff | **Human step:** rep sends the quote or purchase link `[CONFIRM: self-serve checkout vs. sales-issued quote/invoice]` | Prospect receives a link or quote with the correct plan, seat count, and price. | | |

### Phase 4: Purchase
*Goal: the school can pay (or commit to pay), and an account is created.*

> Run **4A (card checkout)** on every P1 browser. Run **4B (invoice/PO)** once on CH, if that path exists.

**4A: Self-serve card checkout (the public site's Shop & checkout)**

| ID | Who | Action | Expected result | P/F | Notes |
|---|---|---|---|---|---|
| BUY-01 | Purchaser | From Pricing or the quote link, choose the plan and enter the seat or student count | Total updates correctly, including tax, discounts, and annual vs. monthly. | | |
| BUY-02 | Purchaser | Apply a valid promo code, then an invalid one `[CONFIRM if supported]` | Valid code reduces the total. Invalid code shows an error. | | |
| BUY-03 | Purchaser | Enter purchaser details and billing address. Leave Terms **unchecked** and submit. | Blocked with "must accept Terms" message. | | |
| BUY-04 | Purchaser | Pay with the **decline** test card | Friendly decline message. No account created. No charge or receipt email. | | |
| BUY-05 | Purchaser | Pay with the **3-D Secure** test card and complete the challenge | Challenge popup works (popups not blocked). Payment succeeds. | | |
| BUY-06 | Purchaser | *(If BUY-05 is not used)* Pay with the **success** test card, accept Terms, submit | Confirmation page shows an order number. 📸 Back button or refresh does **not** charge twice. | | |
| BUY-07 | Purchaser | Check the QA inbox | Receipt or invoice email with correct amount, plan, and legal entity. Welcome or "set up your school" email with a working link. 📸 | | |
| BUY-08 | DeepRoots Staff | Check the payment dashboard (test mode) and CRM | Payment recorded once. CRM deal moves to Closed/Won `[CONFIRM]`. | | |

**4B: Invoice / Purchase Order path** *(schools often pay by PO)*

| ID | Who | Action | Expected result | P/F | Notes |
|---|---|---|---|---|---|
| BUY-10 | Purchaser | Choose "Pay by invoice/PO" and enter a PO number | Order is accepted as "pending payment". | | |
| BUY-11 | DeepRoots Staff | **Human step:** create and send the invoice from the billing system | Purchaser receives an invoice PDF with the PO number on it. | | |
| BUY-12 | DeepRoots Staff | **Human step:** mark the invoice paid (test) or approve provisioning before payment `[CONFIRM policy]` | Account is activated and the welcome email is sent. | | |

### Phase 5: New School Setup (Onboarding)
*Goal: the purchaser registers the new school and hands it off to a School Admin.*

| ID | Who | Action | Expected result | P/F | Notes |
|---|---|---|---|---|---|
| SCH-01 | Purchaser | Click the setup link in the welcome email | Opens the account creation or onboarding page. Link is single-use and expires after `[CONFIRM]` (re-clicking later shows a sensible message). | | |
| SCH-02 | Purchaser | Create a password that is too weak, then a valid one | Weak password is rejected with the rules shown. Valid password is accepted. | | |
| SCH-03 | Purchaser | Set up MFA if offered or required `[CONFIRM]` | Authenticator or SMS code works. Backup codes shown. | | |
| SCH-04 | Purchaser | Enter school details: name, address, district, timezone, grade levels, school year start and end dates, logo upload `[CONFIRM fields]` | All fields save. Logo previews. Timezone defaults sensibly. 📸 | | |
| SCH-05 | Purchaser | Try to save with a duplicate school name or invalid ZIP | Correct validation. | | |
| SCH-06 | Purchaser | Designate the **School Admin**: either "I am the admin" or "invite someone else" using the School Admin email | Invite is sent. Pending invite is listed. | | |
| SCH-07 | DeepRoots Staff | In the staff portal, open **Workflows** and find the new-school sign-up | A step-by-step tracker exists for this school, showing the current step and who it's waiting on. 📸 | | |
| SCH-07a | DeepRoots Staff | **Human step:** Sales completes their steps | Tracker hands off to Customer Success automatically, and Success is notified. | | |
| SCH-07b | DeepRoots Staff | **Human step:** Customer Success completes onboarding steps (seat count matches the purchase), then hands off to Finance | Hand-off to Finance happens automatically. Nothing is left waiting on the wrong team. | | |
| SCH-07c | DeepRoots Staff | Open the **Schools directory** in the School Portal during and after onboarding | During onboarding, the school is listed under **Onboarding** with a progress tracker. When onboarding completes, it moves to **Active**. State filter and map show it in the right place. | | |
| SCH-07d | DeepRoots Staff | Open the school's page | Logo, partner tier badge, contacts, and Salesforce billing history are correct for this school. | | |
| SCH-08 | Purchaser | Log out | Returns to the login page. Back button does not show protected pages. | | |

### Phase 5S: DeepRoots Staff Sign-in
*Goal: only invited staff can get into the staff portal.*

| ID | Who | Action | Expected result | P/F | Notes |
|---|---|---|---|---|---|
| STF-01 | DeepRoots Staff | At the Portal sign-in, enter an **approved** staff email and request a code | Email arrives with a one-time link and a 6-digit code. | | |
| STF-02 | DeepRoots Staff | Sign in with the 6-digit code. Sign out. Try the same code again. | First use works. Reusing it is refused. | | |
| STF-03 | DeepRoots Staff | Request a code, wait past its expiry `[CONFIRM]`, then use it | Refused with a clear "expired, request a new one" message. | | |
| STF-04 | Prospect | Request a code with an email that is **not** on the approved list | No access. The message doesn't reveal whether the email exists. | | |
| STF-05 | Tester | Check the sign-in page on staging and live | **"Dev sign-in (local only)" is not visible.** | | |
| STF-06 | DeepRoots Staff | Open Settings → Connections & Vault as a non-admin staff member | Can't change connections. No passwords or keys are ever shown. | | |

### Phase 6: School Admin Setup (school, teachers, classes, students)
*Goal: the admin builds the whole school roster by hand **and** by bulk upload.*

> The deck's assistant example ("How do I fill out our roster?") suggests rosters may live in the learning platform (LMS) rather than the Portal. `[CONFIRM: which system each step below happens in]`

**6A: Admin activation**

| ID | Who | Action | Expected result | P/F | Notes |
|---|---|---|---|---|---|
| ADM-01 | School Admin | Open the invite email and click Accept | Account activation page. Email field is pre-filled and locked. | | |
| ADM-02 | School Admin | Set password (and MFA if required). Log in. | Lands on the Admin Dashboard. School name and logo are shown. A first-time walkthrough or checklist appears if designed `[CONFIRM]`. 📸 | | |
| ADM-03 | School Admin | Review and edit school settings: terms or grading periods, bell schedule, grading scale `[CONFIRM]` | Changes save and stay after refresh. | | |

**6B: Add teachers**

| ID | Who | Action | Expected result | P/F | Notes |
|---|---|---|---|---|---|
| ADM-10 | School Admin | **Add one teacher manually** (Teacher 1: first name, last name, email, subject) | Teacher appears in the list as "Invited/Pending". Invite email sent. | | |
| ADM-11 | School Admin | Try to add Teacher 1 again with the same email | Duplicate is blocked with a clear message. | | |
| ADM-12 | School Admin | Download the **teacher CSV template**. Fill in Teacher 2 + 3 more. Upload. | Preview shows 4 rows. Import succeeds. Count = 5 teachers. | | |
| ADM-13 | School Admin | Upload a CSV with errors (missing email, bad format, extra columns) | Row-level errors are listed. Valid rows import or the whole file is rejected, per the design `[CONFIRM]`. Nothing is half-imported silently. | | |
| ADM-14 | School Admin | Resend an invite. Edit a teacher's name. Deactivate a teacher. | Each action works and is reflected in the list. | | |

**6C: Create classes**

| ID | Who | Action | Expected result | P/F | Notes |
|---|---|---|---|---|---|
| ADM-20 | School Admin | Create class **Science 7 – Period 1**: subject, grade, term, schedule | Class is created. 📸 | | |
| ADM-21 | School Admin | Assign **Teacher 1** to Science 7 | Teacher is shown on the class. | | |
| ADM-22 | School Admin | Create **Math 7 – Period 2** and assign Teacher 2. Add Teacher 1 as co-teacher `[CONFIRM if supported]` | Both teachers are listed. | | |
| ADM-23 | School Admin | Create a class with no teacher. Then try to delete a class that has students. | No-teacher class allowed or blocked per design. Delete asks for confirmation and warns about enrolled students. | | |

**6D: Add students & enroll**

| ID | Who | Action | Expected result | P/F | Notes |
|---|---|---|---|---|---|
| ADM-30 | School Admin | **Add Student 1 manually**: name, grade, student ID, email or username, date of birth if required `[CONFIRM]` | Student created. Login method or credentials shown or sent, per design. | | |
| ADM-31 | School Admin | Bulk upload Students 2–10 from the CSV template | 9 imported. Total = 10. | | |
| ADM-32 | School Admin | Upload students so the total goes **over the purchased seat limit** | Blocked or warned per the contract rule `[CONFIRM]`. | | |
| ADM-33 | School Admin | Enroll Students 1–6 in Science 7 and Students 4–10 in Math 7 (overlap is intentional) | Class rosters show the correct counts (6 and 7). | | |
| ADM-34 | School Admin | Move Student 6 from Science 7 to Math 7. Remove Student 10 from Math 7. | Rosters update. Student history is kept or handled per design. | | |
| ADM-35 | School Admin | **Human step:** distribute student credentials (print login cards, export the PDF, or rely on the email) `[CONFIRM method]` | Printout or export is legible and shows correct usernames. No passwords shown in plain text unless intended. 📸 | | |
| ADM-36 | School Admin | Open the dashboard and reports | Counts are correct: 5 teachers, 10 students, 2+ classes. | | |
| ADM-37 | School Admin | Log out | Session ends. | | |

**6H: Homeschool variant** *(run once on CH and once on iP)*

| ID | Who | Action | Expected result | P/F | Notes |
|---|---|---|---|---|---|
| HS-01 | Homeschool parent | Buy a homeschool plan in the Shop | Checkout and receipt work. The account is set up as a homeschool, not a school. | | |
| HS-02 | Homeschool parent | Sign in, add 2 children, assign grade levels | Children created. No school-admin-only screens shown. | | |
| HS-03 | Homeschool parent | Ask the Rooted Helper "Reset my child's password?" and follow its answer | Answer is correct for a homeschool parent. The reset works. | | |
| HS-04 | Student | Log in as each child | Each sees only their own grade's curriculum. | | |

### Phase 7: Teacher Journey (first login to last)

> Use a **separate private window** or a Chromebook for the teacher.

| ID | Who | Action | Expected result | P/F | Notes |
|---|---|---|---|---|---|
| TCH-01 | Teacher 1 | Open the invite email and click Accept | Activation page. Expired-link message if the link is older than `[CONFIRM]`. | | |
| TCH-02 | Teacher 1 | Set password, log in (or use SSO: Google / Microsoft / Clever / ClassLink `[CONFIRM which SSO]`) | Lands on the Teacher Dashboard. 📸 | | |
| TCH-03 | Teacher 1 | Check the class list | Sees **Science 7** and **Math 7** (co-teacher) only. Does **not** see other teachers' classes. | | |
| TCH-04 | Teacher 1 | Open the Science 7 roster | Students 1–5 (after the ADM-34 move). Names and photos correct. | | |
| TCH-05 | Teacher 1 | Edit their own profile: name, photo, notification preferences | Saves. | | |
| TCH-06 | Teacher 1 | Create an **assignment/lesson** in Science 7: title, instructions, attach a file (PDF + image), due date tomorrow, points = 10 `[CONFIRM content types]` | Assignment created. Attachments upload. Due date shows in the school's timezone. 📸 | | |
| TCH-07 | Teacher 1 | Post an announcement or message to the class `[CONFIRM]` | Visible in the class feed. | | |
| TCH-08 | Teacher 1 | Log out. Use **Forgot password**. Reset via email. Log back in with the new password. | Reset email arrives. Old password no longer works. New one does. | | |
| TCH-09 | Teacher 1 | Enter the wrong password 5 times `[CONFIRM lockout threshold]` | Account locks or a captcha appears. A clear message tells the user how to recover. | | |
| TCH-10 | Teacher 1 | Leave the browser idle past the session timeout `[CONFIRM: e.g. 30 min]` | Session expires and redirects to login. Unsaved work warning if designed. | | |

### Phase 8: Student Journey (first login to last)

> Use another separate window, ideally a **Chromebook, iPad, or phone** to reflect real student devices.

| ID | Who | Action | Expected result | P/F | Notes |
|---|---|---|---|---|---|
| STU-01 | Student 1 | Go to the Portal login page and log in with the credentials from ADM-35 (or a class code or SSO `[CONFIRM]`) | Login succeeds. 📸 | | |
| STU-02 | Student 1 | First-login prompt: change the temporary password or accept the terms `[CONFIRM]` | Completes and lands on the Student Dashboard. | | |
| STU-03 | Student 1 | View the class list | Sees **Science 7 only** (Student 1 is not in Math 7). | | |
| STU-04 | Student 1 | Open the assignment from TCH-06 | Instructions and attachments open or download. Due date is correct. | | |
| STU-05 | Student 1 | See the announcement from TCH-07 | Visible. | | |
| STU-06 | Student 1 | Complete and **submit** the assignment: type a response and upload a file (photo from camera on a tablet or phone) | Submission confirmation. Status = "Submitted" with a timestamp. 📸 | | |
| STU-07 | Student 1 | Try to edit or resubmit after submitting | Allowed or blocked per design `[CONFIRM]`. | | |
| STU-08 | Student 4 | Log in (enrolled in both classes). Check the class list. | Sees Science 7 **and** Math 7. | | |
| STU-09 | Student 10 | Log in (removed from Math 7 in ADM-34) | Does **not** see Math 7 or its content. | | |
| STU-10 | Student 1 | Log out and close the browser. Reopen it. | Not still logged in on a shared device (unless "remember me" was ticked). | | |

### Phase 9: Closing the Loop (teacher → student → admin)
*Goal: data moves correctly between all three roles.*

| ID | Who | Action | Expected result | P/F | Notes |
|---|---|---|---|---|---|
| LOOP-01 | Teacher 1 | Open the Science 7 assignment's submissions | Student 1 shows "Submitted" with the uploaded file. Others show "Not submitted". | | |
| LOOP-02 | Teacher 1 | Grade Student 1: 8/10 with written feedback. Publish or return it. | Grade saved. | | |
| LOOP-03 | Student 1 | Log in. View grades and feedback. | Sees 8/10 and the feedback. Notification email or alert received if designed. 📸 | | |
| LOOP-04 | Teacher 1 | After the due date passes (or change the due date to the past), check an un-submitted student | Marked "Missing/Late" per design. | | |
| LOOP-05 | School Admin | Log in. Open reports or the gradebook in the learning platform `[CONFIRM]` | Assignment and grade activity visible. Login and usage stats show the teacher and student logins. | | |
| LOOP-05a | DeepRoots Staff | Open the school's page in the School Portal | Curriculum login analytics show today's teacher and student logins. The "last updated" stamp is recent. | | |
| LOOP-07 | School Admin | Send DeepRoots a tech question and a content question through the Portal `[CONFIRM: where schools send messages]` | In the staff Inbox, the tech message lands with Technology and the content message with Editorial. Each shows up as a ticket in the Support queue. | | |
| LOOP-06 | Teacher 1 & Student 1 | Send messages both ways if messaging exists `[CONFIRM]` | Delivered. Respects any school messaging rules. | | |

### Phase 10: Security & Permission Checks (negative tests)

| ID | Who | Action | Expected result | P/F | Notes |
|---|---|---|---|---|---|
| SEC-01 | Student 1 | While logged in, paste an **admin page URL** (copied from the admin session) into the address bar | Access denied or redirect. No admin data shown. | | |
| SEC-02 | Teacher 1 | Paste a URL for a class they don't teach (Teacher 2's class) | Access denied. | | |
| SEC-03 | Student 1 | Change the ID in a URL (e.g. `/students/123` → `/students/124`) | Cannot see another student's data. | | |
| SEC-04 | School Admin | Deactivate Teacher 3 and Student 9. Then try to log in as each. | Both logins are refused with an appropriate message. | | |
| SEC-05 | Admin of a *different* QA school (from another browser run) | Try to open a URL belonging to `QA Test Academy 1109-CH` | Access denied. Schools are isolated from each other. | | |
| SEC-06 | Any | Log out, then press Back | No cached protected pages are visible. | | |
| SEC-07 | Teacher | Ask the Rooted Helper an internal question (e.g. "Which schools renew soon?" or "Where's the Employee Handbook?") | Helper refuses or gives no internal information. A school never sees internal-only answers. | | |
| SEC-08 | Teacher, School Admin, DeepRoots Staff | Ask the Rooted Helper the deck's example questions for each role ("How do I fill out our roster?", "Add another teacher?", "Which schools renew soon?") | Each answer fits that role and is accurate. Staff get internal answers. Schools get school answers. | | |
| SEC-09 | School Admin | Try to open the staff portal URL with a school account | Access denied. | | |
| SEC-10 | DeepRoots Staff | Open any dashboard section | Shows a "last updated" stamp. Anything illustrative is clearly labelled as illustrative. | | |

---

## 5. Exit Criteria / Sign-off

The run is **complete** when:
- [ ] All P1 browsers have finished their full scope with **no open Critical or High defects**.
- [ ] All P2 and P3 browsers have finished their scope. Medium and Low defects are logged and triaged.
- [ ] Every 📸 screenshot is saved in the shared QA folder.
- [ ] Emails were checked on at least Gmail web + Outlook + one phone mail app.
- [ ] Test data cleanup (Section 6) is done or scheduled.

| Role | Name | Signature / Date |
|---|---|---|
| QA Lead | | |
| Product Owner | | |
| Engineering Lead | | |

## 6. Cleanup
1. DeepRoots Staff: void or refund test payments in the sandbox. Mark test CRM deals as "Test – do not report".
2. Back-office: archive or delete every `QA Test Academy <date>-<browser>` school `[CONFIRM: delete vs. archive policy]`.
3. Clear browser profiles used for testing.
4. Analytics: confirm the QA traffic filter excluded these sessions, or annotate the dates.

---

## Appendix A: Run Log (one row per browser)

| Browser code | Browser + version | OS / device | Tester | Date | School name created | Start | End | Result (Pass / Fail / Partial) |
|---|---|---|---|---|---|---|---|---|
| CH | | | | | | | | |
| CB | | | | | | | | |
| SF | | | | | | | | |
| iP | | | | | | | | |
| ED | | | | | | | | |
| FF | | | | | | | | |
| iS | | | | | | | | |
| AN | | | | | | | | |

## Appendix B: Defect Log Template

| Defect # | Test ID | Browser | Severity (Critical / High / Medium / Low) | Summary | Steps to reproduce | Expected | Actual | Screenshot / video | Status |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

**Severity guide**
- **Critical:** blocks the journey (can't buy, can't log in, data from another school is visible, double charge).
- **High:** a major feature is broken with no workaround (bulk upload fails, student can't submit).
- **Medium:** broken with a workaround, or wrong data in a non-critical spot.
- **Low:** cosmetic, typo, or minor layout issue.

## Appendix C: Open Questions for Product (answer before the first run)

*Answered by the deck:* CRM is Salesforce. Staff sign in with an invite-only code or link. New schools run through a Workflows tracker with automatic hand-offs Sales → Success → Finance, and move from Onboarding to Active in the Schools directory. Homeschools are a customer type. The Rooted Helper is role-aware. Mobile app, parent portal, and single sign-on across tools are later roadmap items.

*Still open:*
1. Is purchase fully self-serve, sales-led (quote then invoice), or both?
2. Is there an internal approval or provisioning step before a school goes live?
3. Which steps happen in the Portal and which in the learning platform (LMS): rosters, classes, assignments, grades, student logins?
4. How do students log in: email, username, class code, QR code, or SSO?
5. How does a homeschool account differ from a school account at checkout and setup?
6. What are the seat-limit rules when a school goes over its purchased count?
7. What are the password rules, lockout threshold, session timeout, and invite-link expiry?
8. Which content and assignment types exist (files, quizzes, video, external links)?
9. What are the data retention and deletion rules for test schools?

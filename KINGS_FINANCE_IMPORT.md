# Loading KINGS' SCHOOLS September fees into the app

**Written:** 26 September 2026
**Source:** `KINGS september.xlsx` — 15 sheets, 13 class sheets plus DASHBOARD and FOLLOW-UP
**Status:** Plan and questions. Nothing imported yet.

---

## 1. What is in your file

I read every sheet. Here is what is actually there.

| | |
| --- | --- |
| Students | **232** across 13 classes |
| Billed in September | **$17,453** |
| Collected | **$15,521** |
| Still owed | **$1,932** |
| Collection rate | **89%** |

Per class, and whether my count matches your DASHBOARD sheet:

| Class | Students | Fee | Paid | Matches DASHBOARD? |
| --- | --- | --- | --- | --- |
| Baby Class | 37 | 2,350 | 2,182 | **No** — dashboard says 36 / 2,125 / 1,957 |
| Top Class | 24 | 1,910 | 1,790 | **No** — dashboard says 1,810 / 1,690 |
| C1 | 27 | 2,220 | 2,220 | Yes |
| Class 2 | 27 | 2,224 | 1,956 | Yes |
| Class 3 | 19 | 1,778 | 1,390 | Yes |
| C4 | 13 | 1,160 | 772 | Yes |
| Class 5 | 13 | 859 | 659 | Yes |
| Class 6 | 9 | 662 | 662 | Yes |
| C8 | 21 | 1,258 | 1,118 | **No** — dashboard says 20 / 1,158 / 1,018 |
| F1 | 17 | 1,110 | 1,110 | Yes |
| F2 | 10 | 710 | 660 | Yes |
| F3 | 8 | 636 | 496 | Yes |
| F4 | 7 | 576 | 506 | Yes |

Payment status: **164 paid**, **32 free**, **19 unpaid**, **10 partial**, **7 with no status**.

Families: **43 phone numbers cover 162 children**, so most parents have more than one child
here. **14 children have no phone at all.**

---

## 2. The one real problem

Your school charges **each child a different amount**. The app charges **each class one amount**.

Look at C1. Twenty-seven children, and these fees:

```
0, 50, 70, 80, 90, 100, 120, 130
```

Eight different prices in one class. Across the whole school there are **19 different
amounts**, from $0 to $150.

The app works the other way round. You set one monthly fee for a class, or a grade, or a
category, and every child in it pays that. Here is the actual rule in the code:

```
CLASS  →  CATEGORY  →  SCHOOL_GRADE
```

There is nothing below CLASS. **No per-student fee exists.** So today the app cannot hold your
data truthfully. It would force all 27 children in C1 onto one price, and the numbers would
stop matching your sheet.

**This is not a data-loading problem. The fee model has to change first.**

---

## 3. What I would change

One addition, and it is small.

Add **STUDENT** to the top of that chain:

```
STUDENT  →  CLASS  →  CATEGORY  →  SCHOOL_GRADE
```

That means: if this child has his own fee, use it. If not, fall back to his class fee, then his
category, then his grade. Exactly how it works now, with one more step in front.

Why this is the right shape and not a patch:

- **Nothing existing breaks.** A school that charges by class carries on unchanged. The new
  step simply finds nothing and falls through.
- **It is how your school really works.** Each family has agreed a price. That belongs on the
  child, not on the class.
- **The 32 free children stop being a special case.** A free child gets a $0 fee. He is still
  billed, still appears on every report, and owes nothing. No separate "free" flag to remember.
- **It reuses everything.** The same billing button, the same payments desk, the same monthly
  collection and Excel export. Only where the amount comes from changes.

What it touches:

| Piece | Change |
| --- | --- |
| `FeeStructure` model | Add `STUDENT` to `targetType`, and a `studentId` field |
| `monthlyBillingService` | Add `STUDENT` to the front of the precedence list, and match on the student |
| A screen | Set or change one child's fee, on the student page |
| Tests | Per-student fee wins over class fee; a child with no own fee still gets the class fee |

---

## 4. The second problem: matching the children

Your school is already in the app with **254 students**. Your fee sheet has **232 rows**. Before
any fee can be attached, each row has to be tied to the right child. I tested three ways.

### The ID column does not work

Each student in the app carries an "Old School ID" in their notes. That looked like the answer,
so I tried it. **It matches the wrong people.**

Of 232 rows, 103 found an ID in the app — and of those 103, only **one** was actually the same
person. The rest were different children entirely:

```
old ID 183    your sheet: anas sadek adawe olow    the app: Ahlam Ahmed Ali
old ID 182    your sheet: maziN abubakar omar      the app: Abas Sidow Osman Abdi
```

So the numbers in your September file are **not** the numbers the app stored. Had I trusted
them, 102 children would have been given another child's fee. **Do not use the ID column.**

### Name and phone works for two thirds

| Result | Rows |
| --- | --- |
| **Confident match** | **156** |
| Needs a person to confirm | 72 |
| No candidate at all | 4 |

The 72 are not sloppy data. They are real families:

```
your sheet: Aatika mohamed abukar
the app:    Atika Mohamed Abukar   ← probably her
            Ismail Mohamed Abukar  ← her brother
```

Somali family names repeat heavily, so brothers and sisters look almost identical to a
computer. Four rows have only a first name — "Abdurahman", "Anzal", "Nadiro nasir" — and cannot
be identified at all.

**I will not guess at these.** A fee attached to the wrong child is worse than a fee not
attached at all, and the parent would see someone else's bill.

### Adding the class made it worse, and here is why

I tried using the class as a third clue. Confident matches **dropped** from 156 to 122. The
reason is the next problem.

---

## 5. The third problem: the classes disagree

**Eleven of your thirteen classes have a different number of children in the app than in your
fee sheet.**

| Class | In the app | In your fee sheet |
| --- | --- | --- |
| Baby Class | 18 | **37** |
| Top Class | **39** | 24 |
| Class 1 | 33 | 27 |
| Class 2 | 32 | 27 |
| Class 3 | 23 | 19 |
| Class 4 | 19 | 13 |
| Class 5 | **29** | **13** |
| Class 6 | **2** | **9** |
| Class 8 | 19 | 21 |
| Form 1 | 14 | 17 |
| Form 2 | 11 | 10 |
| Form 3 | 8 | 8 |
| Form 4 | 7 | 7 |
| **Total** | **254** | **232** |

Even among the 156 children I matched with confidence, **12 sit in a different class** in the
app than in your sheet.

And **133 of the 254 children in the app never appear in the fee sheet at all.**

This has to be settled before fees go anywhere near them, because the app bills by class. If a
child is in Class 5 in the app but Class 3 on your sheet, he will be billed with the wrong
group and appear on the wrong report.

Two possible explanations, and only you know which:

1. **The app's classes are wrong** — the earlier student load put children in the wrong places.
2. **The sheet is older or newer than the app** — children moved, and one of the two is out of date.

---

## 6. How the import would work, once those are settled

Every step goes through the app's own API as the Finance Officer, so nothing bypasses a rule.

**Step 1 — Read and check.** I print what I found: 232 rows, totals per class, and every row I
could not place. **Nothing is written.** You compare it to your sheet and say go.

**Step 2 — Agree the 76 uncertain children.** I give you a list: your row on the left, my best
guesses on the right, and you pick. One pass, and it is done for good.

**Step 3 — Set each child's fee.** 232 per-student fees, straight from the Fee column.

**Step 4 — Bill September.** One click, the normal way. The preview runs first and I show you
the total before anything is created. It must come to **$17,453**.

**Step 5 — Record what was paid.** One payment per child who paid. Total must come to
**$15,521**.

**Step 6 — Prove it.** Open Monthly Collection and compare it to your sheet line by line. If
one number differs we stop and find out why, before going near the live site.

### Would every student get exactly his own correct data?

**For 156 of them, yes, automatically.** Their own fee, their own invoice, their own payment,
their own balance, and their parent sees it without you doing anything.

**For 76, only after you confirm who they are.** That is an hour of your time with a list, not
a technical problem, and it is the honest answer rather than a comfortable one.

**And not for anyone until the class counts are sorted out.**

## 7. Other things I noticed

### 7.1 Your DASHBOARD disagrees with your class sheets

In three classes the summary does not match the detail:

| Class | Class sheet says | DASHBOARD says | Difference |
| --- | --- | --- | --- |
| Baby Class | 37 students, 2,350 billed | 36 students, 2,125 billed | 1 child, $225 |
| Top Class | 24 students, 1,910 billed | 24 students, 1,810 billed | $100 |
| C8 | 21 students, 1,258 billed | 20 students, 1,158 billed | 1 child, $100 |

My guess is that children were added to the class sheets after the dashboard was last worked
out, so **the class sheets are the truth**. But I am not going to assume that about money.
Confirm which one is right.

### 7.2 Seven children have no status

Their fee and paid amounts are there, but the Status cell is empty. I can work the status out
from the numbers — paid equals fee means Paid, and so on — but tell me if that is wrong.

### 7.3 Fourteen children have no phone

No phone means no parent account, so those parents cannot sign in and see anything. The child's
record and fees are complete either way. You may want to collect those numbers.

### 7.4 Is September the first month, or is there history?

This is the biggest one. Your file is one month. If families also owe money from **before**
September, that debt is not in this file, and the app will show them as owing only September.

The app fills the **oldest** unpaid month first, which is the rule you chose. So if August is
missing, a payment meant for August lands on September and the arrears will never be right.

---

## 8. What I need from you

In order of how much they block the work.

1. **The classes.** Eleven of thirteen disagree. Which is right, the app or the sheet? If the
   app is wrong, I can move children to the classes your sheet says, but that is your call to
   make, not mine.
2. **The 133 children in the app who are not on your fee sheet.** Have they left, are they not
   paying in September, or is the sheet incomplete?
3. **Do you agree to the per-student fee change?** Nothing can be loaded truthfully without it.
4. **Is September the first month**, or do families owe earlier months too? The app fills the
   oldest month first, so a missing August would swallow a September payment.
5. **Class sheets or DASHBOARD** for Baby Class, Top Class and C8, where the two disagree.
6. **The seven blank statuses** — shall I work them out from the numbers?
7. **When were the payments made?** Your file has amounts but no dates. I suggest one date,
   30 September, marked as brought forward from your records.

---

## 9. Honest note

The import itself is the easy half. The care is in two places.

**The fee model change.** Small in code, but it sits in the middle of money. I would do it with
tests that prove a per-student fee wins over a class fee, and that a child without one still
picks up his class fee exactly as today.

**Matching your children to the app's children.** Names are spelled differently by hand, and
14 have no phone to confirm them by. I will report every uncertain match rather than guess. A
fee attached to the wrong child is worse than a fee not attached at all.

We do all of this on the local copy first, check every number against your sheet, and only then
take the change to the live site.

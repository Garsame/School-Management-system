# Finance: from a student list to a recorded payment

**Written:** 26 September 2026
**For:** KINGS' SCHOOLS, moving from the Excel sheets into the app

You have the students in. This is what comes next, in order, and what each step is for.

---

## The one idea to hold on to

**You never mark a student "paid", "unpaid" or "partially paid".** There is no such button,
and that is on purpose.

The app works it out from two numbers:

```
what he was billed   −   what he has handed over   =   what he still owes
```

- Owes nothing and was billed something  →  **Paid**
- Owes some but has paid some            →  **Part paid**
- Has paid nothing                       →  **Not paid**

So your job is only ever: **set the fee**, **make the bill**, **record the money**. The status
looks after itself and can never disagree with the cash.

---

## The five steps

```
1. Students          ✓ already done — 254 in
2. Academic year     one per school year, marked current
3. Monthly fee       what each class pays per month
4. Bill the month    one click, makes one invoice per student
5. Take payment      at the payments desk, per student
```

Steps 2 and 3 you do **once**. Steps 4 and 5 you do **every month**.

---

## Step 1 — Students ✓

Done. 254 students across 14 classes.

One thing to settle before you go further: **the class lists in the app do not match your
September fee sheet.** Baby Class has 18 in the app and 37 on your sheet; Class 5 has 29 and 13.
Fees are billed by class, so a student in the wrong class gets the wrong bill. Sort this out
first. It is written up in `KINGS_FINANCE_IMPORT.md`.

---

## Step 2 — Academic year

**Who:** Head of school · **Where:** Academic Years · **How often:** once a year

Make the year, for example 2026/2027, and press **Set as current**.

Nothing bills without this. Every invoice belongs to a year, and the app uses the current one
unless you say otherwise.

---

## Step 3 — The monthly fee

**Who:** Finance Officer · **Where:** Fee Structures · **How often:** once, then edit when prices change

This is the step you are stuck on. The invoice page says *"No fee structure for this class"*
for all 13 classes because **you have none yet**. The app will not guess a price.

### Yes, you can do them all at once

That is your question, and the answer is yes:

1. **Fee applies to** → `All campuses by grade`
2. **Grade** → `All 13 grades in this school (same fee)`
3. Academic year, a name, and the monthly items, for example Tuition 80
4. Save

**One click makes 13 fee structures, one per grade.** Every class in the school is then covered
and the invoice page stops complaining.

Use this when every class pays the same. If they do not, read on.

### Three ways to set fees, and when to use each

| Way | How many to set up | Use it when |
| --- | --- | --- |
| **All grades at once** | 1 click → 13 | Every class pays the same |
| **By level / category** | 4 | Nursery, primary, middle and secondary pay different amounts |
| **One class at a time** | 14 | Each class has its own price |

You can mix them. The app takes **the most specific one it finds**:

```
one class   beats   a level   beats   a grade
```

So the tidy way for your school is usually: set one fee for everybody, then override the few
classes that are different. You do not have to undo the first one.

Your levels are already set up: **Early Childhood**, **Primary School**, **Middle School**,
**Secondary School**.

> **Worth tidying:** you have both **"Primary"** and **"Primary School"** as levels. One is
> probably left over. Two levels that sound the same will cause a wrong fee sooner or later.

### What I fixed today

Your dropdown offered **Grade 1 to Grade 12**. It was a fixed list in the code, not your
school's grades.

**Baby Class and Top Class are grade 0.** They were not in the list, so they could never be
given a fee by grade — and those are your two largest classes, **57 students between them**.
"All grades 1–12" quietly skipped them too.

Both now read the grades your school actually teaches. The list shows **13 grades, 0 to 12**,
and names the classes in each so there is no guessing:

```
Grade 0 — Baby Class, Top Class
Grade 1 — Class 1
Grade 8 — Class 8
Grade 9 — Form 1
```

---

## Step 4 — Bill the month

**Who:** Finance Officer · **Where:** Invoices → Generate · **How often:** once a month

1. Pick the month, for example November 2026
2. Set the due day, for example the 10th
3. **Press Preview first.** It shows how many students will be billed and lists any class it
   cannot bill, with the reason. Nothing is created.
4. Check the number against what you expect
5. Press Generate

You get **one invoice per student, per month**. Each one says what that student owes for that
month, nothing else.

Two rules the app will not let you break:

- **Nobody is billed twice for the same month.** Press Generate again by accident and it tells
  you they were already billed and creates nothing.
- **A class with no fee is skipped and named**, rather than billed at zero.

It is never automatic. Billing only happens when you press the button.

---

## Step 5 — Record the payment

**Who:** Finance Officer · **Where:** Payments → New payment · **How often:** whenever money comes in

1. Find the student by name or ID
2. You see every month he owes, **oldest first**
3. Enter what he actually handed over
4. Pick how he paid: cash, ZAAD, EVC, bank
5. Save

The money fills the **oldest unpaid month first**. If he owes September and October and hands
over one month's worth, September is cleared and October stays open. You do not choose — that
is deliberate, so arrears cannot be skipped.

And then, without you doing anything:

- His status becomes Paid, Part paid or Not paid
- His balance updates
- **His parent sees it immediately**, with the receipt
- He appears or disappears from the Outstanding list
- The Monthly Collection totals move

### If you take the wrong payment

**Reverse it. Never delete it.** The app keeps both the payment and the reversal, so the
history always explains itself. Deleting money is the one thing it will not do.

---

## Where to look afterwards

| Question | Page |
| --- | --- |
| Who has not paid this month? | Outstanding |
| What did we collect in November? | Monthly Collection, with an Excel export |
| What does this one student owe? | The student's page |
| What does my child owe? | The parent sees it on their own login |

**Monthly Collection is your old DASHBOARD sheet**, worked out from real payments instead of
typed in by hand.

---

## Doing September, since it has already happened

Your sheet is real money that came in before the app existed. Two things make it different
from a normal month.

**Each of your students pays a different amount.** In C1 alone there are eight different
prices. The app currently charges a whole class one price. That has to change first — a fee on
the student, above the class fee. It is a small change and it is described in
`KINGS_FINANCE_IMPORT.md`.

**The payments have no dates in your sheet.** You will need to pick one, for example
30 September, and treat them as brought forward from your records.

**Suggested order:**

1. Fix the class lists so they match your sheet
2. Add the per-student fee
3. Set each student's own fee from the Fee column
4. Bill September — the total must come to **$17,453**
5. Record the payments — the total must come to **$15,521**
6. Open Monthly Collection and compare it with your sheet, line by line

Then October and November are ordinary months: press Generate, take payments, done.

---

## A short answer to "where do I start"

1. **Fix the class lists.** Nothing downstream is right until they are.
2. **Make the academic year current.**
3. **Set one fee for all 13 grades**, then override the classes that differ.
4. **Preview, then bill a month.**
5. **Take a payment** and watch the status change by itself.

Do steps 2 to 5 for **one class** first, with real numbers, and check it against your sheet.
When one class is right, the other thirteen are the same work.

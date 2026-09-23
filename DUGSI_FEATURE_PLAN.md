# Dugsi Teacher — feature plan

**Written:** 23 September 2026
**Status:** Plan only. No code written. Waiting for your go-ahead.

---

## 1. What this is

A new kind of teacher: the **Dugsi Teacher**, or **Macallin Dugsi**.

He runs the Quran dugsi. He does not teach a normal class. He has his own list of children,
he takes their register, and he writes down how far each child has reached in the Quran.

Not every child in the school goes to the dugsi. So he keeps his own list, and only the
children on that list get dugsi records.

The parent then sees everything about their child in one place: the school register and the
dugsi register, and how far the child has reached in his memorisation.

---

## 2. What you decided

These are settled. I will not re-open them.

| Question | Your answer |
| --- | --- |
| Do dugsi absences change the school attendance number? | **No.** Two separate numbers: "School 95% · Dugsi 88%". |
| Where is dugsi attendance stored? | **The same table as school attendance**, with a marker saying which is which. Read from one place. |
| Can one person be a normal teacher and a dugsi teacher? | **Yes.** Dugsi is a set of features a school can tick onto either role. |
| How many students does a dugsi teacher have? | **One list each.** No separate halaqas within one teacher. |
| Which children can he pick? | **Only from the classes the admin gives him.** |
| Does he still tick who is in the dugsi? | **Yes.** He sees every child in his classes and ticks the ones who actually come. |
| Can a school have several dugsi teachers? | **Yes.** Each has his own children. **A child belongs to one dugsi teacher only.** |
| What does he record besides attendance? | **Quran progress:** juz and surah, a record each day, and whether the child is memorising or still learning to read. |
| Is dugsi charged separately? | **No.** It is covered by the normal monthly fee. Billing does not change at all. |
| Who else sees the dugsi? | **The head of school** and **the child himself** on his portal. Not the admissions officer. |

---

## 3. What each person sees and does

### The Dugsi Teacher (Macallin Dugsi)

He signs in and sees four things.

**My students.** The children on his dugsi list. Name, class, and whether each is memorising
or still learning to read.

**Add students.** He opens this and sees every child in the classes the admin gave him — say
all 81 children in Grades 1 to 3. He ticks the 40 who come to the dugsi. He can untick a
child later if they stop coming.

If he ticks a child who is already on another dugsi teacher's list, the system stops him and
says who has that child. A child belongs to one dugsi only.

**Today's register.** He opens the register for today, marks each child present, absent, late
or excused, and saves it. Same buttons as the normal school register, so nothing new to learn.

**Quran progress.** For each child he writes what they reached that day: the juz and the
surah. He picks from a list, so he cannot type a juz that does not exist. The newest entry is
where the child is now. The older entries stay as a history.

He does **not** see the child's school marks, school attendance, or fees.

### The head of school (Super Admin)

**Gives the dugsi teacher his classes.** For example: "Macallin Ahmed takes Grades 1, 2 and 3."
Until this is done the dugsi teacher has nobody to pick from.

**Sees the whole dugsi.** How many children are in each dugsi, the dugsi attendance rate, and
how far children have reached. Next to the school numbers, never mixed into them.

### The parent

On the child's page, the parent sees:

- **School attendance** — as today.
- **Dugsi attendance** — only if the child is in a dugsi. Shown as its own figure, clearly
  labelled, never added to the school one.
- **Quran progress** — where the child has reached now, and the history underneath.

If the child does not attend the dugsi, the parent sees nothing extra. No empty section.

### The student

The same as the parent, but only about himself, on his own portal.

### Everyone else

The finance officer, the HR manager and the admissions officer see no change. The dugsi
teacher does get a salary and appears in payroll like any other member of staff — that works
already and needs nothing new.

---

## 4. How it is stored

You asked for one table, not two. That is what this does.

### The attendance table stays one table

Today a register belongs to a **class**. A dugsi register does not — it belongs to a
**dugsi teacher**. So we add one field to the existing register:

- `sessionType` — either `SCHOOL` or `DUGSI`. Everything that exists today becomes `SCHOOL`.

The child's marks (present, absent, late, excused) are stored exactly as they are now, in the
same table. Nothing moves. Nothing is copied.

To show "School 95% · Dugsi 88%", we count the same table twice, filtering on that one field.

### Three new small tables

**1. Which classes the teacher was given**
The admin says "Macallin Ahmed takes Grades 1 to 3". One row per class.

**2. Who is in the dugsi**
One row per child: which dugsi teacher, which child, which year, whether he is memorising or
still learning to read, and whether he is still attending.

This is what stops a child being in two dugsis: the database itself refuses a second active
row for the same child in the same year.

**3. Quran progress**
One row per child per day: the date, the juz, the surah, and the stage. The newest row is
where the child is now. The older rows are the history.

### The tricky part, so you know about it

The attendance table currently has a rule: *one register per class, per day, per period.* It
is enforced by the database, which is good — it is why a register cannot be taken twice.

A dugsi register has no class, so that rule does not fit it. We replace it with two rules:

- School registers: one per class, per day, per period. **Unchanged.**
- Dugsi registers: one per dugsi teacher, per day, per period.

This is the only change to something that already works, and it is the part I will test
hardest.

---

## 5. What the school turns on

Roles are a fixed list that schools rename and tick features on. So:

- We add **Dugsi Teacher** to that fixed list. A school renames it to "Macallin Dugsi" if it
  wants, or leaves it off entirely if it has no dugsi.
- We add new features to the feature list. They can be ticked onto the Dugsi Teacher role, or
  onto the normal Teacher role for a person who does both jobs.

New features, in plain words:

| Feature | What it lets you do |
| --- | --- |
| See my dugsi students | Open the list of children in my dugsi |
| Change my dugsi students | Tick children in, untick them out |
| Take dugsi attendance | Open the register, mark it, close it |
| Record Quran progress | Write what a child reached today |
| Give out dugsi classes | Tell the system which classes a dugsi teacher may pick from |
| See the whole dugsi | Head of school view across every dugsi teacher |
| See my child's dugsi | For the parent |
| See my dugsi | For the student |

A school with no dugsi ticks none of these and sees no dugsi menus anywhere. The feature is
invisible until it is turned on.

---

## 6. Where the work lands

I checked. **There is no dugsi or Quran code anywhere in the project yet**, so nothing has to
be untangled first.

Attendance is read in **eight** places on the server. Each one has to learn that a register
now has a type, so the school numbers do not quietly start counting dugsi marks:

```
attendanceController      the head of school view, and the rates
parentController          what the parent sees
studentPortalController   what the child sees
teacherController         the normal teacher's register
dashboardController       the dashboard counts
tenantController          school reports
timetableController       timetable checks
platformController        platform-wide totals
```

This is the main risk in the whole job. If one of those eight is missed, the school
attendance rate silently becomes wrong. I will go through them one at a time and write a test
that fails if a dugsi mark ever leaks into a school number.

On the screens side, the pattern is already set by the rest of the app: a page, a line in the
route list, a line in the menu list, and the menu appears only for people who have the
feature ticked.

---

## 7. The work, in stages

Each stage works on its own and can be checked before the next one starts.

**Stage 1 — The role and the features.**
Add Dugsi Teacher to the role list. Add the new features. Nothing visible yet, but the school
can already see the role on the Roles & Features screen and rename it.

**Stage 2 — Classes and the student list.**
The admin gives a dugsi teacher his classes. The teacher sees those children and ticks who is
in his dugsi. The rule that a child belongs to one dugsi only is enforced here.

**Stage 3 — The register.**
The `sessionType` marker, the index change, and the dugsi register itself. Then the eight
read points, one at a time, each with a test. **This is the careful stage.**

**Stage 4 — Quran progress.**
The daily record, the juz and surah lists, the memorising or reading stage, and the history.

**Stage 5 — The parent, the student and the head of school.**
Dugsi attendance and progress on the parent page and the student portal. The head of school's
dugsi view.

**Stage 6 — Put it in the demo school.**
Add a Macallin Dugsi to Nuur Al-Ilm Academy with real children, a few weeks of registers and
progress, so you can open the screens and see it working rather than take my word for it.

---

## 8. Rules that must not break

Straight from the invariants in AGENTS.md, plus the new ones this feature needs.

1. A school never sees another school's data. Every new table carries `tenantId`.
2. **A dugsi mark never changes a school attendance number.** New rule, and the one I will
   test hardest.
3. **A child is in one dugsi at a time.** Enforced by the database, not by a screen.
4. A dugsi teacher only ever sees children from the classes he was given.
5. Nothing valid is deleted. A child who leaves the dugsi is marked as left, and his old
   register marks and progress stay.
6. A register cannot be taken twice for the same day. Still true for school, now also for dugsi.
7. A school with the dugsi features switched off sees no dugsi anywhere, and its numbers are
   exactly what they are today.
8. Every change is written to the audit log, as everything else is.

---

## 9. What I am assuming

If any of these is wrong, tell me and I will change the plan. None of them is settled.

1. **The register runs on school days.** The teacher opens it himself when the dugsi meets. He
   is not forced to take it every day, and nothing complains if a day is missed.
2. **One register a day**, with an optional label like Morning or Evening if the dugsi meets
   twice.
3. **The teacher can remove a child himself** when they stop coming. He does not need the
   admin for it.
4. **Progress is written for one child at a time**, not the whole list at once. He opens a
   child and writes where they reached.
5. **No mark for how well the child recited** in this version. You chose stage only. Easy to
   add later if you want it.
6. **A child who leaves the school** is taken off the dugsi list automatically, the same way
   their enrolment is withdrawn today.
7. **A child who moves class** stays in the dugsi, even if his new class was not given to that
   teacher. Removing him for a class change would be surprising.
8. **The dugsi teacher does not see school attendance, marks or fees.** Only his own dugsi.

---

## 10. What I still need from you

Small things, but they affect what I build.

1. **If the dugsi teacher is away, can the head of school take the register for him?** My
   guess is yes, since the head of school can already take normal attendance.
2. **Does the dugsi follow the academic year?** That is, does the list empty at the end of the
   year and get rebuilt, like class enrolment does?
3. **Should a child be allowed in the dugsi if he is not in one of the teacher's classes?**
   For example a Grade 5 child who wants to join a Grade 1 to 3 dugsi. My guess is no, but say
   if it happens in practice.

---

## 11. Honest note on size

This is bigger than the attendance oversight work, mostly because of the eight read points
and because Quran progress is a new thing with its own screens.

The riskiest part is not the new code. It is the change to the attendance table that already
holds real data and real numbers. I will do that stage slowly and prove with tests that the
school figures do not move.

**Nothing has been built. Say go and I will start with Stage 1.**

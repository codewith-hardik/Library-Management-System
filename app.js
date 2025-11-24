/*
  app.js
  - Implements a tiny in-memory library inventory using a hash table
    with linked-list chaining (educational/demo purposes).
  - UI manipulation and event wiring live in the lower part of this file.
  - Nothing here persists to disk; refreshing the page resets state
    unless you seed/demo data with `seedData()`.
*/

// A node used by the LinkedList implementation below
class LinkedListNode {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

class LinkedList {
  constructor() {
    this.head = null;
  }

  append(value) {
    const node = new LinkedListNode(value);
    if (!this.head) {
      this.head = node;
      return node;
    }
    let current = this.head;
    while (current.next) {
      current = current.next;
    }
    current.next = node;
    return node;
  }

  find(predicate) {
    let current = this.head;
    while (current) {
      if (predicate(current.value)) return current;
      current = current.next;
    }
    return null;
  }

  remove(predicate) {
    if (!this.head) return null;
    if (predicate(this.head.value)) {
      const removed = this.head;
      this.head = this.head.next;
      return removed.value;
    }
    let current = this.head;
    while (current.next) {
      if (predicate(current.next.value)) {
        const removed = current.next;
        current.next = current.next.next;
        return removed.value;
      }
      current = current.next;
    }
    return null;
  }

  forEach(callback) {
    let current = this.head;
    while (current) {
      callback(current.value);
      current = current.next;
    }
  }

  toArray() {
    const values = [];
    this.forEach((value) => values.push(value));
    return values;
  }
}

class HashTable {
  constructor(size = 97) {
    this.size = size;
    this.buckets = Array.from({ length: size }, () => new LinkedList());
  }

  _hash(key) {
    const PRIME = 31;
    let total = 0;
    const stringKey = String(key);
    for (let i = 0; i < stringKey.length; i++) {
      const char = stringKey.charCodeAt(i);
      total = (total * PRIME + char) % this.size;
    }
    return Math.abs(total);
  }

  set(key, value) {
    const index = this._hash(key);
    const bucket = this.buckets[index];
    const existingNode = bucket.find((entry) => entry.key === key);
    if (existingNode) {
      existingNode.value.value = value;
    } else {
      bucket.append({ key, value });
    }
  }

  get(key) {
    const index = this._hash(key);
    const bucket = this.buckets[index];
    const node = bucket.find((item) => item.key === key);
    return node ? node.value.value : undefined;
  }

  delete(key) {
    const index = this._hash(key);
    const bucket = this.buckets[index];
    const removed = bucket.remove((entry) => entry.key === key);
    return removed ? removed.value : undefined;
  }

  values() {
    const allValues = [];
    this.buckets.forEach((bucket) =>
      bucket.forEach((entry) => allValues.push(entry.value))
    );
    return allValues;
  }

  keys() {
    const allKeys = [];
    this.buckets.forEach((bucket) =>
      bucket.forEach((entry) => allKeys.push(entry.key))
    );
    return allKeys;
  }

  clear() {
    this.buckets = Array.from({ length: this.size }, () => new LinkedList());
  }
}

// ---------- Library Logic ----------


const inventory = new HashTable(193);
const MAX_VISIBLE_BOOKS = 12;

// Cache DOM references lazily once the document is ready.
const dom = {};

function cacheDom() {
  dom.availableTable = document.getElementById("availableBooks");
  dom.borrowedTable = document.getElementById("borrowedBooks");
  dom.statTotal = document.getElementById("statTotal");
  dom.statAvailable = document.getElementById("statAvailable");
  dom.statBorrowed = document.getElementById("statBorrowed");
  dom.statStudents = document.getElementById("statStudents");
  dom.bookSelect = document.getElementById("borrowBookSelect");
  dom.addBookForm = document.getElementById("addBookForm");
  dom.borrowForm = document.getElementById("borrowForm");
  dom.resetButton = document.getElementById("resetDemo");
  dom.returnDateInput = document.getElementById("returnDate");
  dom.searchBox = document.getElementById("searchBox");
  dom.sortSelect = document.getElementById("sortOption");
}

function ensureDomReady() {
  return (
    dom.availableTable &&
    dom.borrowedTable &&
    dom.statTotal &&
    dom.statAvailable &&
    dom.statBorrowed &&
    dom.statStudents &&
    dom.bookSelect &&
    dom.addBookForm &&
    dom.borrowForm &&
    dom.resetButton &&
    dom.returnDateInput &&
    dom.sortSelect
  );
}

// Creates a reasonably unique ID for a book entry
const createId = () =>
  `BK-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;

// Add a new book object into the hash table
function addBook({ title, author, copies }) {
  const id = createId();
  inventory.set(id, {
    id,
    title,
    author,
    totalCopies: Number(copies),
    borrowers: []
  });
  refreshUI(); // re-render UI after mutation
}

// Borrow a copy: pushes borrower info onto the book.borrowers array
function borrowBook(bookId, studentName, returnDate) {
  const book = inventory.get(bookId);
  if (!book) return alert("Book not found in the inventory.");

  const available = book.totalCopies - book.borrowers.length;
  if (available <= 0) {
    alert("No copies available for this title right now.");
    return;
  }

  book.borrowers.push({
    student: studentName.trim(),
    dueDate: returnDate,
    borrowedAt: new Date().toISOString()
  });

  inventory.set(bookId, book); // update stored book entry
  refreshUI();
}

// Return a book: removes borrower entry by student name
function returnBook(bookId, studentName) {
  const book = inventory.get(bookId);
  if (!book) return;

  book.borrowers = book.borrowers.filter(
    (borrow) => borrow.student !== studentName
  );
  inventory.set(bookId, book);
  refreshUI();
}

// Helper: get current search term from UI (lowercased)
function getSearchTerm() {
  return dom.searchBox ? dom.searchBox.value.trim().toLowerCase() : "";
}

// Flexible search matcher: supports multi-word partial matches and ignores spaces
function matchesSearch(text, term) {
  if (!term) return true;
  const base = String(text).toLowerCase();
  const compact = base.replace(/\s+/g, "");
  const words = term.split(/\s+/).filter(Boolean);
  return words.every((w) => {
    const wCompact = w.replace(/\s+/g, "");
    return base.includes(w) || compact.includes(wCompact);
  });
}

function sortBooks(books) {
  const option = dom.sortSelect ? dom.sortSelect.value : "title-asc";
  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  const sorted = [...books];
  sorted.sort((a, b) => {
    switch (option) {
      case "title-desc":
        return collator.compare(b.title, a.title);
      case "available-desc": {
        const aAvail = a.totalCopies - a.borrowers.length;
        const bAvail = b.totalCopies - b.borrowers.length;
        return bAvail - aAvail || collator.compare(a.title, b.title);
      }
      case "available-asc": {
        const aAvail = a.totalCopies - a.borrowers.length;
        const bAvail = b.totalCopies - b.borrowers.length;
        return aAvail - bAvail || collator.compare(a.title, b.title);
      }
      case "title-asc":
      default:
        return collator.compare(a.title, b.title);
    }
  });
  return sorted;
}

// Flatten the book.borrowers arrays into rows for the borrowed table
function getAllBorrowers() {
  const rows = [];
  inventory.values().forEach((book) => {
    book.borrowers.forEach((borrow) =>
      rows.push({
        bookId: book.id,
        title: book.title,
        student: borrow.student,
        dueDate: borrow.dueDate
      })
    );
  });
  return rows;
}

// Compute high-level stats used by the dashboard tiles
function calculateStats() {
  const books = inventory.values();
  const totalCopies = books.reduce((sum, b) => sum + b.totalCopies, 0);
  const borrowed = books.reduce((sum, b) => sum + b.borrowers.length, 0);
  const available = totalCopies - borrowed;
  const studentSet = new Set();
  books.forEach((book) => {
    book.borrowers.forEach((borrow) => studentSet.add(borrow.student));
  });

  return {
    totalCopies,
    borrowed,
    available,
    activeStudents: studentSet.size
  };
}

// Render stats into the small summary tiles
function updateStats() {
  if (!dom.statTotal || !dom.statBorrowed || !dom.statAvailable || !dom.statStudents) {
    return;
  }
  const { totalCopies, borrowed, available, activeStudents } = calculateStats();
  dom.statTotal.textContent = totalCopies;
  dom.statBorrowed.textContent = borrowed;
  dom.statAvailable.textContent = available;
  dom.statStudents.textContent = activeStudents;
}

// Renders inventory into the left table. It uses `getSearchTerm()` to filter results.
function updateAvailableTable() {
  if (!dom.availableTable) return;
  const term = getSearchTerm();
  const allBooks = sortBooks(inventory.values());
  const rows = term
    ? allBooks.filter((book) =>
        matchesSearch(book.title, term) ||
        matchesSearch(book.author, term)
      )
    : allBooks;

  // Various user-friendly empty states depending on whether inventory exists and search state
  if (!allBooks.length) {
    dom.availableTable.innerHTML = `
      <tr class="text-center text-sm text-slate-500">
        <td colspan="5" data-label="Info" class="py-6">No books yet. Use the form above to add your first title.</td>
      </tr>
    `;
    return;
  }

  if (term && !rows.length) {
    dom.availableTable.innerHTML = `
      <tr class="text-center text-sm text-slate-500">
        <td colspan="5" data-label="Info" class="py-6">No books match your search. Try a different title or author.</td>
      </tr>
    `;
    return;
  }

  const limitedRows = term ? rows : rows.slice(0, MAX_VISIBLE_BOOKS);
  const moreHidden = !term && rows.length > limitedRows.length;

  const tableRows = limitedRows
    .map((book) => {
      const available = book.totalCopies - book.borrowers.length;
      const borrowers =
        book.borrowers.length === 0
          ? "<span class='tag success'>All copies free</span>"
          : book.borrowers
              .map(
                (borrow) =>
                  `<span class="tag">${borrow.student.split(" ")[0]}</span>`
              )
              .join(" ");
      return `
        <tr class="text-slate-700">
          <td data-label="Title" class="py-3 pr-6 font-semibold text-slate-900">${book.title}</td>
          <td data-label="Author" class="py-3 pr-6">${book.author}</td>
          <td data-label="Total Copies" class="py-3 pr-6">${book.totalCopies}</td>
          <td data-label="Available" class="py-3 pr-6 ${available ? "text-emerald-600" : "text-rose-600"}">${available}</td>
          <td data-label="Borrowed By" class="py-3 pr-6 space-x-1 space-y-1">${borrowers}</td>
        </tr>
      `;
    })
    .join("");

  const infoRow = moreHidden
    ? `
      <tr class="text-center text-xs uppercase tracking-wide text-slate-400">
        <td colspan="5" data-label="Info" class="py-4">
          Showing the first ${MAX_VISIBLE_BOOKS} titles sorted by your selection. Use search to view specific books.
        </td>
      </tr>
    `
    : "";

  dom.availableTable.innerHTML = tableRows + infoRow;
}

// Small utility to format ISO date strings into a readable form
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

// Returns number of days left until `dateString` (negative if overdue)
function daysLeft(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateString);
  const diffMs = due - today;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// Render the borrowed table. Each row includes a "Mark Returned" button
function updateBorrowedTable() {
  if (!dom.borrowedTable) return;
  const term = getSearchTerm();
  const allRows = getAllBorrowers();
  const rows = allRows.filter((row) => {
    if (!term) return true;
    return (
      matchesSearch(row.title, term) ||
      matchesSearch(row.student, term)
    );
  });

  if (!allRows.length) {
    dom.borrowedTable.innerHTML = `
      <tr class="text-center text-sm text-slate-500">
        <td colspan="5" data-label="Info" class="py-6">No active borrowings. Students appear after they check out a book.</td>
      </tr>
    `;
    return;
  }

  if (!rows.length) {
    dom.borrowedTable.innerHTML = `
      <tr class="text-center text-sm text-slate-500">
        <td colspan="5" data-label="Info" class="py-6">No borrowed books match your search.</td>
      </tr>
    `;
    return;
  }

  dom.borrowedTable.innerHTML = rows
    .map((row) => {
      const left = daysLeft(row.dueDate);
      const statusClass = left < 0 ? "danger" : left <= 2 ? "danger" : "success";
      const statusText =
        left < 0 ? `${Math.abs(left)} days overdue` : `${left} days left`;
      return `
        <tr>
          <td data-label="Student" class="py-3 pr-6 font-semibold text-slate-900">${row.student}</td>
          <td data-label="Book" class="py-3 pr-6">${row.title}</td>
          <td data-label="Due Date" class="py-3 pr-6">${formatDate(row.dueDate)}</td>
          <td data-label="Status" class="py-3 pr-6"><span class="tag ${statusClass}">${statusText}</span></td>
          <td data-label="Action" class="py-3 pr-6">
            <button class="btn-ghost" data-book="${row.bookId}" data-student="${row.student}">
              Mark Returned
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

// Populate the borrow select with available titles (disables titles with 0 availability)
function updateBorrowSelect() {
  if (!dom.bookSelect) return;
  const books = inventory.values();
  if (!books.length) {
    dom.bookSelect.innerHTML =
      '<option value="">Add a book first</option>';
    dom.bookSelect.disabled = true;
    return;
  }

  const options = books
    .map((book) => {
      const available = book.totalCopies - book.borrowers.length;
      const disabled = available === 0 ? "disabled" : "";
      return `<option value="${book.id}" ${disabled}>
        ${book.title} (${available} available)
      </option>`;
    })
    .join("");

  dom.bookSelect.innerHTML = options;
  dom.bookSelect.disabled = false;
}

// Re-render everything (stats + both tables + select)
function refreshUI() {
  if (!ensureDomReady()) return;
  updateStats();
  updateAvailableTable();
  updateBorrowedTable();
  updateBorrowSelect();
}

// Seed the inventory with many demo titles and a few borrowed entries
function seedData() {
  inventory.clear();
  const baseTitles = [
    "Data Structures in C",
    "Data Structures in Java",
    "Introduction to Algorithms",
    "Operating System Concepts",
    "Database System Concepts",
    "Computer Networks",
    "Clean Code",
    "Design Patterns",
    "Discrete Mathematics",
    "Artificial Intelligence Basics",
    "Machine Learning Essentials",
    "Computer Architecture",
    "Theory of Computation",
    "Compiler Design",
    "Probability and Statistics",
    "Web Technologies",
    "Object Oriented Programming",
    "Python for Data Science",
    "Linear Algebra",
    "Numerical Methods"
  ];

  const authors = [
    "Reema Thareja",
    "Robert Lafore",
    "Cormen et al.",
    "Silberschatz et al.",
    "Kurose & Ross",
    "Robert C. Martin",
    "Erich Gamma",
    "Rosen et al.",
    "Stuart Russell",
    "Christopher Bishop",
    "Hennessy & Patterson",
    "Hopcroft & Ullman",
    "Aho et al.",
    "Jay L. Devore",
    "Narasimha Karumanchi",
    "Bjarne Stroustrup",
    "Guido van Rossum",
    "Gilbert Strang",
    "William H. Press",
    "Ian Goodfellow"
  ];

  for (let i = 0; i < 68; i++) {
    const titleBase = baseTitles[i % baseTitles.length];
    const title = `${titleBase} Vol-${Math.floor(i / baseTitles.length) + 1}`;
    const author = authors[i % authors.length];
    const copies = 1 + Math.floor(Math.random() * 4);
    addBook({ title, author, copies });
  }

  const books = inventory.values();
  if (books[0]) borrowBook(books[0].id, "Riya Patel", buildDate(5));
  if (books[1]) borrowBook(books[1].id, "Manoj Singh", buildDate(2));
  if (books[2]) borrowBook(books[2].id, "Ishaan Verma", buildDate(10));
  if (books[3]) borrowBook(books[3].id, "Ananya Gupta", buildDate(7));
  if (books[4]) borrowBook(books[4].id, "Karan Mehta", buildDate(3));
}

// Build an ISO date string offset by `offset` days from today
function buildDate(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}

// ---------- Event listeners ----------

function attachEventListeners() {
  if (dom.addBookForm) {
    dom.addBookForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = document.getElementById("bookTitle").value.trim();
      const author = document.getElementById("bookAuthor").value.trim();
      const copies = Number(document.getElementById("bookCopies").value);

      if (!title || !author || copies < 1) {
        alert("Please fill out all fields with valid data.");
        return;
      }

      addBook({ title, author, copies });
      dom.addBookForm.reset();
    });
  }

  if (dom.borrowForm) {
    dom.borrowForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const bookId = dom.bookSelect.value;
      const studentName = document.getElementById("studentName").value.trim();
      const returnDate = document.getElementById("returnDate").value;

      if (!bookId || !studentName || !returnDate) {
        alert("Please complete every field.");
        return;
      }

      borrowBook(bookId, studentName, returnDate);
      dom.borrowForm.reset();
      updateBorrowSelect();
    });
  }

  if (dom.borrowedTable) {
    dom.borrowedTable.addEventListener("click", (event) => {
      if (event.target.matches("button[data-book]")) {
        const { book, student } = event.target.dataset;
        returnBook(book, student);
      }
    });
  }

  if (dom.resetButton) {
    dom.resetButton.addEventListener("click", () => {
      if (confirm("Reset demo data? This will clear the current inventory.")) {
        seedData();
      }
    });
  }

  if (dom.searchBox) {
    dom.searchBox.addEventListener("input", () => {
      updateAvailableTable();
      updateBorrowedTable();
    });
  }

  if (dom.sortSelect) {
    dom.sortSelect.addEventListener("change", () => {
      updateAvailableTable();
    });
  }
}

// Make sure the return-date input cannot select a past date
function initReturnDate() {
  if (!dom.returnDateInput) return;
  const today = new Date().toISOString().split("T")[0];
  dom.returnDateInput.min = today;
}

// ---------- Initialize ----------

function initApp() {
  cacheDom();
  if (!ensureDomReady()) {
    console.error("Library DS Tracker: required DOM nodes missing; UI not initialized.");
    return;
  }

  attachEventListeners();
  initReturnDate();
  seedData();
  refreshUI();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}


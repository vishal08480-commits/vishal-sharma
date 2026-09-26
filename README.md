# Task Management System — Backend (MySQL) + Login + Connected Frontend

Node.js + Express API, JWT login, **MySQL** database, and a connected HTML
board — all served from one server, one command.

## What's inside

```
task-management-system/
├── server.js            → starts everything, checks DB connection first
├── db/pool.js             → MySQL connection pool
├── db/schema.sql            → table definitions (users, tasks, done_tasks)
├── db/migrate.js             → runs schema.sql against your database
├── routes/auth.js             → register / login
├── routes/tasks.js             → task CRUD + workflow-checked status changes
├── middleware/auth.js           → checks the login token on every task request
├── utils/workflow.js             → the allowed status transitions
├── public/index.html              → the frontend (login screen + kanban board)
├── .env.example
└── package.json
```

## Step 1 — Install Node.js (one-time)

1. Go to **nodejs.org**, download the **LTS** installer, run it (defaults are fine)
2. Confirm:
   ```
   node -v
   npm -v
   ```

## Step 2 — Install MySQL (one-time)

**Windows:**
1. Go to **dev.mysql.com/downloads/installer/**, download "MySQL Installer for Windows"
2. Run it, choose the **"Developer Default"** setup type
3. When it asks you to set a **root password** — set one and remember it
4. Finish the installer (it also installs **MySQL Workbench**, a GUI you can use later if you want)

**Mac (Homebrew):**
```
brew install mysql
brew services start mysql
mysql_secure_installation
```
(the last command lets you set a root password)

Confirm it's running:
```
mysql --version
```

## Step 3 — Create the database

```
mysql -u root -p
```
Enter your root password. Once you see `mysql>`, run:
```sql
CREATE DATABASE taskmanager;
EXIT;
```
An empty database called `taskmanager` now exists — the tables come next, from the app itself.

## Step 4 — Get the project onto your PC

Unzip `task-management-system.zip`, then in a terminal:
```
cd path/to/task-management-system
```

## Step 5 — Configure `.env`

```
cp .env.example .env
```
(Windows PowerShell: `copy .env.example .env`)

Open `.env` and fill in:
```
JWT_SECRET=any-random-long-string
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=<the password you set in Step 2>
DB_NAME=taskmanager
```

## Step 6 — Install dependencies

```
npm install
```

## Step 7 — Create the tables

```
npm run db:migrate
```
You should see: `✔ Database schema applied (users, tasks, done_tasks).`
(Safe to re-run any time — it only creates tables that don't already exist.)

## Step 8 — Run the app

```
npm start
```
You should see:
```
✔ Connected to MySQL
Server running at http://localhost:4000
```

## Step 9 — Use it

Open **http://localhost:4000** → Register → create tasks → move them through the workflow.

## Where "done" tasks live

- Active tasks (`todo`, `in_progress`, `in_review`, `blocked`) live in the **`tasks`** table
- The moment a task becomes `done`, its row is moved — inside a database transaction — into the **`done_tasks`** table, and removed from `tasks`
- The **Done** column on the board is always empty (it queries `tasks`, which never contains a done row)
- The **Done count badge** is a `COUNT(*)` on `done_tasks` — always accurate
- Nothing is ever deleted by completing a task — see it directly: `GET /api/tasks/archive/done`
- Reopening a done task (`done → in_progress`) moves the row back from `done_tasks` into `tasks`

## The workflow rules (unchanged)

```
todo        → in_progress, blocked
in_progress → in_review, blocked, todo
in_review   → done, in_progress, blocked
blocked     → todo, in_progress
done        → in_progress   (re-open)
```
Enforced in `utils/workflow.js`, checked on the server for every status change — never bypassable from the browser.

## API reference

| Method | Path                     | Auth? | Purpose                          |
|--------|---------------------------|-------|------------------------------------|
| POST   | /api/auth/register          | No    | create account, returns token     |
| POST   | /api/auth/login              | No    | log in, returns token             |
| GET    | /api/tasks                   | Yes   | list your active tasks (?status ?priority ?q) |
| GET    | /api/tasks/counts/summary       | Yes   | counts per column, straight from SQL |
| GET    | /api/tasks/archive/done           | Yes   | raw data of completed tasks       |
| POST   | /api/tasks                    | Yes   | create (always starts "todo")    |
| PUT    | /api/tasks/:id                  | Yes   | edit title/description/priority/dueDate |
| PATCH  | /api/tasks/:id/status             | Yes   | move status (workflow-checked)   |
| DELETE | /api/tasks/:id                   | Yes   | delete                            |

## Inspecting the data directly (optional)

```
mysql -u root -p taskmanager
SELECT * FROM tasks;
SELECT * FROM done_tasks;
EXIT;
```
Or open **MySQL Workbench** (installed alongside MySQL on Windows) and browse the `taskmanager` schema visually.

## If something goes wrong

- **`npm run db:migrate` fails with "Access denied for user 'root'"** → `DB_PASSWORD` in `.env` doesn't match your MySQL root password
- **`ECONNREFUSED` on startup** → MySQL service isn't running. Windows: check "MySQL80" in the Services app. Mac (Homebrew): `brew services start mysql`
- **`Unknown database 'taskmanager'`** → redo Step 3
- **Port 4000 already in use** → change `PORT` in `.env`

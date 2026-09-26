-- Users
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Active board: todo / in_progress / in_review / blocked
CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(80) NOT NULL,
  description TEXT,
  priority ENUM('low', 'med', 'high') NOT NULL DEFAULT 'med',
  due_date VARCHAR(10),
  status ENUM('todo', 'in_progress', 'in_review', 'blocked') NOT NULL DEFAULT 'todo',
  history JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_tasks_user (user_id)
) ENGINE=InnoDB;

-- Completed tasks live here instead — the board never queries this table,
-- but a task's row (and its full history) is never deleted, only moved here.
CREATE TABLE IF NOT EXISTS done_tasks (
  id INT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(80) NOT NULL,
  description TEXT,
  priority ENUM('low', 'med', 'high') NOT NULL,
  due_date VARCHAR(10),
  history JSON NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_done_tasks_user (user_id)
) ENGINE=InnoDB;

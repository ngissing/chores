// Use an in-memory DB for tests so they don't touch the real data/chores.db
process.env.DB_PATH = ':memory:'

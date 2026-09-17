import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);

  // 1. Поиск книг (GET /api?id=... ИЛИ /api?search=... ИЛИ /api для всех)
  if (req.method === 'GET') {
    const { id, search } = req.query;

    try {
      // Поиск по конкретному 6-значному ID
      if (id) {
        const rows = await sql`SELECT * FROM books WHERE id = ${id.toUpperCase()} LIMIT 1`;
        if (rows.length === 0) return res.status(404).json({ error: 'Книга не найдена' });
        return res.status(200).json(rows[0]);
      }

      // Поиск по названию (или автору)
      if (search) {
        const query = `%${search}%`;
        const rows = await sql`
          SELECT * FROM books 
          WHERE title ILIKE ${query} OR author ILIKE ${query} 
          ORDER BY created_at DESC LIMIT 20
        `;
        return res.status(200).json(rows);
      }

      // По умолчанию: вывод последних 50 книг для главной страницы
      const allBooks = await sql`SELECT * FROM books ORDER BY created_at DESC LIMIT 50`;
      return res.status(200).json(allBooks);

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // 2. Загрузка книги (POST /api)
  if (req.method === 'POST') {
    try {
      const { title, author, fileName, fileData } = req.body;

      if (!title || !author || !fileData) {
        return res.status(400).json({ error: 'Заполните все поля' });
      }

      const buffer = Buffer.from(fileData, 'base64');
      const blob = await put(`books/${Date.now()}_${fileName}`, buffer, {
        access: 'public',
        token: process.env.BLOB2_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN
      });

      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let bookId = '';
      while (true) {
        bookId = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        const existing = await sql`SELECT id FROM books WHERE id = ${bookId}`;
        if (existing.length === 0) break;
      }

      await sql`
        INSERT INTO books (id, title, author, file_url)
        VALUES (${bookId}, ${title}, ${author}, ${blob.url})
      `;

      return res.status(200).json({ success: true, id: bookId });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

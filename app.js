import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

let supabase;

// Инициализация Supabase через Vercel API
async function init() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    supabase = createClient(config.supabaseUrl, config.supabaseKey);
  } catch (err) {
    console.error('Ошибка инициализации Supabase:', err);
  }
}
init();

// Генерация случайного 6-значного кода (A-Z, 0-9)
function generateID() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// Генерация гарантированно уникального ID с проверкой в БД
async function getUniqueBookID() {
  while (true) {
    const candidateId = generateID();
    const { data } = await supabase
      .from('books')
      .select('id')
      .eq('id', candidateId)
      .maybeSingle();

    if (!data) return candidateId; // Код свободен
  }
}

// Поиск книги по ID
document.getElementById('btn-search').addEventListener('click', async () => {
  const code = document.getElementById('search-id').value.trim().toUpperCase();
  const resultDiv = document.getElementById('search-result');

  if (code.length !== 6) {
    alert('ID должен состоять ровно из 6 символов!');
    return;
  }

  resultDiv.innerHTML = 'Поиск...';

  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('id', code)
    .maybeSingle();

  if (error || !data) {
    resultDiv.innerHTML = '<p style="color:#f87171;">Книга с таким ID не найдена.</p>';
    return;
  }

  resultDiv.innerHTML = `
    <div class="book-result">
      <h3>${data.title}</h3>
      <p><strong>Автор:</strong> ${data.author}</p>
      <p><strong>ID:</strong> ${data.id}</p>
      <a href="${data.file_url}" class="download-btn" download><button>Скачать .hpsep</button></a>
    </div>
  `;
});

// Загрузка книги в Storage и запись в Таблицу
document.getElementById('btn-upload').addEventListener('click', async () => {
  const title = document.getElementById('upload-title').value.trim();
  const author = document.getElementById('upload-author').value.trim();
  const fileInput = document.getElementById('upload-file');
  const statusDiv = document.getElementById('upload-status');

  if (!title || !author || !fileInput.files[0]) {
    alert('Заполните все поля и выберите файл .hpsep!');
    return;
  }

  const file = fileInput.files[0];
  statusDiv.innerHTML = 'Загрузка файла...';

  try {
    // 1. Загружаем файл в Storage бакет 'hpsep-books'
    const filePath = `${Date.now()}_${file.name}`;
    const { error: storageErr } = await supabase.storage
      .from('hpsep-books')
      .upload(filePath, file);

    if (storageErr) throw storageErr;

    // Получаем публичную ссылку
    const { data: urlData } = supabase.storage
      .from('hpsep-books')
      .getPublicUrl(filePath);

    // 2. Генерируем уникальный 6-значный ID
    statusDiv.innerHTML = 'Генерация уникального ID...';
    const bookId = await getUniqueBookID();

    // 3. Записываем метаданные в таблицу 'books'
    const { error: dbErr } = await supabase
      .from('books')
      .insert([{ id: bookId, title, author, file_url: urlData.publicUrl }]);

    if (dbErr) throw dbErr;

    statusDiv.innerHTML = `
      <p style="color:#4ade80;">Книга успешно загружена!</p>
      <p>Уникальный ID книги: <strong>${bookId}</strong></p>
    `;

    // Сброс формы
    document.getElementById('upload-title').value = '';
    document.getElementById('upload-author').value = '';
    fileInput.value = '';
  } catch (err) {
    statusDiv.innerHTML = `<p style="color:#f87171;">Ошибка: ${err.message}</p>`;
  }
});

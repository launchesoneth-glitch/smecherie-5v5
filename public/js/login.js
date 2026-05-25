(async function () {
  // Daca user e deja logat -> mergi direct in lobby
  try {
    const r = await fetch('/api/me');
    if (r.ok) {
      window.location.href = '/lobby.html';
      return;
    }
  } catch (e) {}

  const form = document.getElementById('login-form');
  const errBox = document.getElementById('login-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    const username = document.getElementById('username').value.trim();
    const opggUrl = document.getElementById('opggUrl').value.trim();

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, opggUrl }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errBox.textContent = data.error || 'Login esuat';
      errBox.hidden = false;
      return;
    }
    window.location.href = '/lobby.html';
  });
})();

# KEMS backend for Render

This is the minimal Flask backend for user signup, login, and mirror claim.

## Local run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

## Render deploy

1. Push this folder to GitHub.
2. Create a new Render Web Service from that repo.
3. Set the environment values from `.env.example`.
4. Start command:

```bash
gunicorn app:app --bind 0.0.0.0:$PORT
```

The app seeds the first user and first mirror automatically:

- User 0
- user0@kems.local
- MIRROR-0001
- KEMS-0001

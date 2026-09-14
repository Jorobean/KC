import os
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, redirect, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "kems_site.db"

DEFAULT_SITE_USER_ID = 0
DEFAULT_SITE_USER_NAME = os.getenv("KEMS_USER_0_NAME", "User 0")
DEFAULT_SITE_USER_EMAIL = os.getenv("KEMS_USER_0_EMAIL", "user0@kems.local")
DEFAULT_SITE_USER_PASSWORD = os.getenv("KEMS_USER_0_PASSWORD", "ChangeMe123!")
DEFAULT_DEVICE_ID = os.getenv("KEMS_FIRST_DEVICE_ID", "MIRROR-0001")
DEFAULT_PAIRING_CODE = os.getenv("KEMS_FIRST_PAIRING_CODE", "KEMS-0001")

app = Flask(__name__)
app.secret_key = os.getenv("KEMS_SITE_SECRET", "change-this-secret-in-production")


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS mirrors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT UNIQUE NOT NULL,
                pairing_code TEXT UNIQUE NOT NULL,
                owner_id INTEGER,
                owner_name TEXT,
                claimed_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(owner_id) REFERENCES users(id)
            )
            """
        )
        conn.commit()


def ensure_default_seed() -> None:
    with get_db() as conn:
        user = conn.execute("SELECT * FROM users WHERE id = ?", (DEFAULT_SITE_USER_ID,)).fetchone()
        if user is None:
            conn.execute(
                "INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)",
                (
                    DEFAULT_SITE_USER_ID,
                    DEFAULT_SITE_USER_EMAIL,
                    generate_password_hash(DEFAULT_SITE_USER_PASSWORD),
                    DEFAULT_SITE_USER_NAME,
                ),
            )
        else:
            conn.execute(
                "UPDATE users SET email = ?, password_hash = ?, name = ? WHERE id = ?",
                (
                    DEFAULT_SITE_USER_EMAIL,
                    generate_password_hash(DEFAULT_SITE_USER_PASSWORD),
                    DEFAULT_SITE_USER_NAME,
                    DEFAULT_SITE_USER_ID,
                ),
            )

        mirror = conn.execute("SELECT * FROM mirrors WHERE device_id = ?", (DEFAULT_DEVICE_ID,)).fetchone()
        if mirror is None:
            conn.execute(
                "INSERT INTO mirrors (device_id, pairing_code, owner_id, owner_name, claimed_at) VALUES (?, ?, ?, ?, NULL)",
                (DEFAULT_DEVICE_ID, DEFAULT_PAIRING_CODE, DEFAULT_SITE_USER_ID, DEFAULT_SITE_USER_NAME),
            )
        else:
            conn.execute(
                "UPDATE mirrors SET pairing_code = ?, owner_id = ?, owner_name = ? WHERE device_id = ?",
                (DEFAULT_PAIRING_CODE, DEFAULT_SITE_USER_ID, DEFAULT_SITE_USER_NAME, DEFAULT_DEVICE_ID),
            )

        conn.commit()


@app.before_request
def setup_db():
    init_db()
    ensure_default_seed()


def login_required(view):
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"error": "Authentication required."}), 401
        return view(*args, **kwargs)

    wrapper.__name__ = view.__name__
    return wrapper


@app.get("/")
def index():
    return jsonify({
        "ok": True,
        "name": "KEMS backend",
        "first_user": {"id": DEFAULT_SITE_USER_ID, "email": DEFAULT_SITE_USER_EMAIL, "name": DEFAULT_SITE_USER_NAME},
        "first_mirror": {"device_id": DEFAULT_DEVICE_ID, "pairing_code": DEFAULT_PAIRING_CODE},
    })


@app.post("/api/signup")
def api_signup():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name or not email or not password:
        return jsonify({"error": "Name, email, and password are required."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400

    with get_db() as conn:
        try:
            conn.execute(
                "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
                (email, generate_password_hash(password), name),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            return jsonify({"error": "An account with that email already exists."}), 409

    return jsonify({"ok": True, "message": "Account created."})


@app.post("/api/login")
def api_login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    row = get_db().execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid email or password."}), 401

    session["user_id"] = row["id"]
    session["user_name"] = row["name"]
    return jsonify({"ok": True, "user": {"id": row["id"], "name": row["name"], "email": row["email"]}})


@app.post("/api/claim")
@login_required
def api_claim():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip().upper()
    if not code:
        return jsonify({"error": "Pairing code is required."}), 400

    with get_db() as conn:
        mirror = conn.execute("SELECT * FROM mirrors WHERE pairing_code = ?", (code,)).fetchone()
        if mirror is None:
            return jsonify({"error": "Unknown pairing code."}), 404
        if mirror["owner_id"] is not None:
            return jsonify({"error": "This mirror has already been claimed."}), 409

        conn.execute(
            "UPDATE mirrors SET owner_id = ?, owner_name = ?, claimed_at = CURRENT_TIMESTAMP WHERE id = ?",
            (session["user_id"], session["user_name"], mirror["id"]),
        )
        conn.commit()

    return jsonify({"ok": True, "device_id": mirror["device_id"], "owner_name": session["user_name"]})


@app.get("/api/mirrors")
@login_required
def api_mirrors():
    rows = get_db().execute("SELECT id, device_id, pairing_code, owner_name, claimed_at FROM mirrors ORDER BY id ASC").fetchall()
    return jsonify({"mirrors": [dict(r) for r in rows]})


@app.get("/healthz")
def healthz():
    return jsonify({"ok": True, "status": "healthy"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))

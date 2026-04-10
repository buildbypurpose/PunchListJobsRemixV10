"""Backend tests for PunchListJobs - Auth, Health, and Core APIs"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# ── Health ──────────────────────────────────────────────────────────────────

class TestHealth:
    def test_root_returns_operational(self):
        r = requests.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        data = r.json()
        assert "status" in data or "message" in data or "operational" in str(data).lower()

# ── Auth ─────────────────────────────────────────────────────────────────────

class TestAuth:
    def test_admin_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@punchlistjobs.com",
            "password": "Admin@123"
        })
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["user"]["role"] in ("admin", "superadmin", "subadmin")

    def test_crew_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "crew1@punchlistjobs.com",
            "password": "Crew@123"
        })
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["user"]["role"] == "crew"

    def test_contractor_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "contractor1@punchlistjobs.com",
            "password": "Contractor@123"
        })
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["user"]["role"] == "contractor"

    def test_superadmin_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "superadmin@punchlistjobs.com",
            "password": "SuperAdmin@123"
        })
        assert r.status_code == 200

    def test_invalid_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpass"
        })
        assert r.status_code == 401

    def test_get_me(self):
        # login first
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@punchlistjobs.com",
            "password": "Admin@123"
        })
        token = r.json()["access_token"]
        r2 = requests.get(f"{BASE_URL}/api/auth/me",
                          headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
        assert r2.json()["email"] == "admin@punchlistjobs.com"


# ── Jobs ─────────────────────────────────────────────────────────────────────

class TestJobs:
    @pytest.fixture(autouse=True)
    def get_contractor_token(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "contractor1@punchlistjobs.com",
            "password": "Contractor@123"
        })
        self.token = r.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def test_list_jobs(self):
        r = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, (list, dict))

    def test_admin_get_users(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@punchlistjobs.com", "password": "Admin@123"
        })
        token = r.json()["access_token"]
        r2 = requests.get(f"{BASE_URL}/api/admin/users",
                          headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200

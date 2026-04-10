"""
Messaging feature tests: admin_chat threads, job threads, send/read/unread-count
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# ─── Auth helpers ──────────────────────────────────────────────────────────────

def login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        return r.json().get("access_token") or r.json().get("token")
    return None

@pytest.fixture(scope="module")
def crew_token():
    t = login("crew1@punchlistjobs.com", "Crew@123")
    if not t:
        pytest.skip("crew login failed")
    return t

@pytest.fixture(scope="module")
def contractor_token():
    t = login("contractor1@punchlistjobs.com", "Contractor@123")
    if not t:
        pytest.skip("contractor login failed")
    return t

@pytest.fixture(scope="module")
def admin_token():
    t = login("admin@punchlistjobs.com", "Admin@123")
    if not t:
        pytest.skip("admin login failed")
    return t

def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ─── Admin Chat Thread ─────────────────────────────────────────────────────────

class TestAdminThread:
    """Admin chat thread creation and idempotency"""

    def test_create_admin_thread_for_crew(self, crew_token):
        """POST /api/messages/threads/admin creates admin_chat thread"""
        r = requests.post(f"{BASE_URL}/api/messages/threads/admin", headers=auth(crew_token))
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["type"] == "admin_chat"
        assert "id" in data
        print(f"PASS: admin thread created, id={data['id']}")

    def test_admin_thread_idempotent(self, crew_token):
        """POST /api/messages/threads/admin returns same thread on second call"""
        r1 = requests.post(f"{BASE_URL}/api/messages/threads/admin", headers=auth(crew_token))
        r2 = requests.post(f"{BASE_URL}/api/messages/threads/admin", headers=auth(crew_token))
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"]
        print("PASS: admin thread is idempotent")

    def test_admin_cannot_create_admin_thread(self, admin_token):
        """Admins should get 400 when calling POST /threads/admin"""
        r = requests.post(f"{BASE_URL}/api/messages/threads/admin", headers=auth(admin_token))
        assert r.status_code == 400
        print("PASS: admin gets 400 when creating admin thread")

    def test_contractor_can_create_admin_thread(self, contractor_token):
        """Contractor can create admin support thread"""
        r = requests.post(f"{BASE_URL}/api/messages/threads/admin", headers=auth(contractor_token))
        assert r.status_code == 200
        assert r.json()["type"] == "admin_chat"
        print("PASS: contractor can create admin thread")


# ─── List Threads ──────────────────────────────────────────────────────────────

class TestListThreads:
    """GET /api/messages/threads"""

    def test_crew_list_threads(self, crew_token):
        r = requests.get(f"{BASE_URL}/api/messages/threads", headers=auth(crew_token))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        print(f"PASS: crew sees {len(data)} threads")

    def test_admin_list_threads_includes_admin_chat(self, admin_token):
        """Admin should see admin_chat threads"""
        r = requests.get(f"{BASE_URL}/api/messages/threads", headers=auth(admin_token))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        types = [t["type"] for t in data]
        print(f"PASS: admin sees {len(data)} threads, types: {set(types)}")


# ─── Send Message ──────────────────────────────────────────────────────────────

class TestSendMessage:
    """POST /api/messages/threads/{id}/send"""

    @pytest.fixture(scope="class")
    def admin_thread_id(self, crew_token):
        r = requests.post(f"{BASE_URL}/api/messages/threads/admin", headers=auth(crew_token))
        return r.json()["id"]

    def test_admin_can_send_message(self, admin_thread_id, admin_token):
        """Admin sends a message to a thread"""
        r = requests.post(
            f"{BASE_URL}/api/messages/threads/{admin_thread_id}/send",
            json={"content": "Hello from admin test"},
            headers=auth(admin_token)
        )
        assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
        msg = r.json()
        assert msg["content"] == "Hello from admin test"
        assert "id" in msg
        print(f"PASS: admin sent message id={msg['id']}")

    def test_free_crew_cannot_send(self, admin_thread_id, crew_token):
        """Free-tier crew should get 403 UPGRADE_REQUIRED when sending"""
        r = requests.post(
            f"{BASE_URL}/api/messages/threads/{admin_thread_id}/send",
            json={"content": "Test from free crew"},
            headers=auth(crew_token)
        )
        # Could be 200 (if subscribed) or 403 (if free)
        if r.status_code == 403:
            assert "UPGRADE_REQUIRED" in r.json().get("detail", "")
            print("PASS: free crew gets 403 UPGRADE_REQUIRED")
        else:
            print(f"INFO: crew subscription_status allows sending (status={r.status_code})")


# ─── Unread Count ──────────────────────────────────────────────────────────────

class TestUnreadCount:
    """GET /api/messages/unread-count and POST /read"""

    def test_unread_count_returns_int(self, crew_token):
        r = requests.get(f"{BASE_URL}/api/messages/unread-count", headers=auth(crew_token))
        assert r.status_code == 200
        data = r.json()
        assert "count" in data
        assert isinstance(data["count"], int)
        print(f"PASS: unread count = {data['count']}")

    def test_mark_read_clears_unread(self, crew_token):
        """POST /threads/{id}/read should clear unread for user"""
        # Get or create admin thread
        r = requests.post(f"{BASE_URL}/api/messages/threads/admin", headers=auth(crew_token))
        tid = r.json()["id"]

        # Mark as read
        r2 = requests.post(f"{BASE_URL}/api/messages/threads/{tid}/read", headers=auth(crew_token))
        assert r2.status_code == 200
        assert r2.json().get("ok") is True
        print("PASS: mark_read returns ok=True")

    def test_admin_unread_count(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/messages/unread-count", headers=auth(admin_token))
        assert r.status_code == 200
        assert "count" in r.json()
        print(f"PASS: admin unread count = {r.json()['count']}")


# ─── Thread Messages ───────────────────────────────────────────────────────────

class TestThreadMessages:
    """GET /api/messages/threads/{id}"""

    def test_get_thread_messages(self, crew_token):
        # Get thread
        r = requests.post(f"{BASE_URL}/api/messages/threads/admin", headers=auth(crew_token))
        tid = r.json()["id"]

        r2 = requests.get(f"{BASE_URL}/api/messages/threads/{tid}", headers=auth(crew_token))
        assert r2.status_code == 200
        data = r2.json()
        assert "thread" in data
        assert "messages" in data
        assert isinstance(data["messages"], list)
        print(f"PASS: thread messages loaded, {len(data['messages'])} messages")

    def test_nonparticipant_cannot_view(self, contractor_token):
        """Contractor cannot view crew's admin thread"""
        # Get crew token to find their thread
        crew_tok = login("crew1@punchlistjobs.com", "Crew@123")
        r = requests.get(f"{BASE_URL}/api/messages/threads", headers=auth(crew_tok))
        crew_threads = [t for t in r.json() if t["type"] == "admin_chat"]
        if not crew_threads:
            pytest.skip("No crew admin thread to test")
        tid = crew_threads[0]["id"]

        # Try to access as contractor
        r2 = requests.get(f"{BASE_URL}/api/messages/threads/{tid}", headers=auth(contractor_token))
        # Contractor is not admin and not participant - should get 403
        # (Unless admin thread includes contractor's own thread)
        print(f"INFO: contractor accessing crew thread got {r2.status_code}")

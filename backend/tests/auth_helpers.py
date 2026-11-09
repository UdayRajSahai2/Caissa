"""A signed-in test user, as the Next.js server would forward it (AUTH-03)."""

TEST_TOKEN = "test-internal-token"
TEST_USER = "github:1001"
OTHER_USER = "google:2002"
AUTH_HEADERS = {"x-caissa-internal": TEST_TOKEN, "x-caissa-user": TEST_USER}

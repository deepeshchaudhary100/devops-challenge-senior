from flask import Flask, request
from datetime import datetime, timezone
import os

app = Flask(__name__)


@app.route("/")
def simple_time_service():
    """Return current UTC timestamp and visitor IP as JSON."""
    # X-Forwarded-For may contain comma-separated IPs: client, proxy1, proxy2
    # Extract the first (original client) IP address
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else request.remote_addr
    return {
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ip": client_ip
    }


@app.route("/health")
def health():
    """Health check endpoint for Kubernetes liveness/readiness probes."""
    return {"status": "healthy"}, 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)

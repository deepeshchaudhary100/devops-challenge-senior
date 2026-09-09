import json
import os
import urllib.request
from datetime import datetime, timezone
from flask import Flask, request

app = Flask(__name__)


def _extract_client_ip():
    """Extract visitor IP address from X-Forwarded-For or remote_addr."""
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.remote_addr or "127.0.0.1"


def _get_location_info(ip):
    """Fetch location details based on IP address with graceful fallback."""
    # Check for private or loopback IP ranges
    if (
        ip in ("127.0.0.1", "localhost")
        or ip.startswith("10.")
        or ip.startswith("192.168.")
        or ip.startswith("172.16.")
    ):
        return {
            "city": "Internal / Localhost",
            "region": "Local Network",
            "country": "Local",
            "timezone": "UTC"
        }

    try:
        url = f"http://ip-api.com/json/{ip}?fields=status,country,regionName,city,timezone"
        req = urllib.request.Request(url, headers={"User-Agent": "SimpleTimeService/1.0"})
        with urllib.request.urlopen(req, timeout=2) as response:
            data = json.loads(response.read().decode("utf-8"))
            if data.get("status") == "success":
                return {
                    "city": data.get("city"),
                    "region": data.get("regionName"),
                    "country": data.get("country"),
                    "timezone": data.get("timezone"),
                }
    except Exception:
        pass

    return {
        "city": "Unknown",
        "region": "Unknown",
        "country": "Unknown",
        "timezone": "UTC"
    }


@app.route("/")
def simple_time_service():
    """Return current UTC timestamp and visitor IP as JSON.

    If query parameter ?location=true is provided, includes location details.
    """
    client_ip = _extract_client_ip()
    response = {
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ip": client_ip
    }

    # Optional location query parameter to preserve challenge compliance by default
    if request.args.get("location", "").lower() in ("true", "1", "yes"):
        response["location"] = _get_location_info(client_ip)

    return response


@app.route("/location")
def location_endpoint():
    """Return timestamp, visitor IP, and geolocation details as JSON."""
    client_ip = _extract_client_ip()
    return {
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ip": client_ip,
        "location": _get_location_info(client_ip)
    }


@app.route("/health")
def health():
    """Health check endpoint for Kubernetes liveness/readiness probes."""
    return {"status": "healthy"}, 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)

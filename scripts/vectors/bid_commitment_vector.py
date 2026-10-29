"""Independent reference implementation of the VeilProcure bid-commitment encoding.

Used only to produce a cross-language test vector (asserted in packages/shared tests).
Run: python -I scripts/vectors/bid_commitment_vector.py
"""
import hashlib
import json
import struct


def lp(b: bytes) -> bytes:
    return struct.pack("<I", len(b)) + b


quote = {
    "schemaVersion": 1,
    "currency": "USD",
    "totalPrice": "1250.50",
    "deliveryDays": 14,
    "revisionsIncluded": 2,
    "scope": "Accessibility audit of checkout flow",
    "assumptions": "",
    "warranty": "30 days",
    "requirementResponses": [{"id": "wcag", "met": True, "note": "WCAG 2.2 AA"}],
}
# JCS for ASCII strings / integers / booleans == sorted keys, no whitespace.
canonical = json.dumps(quote, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
digests = sorted(["bb" * 32, "aa" * 32])
pre = (
    b"VEILPROCURE/BID/v1" + b"\x00"
    + lp(b"testnet")
    + lp(b"veilprocure.testnet")
    + struct.pack("<Q", 7)
    + lp(b"alpha.testnet")
    + struct.pack("<I", 3)
    + lp(canonical)
    + struct.pack("<I", len(digests))
    + b"".join(bytes.fromhex(d) for d in digests)
    + bytes.fromhex("cd" * 32)
)
print("canonical", canonical.decode())
print("preimage_len", len(pre))
print("commitment", hashlib.sha256(pre).hexdigest())

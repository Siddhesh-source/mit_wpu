"""Slides shared by every theme. Each function draws one slide with native shapes."""
from kit import *

TAGLINE = "Campus approvals, signed in one tap and verifiable by anyone."
TEAM = "Team budYweisers"
MEMBERS = "Shruti Dwivedi   ·   Siddhesh Chaudhari   ·   Shankar Jadhav"
EVENT = "Idea submission  ·  No-code and AI Hackathon, MIT-WPU Pune"


def title_A(d, total):
    t = d.t
    s = d.new_slide(NOTES_1)
    text(s, ML, 2.05, CW, 1.0, "CampusSign", t["head"], 56, t["ink"])
    text(s, ML, 3.1, CW, 0.5, TAGLINE, t["body"], 22, t["muted"])
    # team, college and members as one ruled table
    ty = 4.5
    line(s, ML, ty, W - MR, ty, t["ink"], 1.0)
    cols = [(ML, 3.3, "Team"), (ML + 3.6, 2.6, "College"), (ML + 6.5, CW - 6.5, "Members")]
    for i, (x, w, lab) in enumerate(cols):
        text(s, x, ty + 0.18, w, 0.28, lab, t["semi"], 12, t["muted"])
        if i:
            line(s, x - 0.3, ty + 0.18, x - 0.3, ty + 1.75, t["rule"], 0.75)
    text(s, cols[0][0], ty + 0.5, cols[0][1], 0.55, "budYweisers", t["head"], 28, t["accent"])
    text(s, cols[1][0], ty + 0.5, cols[1][1], 0.55, "VIT Pune", t["head"], 28, t["ink"])
    for i, name in enumerate(["Shruti Dwivedi", "Siddhesh Chaudhari", "Shankar Jadhav"]):
        ry = ty + 0.5 + i * 0.42
        text(s, cols[2][0], ry, cols[2][1], 0.4, name, t["semi"], 14, t["ink"], anchor="m")
        if i < 2:
            line(s, cols[2][0], ry + 0.42, W - MR, ry + 0.42, t["rule"], 0.75)
    line(s, ML, ty + 1.9, W - MR, ty + 1.9, t["rule"], 0.75)
    text(s, ML, 7.0, 8, 0.3, EVENT, t["body"], 9, t["faint"])
    return s


def title_B(d, total):
    t = d.t
    s = d.new_slide(NOTES_1)
    text(s, ML, 0.62, 8, 0.3, TEAM, t["semi"], SMALL, t["ink"])
    text(s, ML, 0.92, 8, 0.3, MEMBERS, t["body"], SMALL, t["muted"])
    text(s, ML, 1.95, 9.5, 1.1, "CampusSign", t["head"], DISPLAY, t["ink"])
    text(s, ML, 3.12, 7.2, 0.9, TAGLINE, t["body"], 22, t["muted"], spacing=1.2)
    # the chain
    y = 5.15
    line(s, ML + 0.12, y, W - MR - 0.12, y, t["rule"], 1.25)
    labels = ["REQUEST", "ROUTE", "SIGN", "SEAL", "VERIFY"]
    step = (CW - 0.24) / 4
    for i, lab in enumerate(labels):
        cx = ML + 0.12 + i * step
        if i < 4:
            circle(s, cx, y, 0.24, fill=t["bg"], line=t["ink"], lw=1.5)
        else:
            seal(s, cx, y, 0.34, t, ok=True)
        al = "l" if i == 0 else ("r" if i == 4 else "c")
        bx = cx - 0.12 if i == 0 else (cx - 1.88 if i == 4 else cx - 1.0)
        text(s, bx, y + 0.3, 2.0, 0.3, lab, t["mono"], 11, t["ink"] if i < 4 else t["ok"], align=al, tracking=1.5)
        if lab == "SIGN":
            rect(s, cx - 0.17, y - 0.42, 0.34, 0.05, fill=t["mark"])
    text(s, ML, H - 0.48, 8, 0.3, EVENT, t["body"], CAP, t["faint"])
    return s


def title_C(d, total):
    t = d.t
    s = d.new_slide(NOTES_1)
    text(s, ML, 1.75, 9.5, 1.1, "CampusSign", t["head"], DISPLAY + 4, t["ink"])
    text(s, ML, 2.95, 7.4, 0.9, TAGLINE, t["body"], 22, t["muted"], spacing=1.2)
    y = 4.45
    cw = 18 * 0.6 / 72  # Source Code Pro advance = 0.6 em
    text(s, ML, y, CW, 0.4, [[(H_OK[:56], t["mono"], 18, t["faint"]), (H_OK[56:], t["mono_b"], 18, t["ok"])]], t["mono"], 18, t["faint"])
    lx = ML + 56 * cw
    line(s, lx, y + 0.42, lx + 8 * cw, y + 0.42, t["ok"], 1.25)
    tick(s, lx + 0.09, y + 0.66, 0.16, t["ok"], 1.6)
    text(s, lx + 0.24, y + 0.54, 3.0, 0.3, "matches on-chain record", t["body"], 12, t["ok"])
    text(s, ML, 6.25, 9, 0.3, [[(TEAM + "    ", t["semi"], SMALL, t["ink"]), (MEMBERS, t["body"], SMALL, t["muted"])]], t["body"], SMALL, t["muted"])
    text(s, ML, H - 0.48, 8, 0.3, EVENT, t["body"], CAP, t["faint"])
    return s


TITLES = {"A": title_A, "B": title_B, "C": title_C}

NOTES_1 = ("Open: Every one of us has stood outside a cabin waiting for one signature. "
           "CampusSign replaces that paper chase: a student submits once, the right people sign on their phone, "
           "and anyone outside the campus can check the result is genuine. We are team budYweisers from VIT Pune: "
           "Shruti Dwivedi, Siddhesh Chaudhari and Shankar Jadhav.")


def slide_trust(d, num, total):
    t = d.t
    s = d.new_slide(NOTES_7)
    header(s, d, "Trust and Verification", "Change one character and the proof breaks.")
    # flow
    steps = [("Signed PDF", "Approved by Guide, T&P officer, HoD", False),
             ("SHA-256 fingerprint", short(H_OK), True),
             ("Written on chain", "Hash, signer roles, timestamps", False),
             ("Verify code on the PDF", "Opens the public verify page", False)]
    y = 2.3
    sw = 2.55
    gap = (CW - 4 * sw) / 3
    for i, (a, b, mono) in enumerate(steps):
        x = ML + i * (sw + gap)
        text(s, x, y + 0.28, sw, 0.32, a, t["semi"], BODY, t["ink"])
        text(s, x, y + 0.62, sw, 0.3, b, t["mono"] if mono else t["body"], 12 if mono else SMALL, t["muted"])
        if i < 3:
            line(s, x + sw + 0.12, y + 0.44, x + sw + gap - 0.14, y + 0.44, t["faint"], 1.0, arrow=True)
    # fork
    rows = [("Original document", H_OK, "=", True, "Verified"),
            ("Request no. 0412 edited to 0413", H_BAD, "≠", False, "Tampered")]
    fy = 3.72
    for j, (lab, hh, op, ok, verdict) in enumerate(rows):
        ry = fy + j * 1.0
        rect(s, ML, ry, CW, 0.82, fill=t["panel"])
        text(s, ML + 0.3, ry + 0.12, 3.3, 0.25, "Document a verifier holds", t["body"], CAP, t["faint"])
        text(s, ML + 0.3, ry + 0.38, 3.3, 0.3, lab, t["semi"], 14, t["ink"])
        text(s, ML + 3.75, ry + 0.12, 2.6, 0.25, "Re-computed hash", t["body"], CAP, t["faint"])
        text(s, ML + 3.75, ry + 0.38, 2.7, 0.3, short(hh), t["mono"], 13, t["ink"] if ok else t["bad"])
        text(s, ML + 6.35, ry + 0.26, 0.4, 0.4, op, t["semi"], 20, t["muted"], align="c")
        text(s, ML + 6.95, ry + 0.12, 2.6, 0.25, "Hash on chain", t["body"], CAP, t["faint"])
        text(s, ML + 6.95, ry + 0.38, 2.7, 0.3, short(H_OK), t["mono"], 13, t["ink"])
        seal(s, ML + 10.0, ry + 0.41, 0.36, t, ok=ok)
        text(s, ML + 10.3, ry + 0.27, 1.5, 0.3, verdict, t["semi"], BODY, t["ok"] if ok else t["bad"])
    # legal strip
    legal = [("IT Act 2000, s.5", "e-sign as valid as wet ink"),
             ("Aadhaar eSign", "notified in the Second Schedule"),
             ("BSA 2023, s.61", "electronic records admissible"),
             ("DPDP Rules 2025", "no personal data on chain"),
             ("Same model as", "India's National Blockchain Framework")]
    ly = 5.95
    cwid = CW / 5
    line(s, ML, ly - 0.12, W - MR, ly - 0.12, t["rule"], 0.75)
    for i, (a, b) in enumerate(legal):
        x = ML + i * cwid
        text(s, x, ly, cwid - 0.2, 0.28, a, t["semi"], 12.5, t["ink"])
        text(s, x, ly + 0.27, cwid - 0.2, 0.28, b, t["body"], 11.5, t["muted"])
    footer(s, d, num, total, "Hashes are real SHA-256 values of a sample record. Legal: IT Act 2000 s.3A, s.5, Second Schedule; "
                             "Bharatiya Sakshya Adhiniyam 2023 s.61; DPDP Rules 2025 (MeitY, Nov 2025).")
    return s


NOTES_7 = ("This is why a recruiter in Bengaluru can trust a NOC from Pune without a phone call. "
           "When the last approver signs, we compute a SHA-256 fingerprint of the PDF and write only that fingerprint, "
           "the signer roles and timestamps to the chain. No names, no roll numbers. To verify, we re-hash the PDF the "
           "verifier holds. Change one character, here the request number, and the hash no longer matches. "
           "Legally, the IT Act gives recognised e-signatures the same validity as wet ink, Aadhaar eSign is a notified "
           "method, and the Bharatiya Sakshya Adhiniyam treats electronic records as admissible documents.")

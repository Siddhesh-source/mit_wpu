"""Slide-drawing kit: themes, grid, and native-shape primitives (python-pptx)."""
import hashlib
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from lxml import etree

W, H = 13.333, 7.5          # 16:9 in inches
ML, MR, MT = 0.75, 0.75, 0.62
CW = W - ML - MR            # content width

THEMES = {
    "A": dict(name="Public Record", bg="FFFFFF", ink="101418", muted="5A6370", faint="6B7480",
              rule="E1E4E8", panel="F4F6F8", accent="1D4F91", ok="1E7A4C", ok_bg="E8F3EC",
              bad="B42318", bad_bg="FBEAE8", mark="1D4F91",
              head="Public Sans Bold", semi="Public Sans SemiBold", body="Public Sans Regular",
              med="Public Sans Regular", mono="IBM Plex Mono Regular", mono_b="IBM Plex Mono Regular"),
    "B": dict(name="Ink and Seal", bg="FAF9F6", ink="1F2A55", muted="586179", faint="8C93A5",
              rule="E2E0DA", panel="F1EFEA", accent="1F2A55", ok="0F6E54", ok_bg="E3F0EA",
              bad="B3261E", bad_bg="F8E7E4", mark="C98A1A",
              head="IBM Plex Sans SemiBold", semi="IBM Plex Sans SemiBold", body="IBM Plex Sans Regular",
              med="IBM Plex Sans Medium", mono="IBM Plex Mono Regular", mono_b="IBM Plex Mono Medium"),
    "C": dict(name="Quiet Ledger", bg="111A2E", ink="E8EBF0", muted="9AA4B5", faint="6E7A90",
              rule="27324B", panel="18233B", accent="AEBEDD", ok="6CC59A", ok_bg="17332C",
              bad="E5735C", bad_bg="3A2226", mark="6CC59A",
              head="Source Sans 3 SemiBold", semi="Source Sans 3 SemiBold", body="Source Sans 3 Regular",
              med="Source Sans 3 SemiBold", mono="Source Code Pro Regular", mono_b="Source Code Pro Medium"),
}

# Type scale (pt): display 60 / headline 30 / h2 20 / body 16 / small 13 / caption 10.5
DISPLAY, HEAD, H2, BODY, SMALL, CAP = 60, 30, 20, 16, 13, 10.5


def rgb(h):
    return RGBColor.from_string(h)


class Deck:
    def __init__(self, theme_key):
        self.t = THEMES[theme_key]
        self.prs = Presentation()
        self.prs.slide_width, self.prs.slide_height = Inches(W), Inches(H)
        self.blank = self.prs.slide_layouts[6]
        self.count = 0
        self.headed = set()

    def new_slide(self, notes=""):
        s = self.prs.slides.add_slide(self.blank)
        self.count += 1
        bg = s.background.fill
        bg.solid()
        bg.fore_color.rgb = rgb(self.t["bg"])
        if notes:
            s.notes_slide.notes_text_frame.text = notes
        return s

    def align_content(self):
        """Shift each content slide's body so its top edge sits on CONTENT_TOP."""
        E = 914400
        for i, s in enumerate(self.prs.slides, 1):
            if s.slide_id not in self.headed:
                continue
            body = [sh for sh in s.shapes if sh.name not in ("hdr", "ftr")]
            top = min(sh.top for sh in body)
            delta = int(CONTENT_TOP * E) - top
            for sh in body:
                sh.top = sh.top + delta
            bottom = max(sh.top + sh.height for sh in body) / E
            if bottom > CONTENT_BOTTOM + 0.05:
                print(f"WARN slide {i}: content bottom {bottom:.2f} in > {CONTENT_BOTTOM}")

    def save(self, path):
        self.align_content()
        self.prs.save(path)


# ---------- primitives ----------

# Type scale (pt): footnote 9 / caption 11 / body 12 / heading 14 / subtitle 18 / tagline 22 / title 28 / stat 40 / cover 56
SCALE = [9, 11, 12, 14, 18, 22, 28, 40, 56]
SNAP = {7.5: 9, 8: 9, 8.5: 9, 9.5: 9, 10: 11, 10.5: 11, 11.5: 11, 12.5: 12, 13: 12, 13.5: 12, 15: 14, 16: 14,
        17: 18, 19: 18, 20: 18, 24: 22, 27: 22, 30: 28, 32: 28, 36: 40, 54: 40, 60: 56, 64: 56}


def snap(sz):
    if sz in SCALE:
        return sz
    return SNAP.get(sz, min(SCALE, key=lambda v: abs(v - sz)))


def text(s, x, y, w, h, runs, font, size, color, align="l", anchor="t", spacing=1.0, after=0, tracking=None):
    """runs: str, or list of paragraphs; each paragraph a str or list of (text, font, size, color) tuples.
    Sizes snap to SCALE; line spacing is 1.1 for text, 1.0 for titles; letter-spacing is never applied."""
    tracking = None
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    for side in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, side, 0)
    tf.vertical_anchor = {"t": MSO_ANCHOR.TOP, "m": MSO_ANCHOR.MIDDLE, "b": MSO_ANCHOR.BOTTOM}[anchor]
    paras = runs if isinstance(runs, list) else [runs]
    for i, para in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = {"l": PP_ALIGN.LEFT, "c": PP_ALIGN.CENTER, "r": PP_ALIGN.RIGHT}[align]
        p.line_spacing = 1.0 if snap(size) >= 28 else 1.1
        p.space_after = Pt(after)
        segs = para if isinstance(para, list) else [(para, font, size, color)]
        for seg in segs:
            t_, f_, sz_, c_ = (list(seg) + [font, size, color])[:4] if isinstance(seg, tuple) else (seg, font, size, color)
            r = p.add_run()
            r.text = t_
            r.font.name = f_
            r.font.size = Pt(snap(sz_))
            r.font.color.rgb = rgb(c_)
            rPr = r._r.get_or_add_rPr()
            for tag in ("a:ea", "a:cs"):
                el = rPr.find(qn(tag))
                if el is None:
                    el = etree.SubElement(rPr, qn(tag))
                el.set("typeface", f_)
            if tracking is not None:
                rPr.set("spc", str(int(tracking * 100)))
    return tb


def rect(s, x, y, w, h, fill=None, line=None, lw=1.0, shape=MSO_SHAPE.RECTANGLE, radius=None):
    sh = s.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill:
        sh.fill.solid()
        sh.fill.fore_color.rgb = rgb(fill)
    else:
        sh.fill.background()
    if line:
        sh.line.color.rgb = rgb(line)
        sh.line.width = Pt(lw)
    else:
        sh.line.fill.background()
    if radius is not None and shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        sh.adjustments[0] = radius
    sh.shadow.inherit = False
    st = sh._element.find(qn("p:style"))
    if st is not None:
        sh._element.remove(st)
    sh.text_frame.text = ""
    return sh


def circle(s, cx, cy, d, fill=None, line=None, lw=1.25):
    return rect(s, cx - d / 2, cy - d / 2, d, d, fill, line, lw, MSO_SHAPE.OVAL)


def line(s, x1, y1, x2, y2, color, lw=1.0, arrow=False, dash=False):
    c = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = rgb(color)
    c.line.width = Pt(lw)
    st = c._element.find(qn("p:style"))
    if st is not None:
        c._element.remove(st)      # drop theme style: it adds a shadow to connectors
    ln = c.line._get_or_add_ln()
    if dash:
        d = etree.SubElement(ln, qn("a:prstDash"))
        d.set("val", "dash")
    if arrow:
        t = etree.SubElement(ln, qn("a:tailEnd"))
        t.set("type", "triangle"); t.set("w", "sm"); t.set("len", "sm")
    return c


def poly(s, pts, color, lw=2.0, closed=False, fill=None, dash=False, arrow=False):
    """Freeform polyline in inches."""
    fb = s.shapes.build_freeform(Inches(pts[0][0]), Inches(pts[0][1]), scale=1.0)
    fb.add_line_segments([(Inches(x), Inches(y)) for x, y in pts[1:]], close=closed)
    sh = fb.convert_to_shape()
    if fill:
        sh.fill.solid(); sh.fill.fore_color.rgb = rgb(fill)
    else:
        sh.fill.background()
    sh.line.color.rgb = rgb(color)
    sh.line.width = Pt(lw)
    ln = sh.line._get_or_add_ln()
    ln.set("cap", "rnd")
    if dash:
        etree.SubElement(ln, qn("a:prstDash")).set("val", "dash")
    etree.SubElement(ln, qn("a:round"))
    if arrow:
        te = etree.SubElement(ln, qn("a:tailEnd")); te.set("type", "triangle"); te.set("w", "sm"); te.set("len", "sm")
    sh.shadow.inherit = False
    return sh


def tick(s, cx, cy, size, color, lw=2.0):
    k = size / 2
    return poly(s, [(cx - k * 0.75, cy + k * 0.02), (cx - k * 0.2, cy + k * 0.55), (cx + k * 0.8, cy - k * 0.5)], color, lw)


def cross(s, cx, cy, size, color, lw=2.0):
    k = size * 0.32
    line(s, cx - k, cy - k, cx + k, cy + k, color, lw)
    line(s, cx - k, cy + k, cx + k, cy - k, color, lw)


def seal(s, cx, cy, d, t, ok=True):
    """Verified / tampered mark: filled circle with a tick or cross."""
    circle(s, cx, cy, d, fill=t["ok"] if ok else t["bad"])
    (tick if ok else cross)(s, cx, cy, d * 0.62, t["bg"] if t["bg"] != "111A2E" else "111A2E", lw=max(1.5, d * 2.2))


def footer(s, d, num, total, source=None):
    t = d.t
    y = H - 0.42
    if source:
        text(s, ML, 7.0, CW - 1.2, 0.3, [[("Research references: ", t["semi"], 9, t["muted"]),
                                          (source, t["body"], 9, t["faint"])]], t["body"], 9, t["faint"]).name = "ftr"
    text(s, W - MR - 1.0, 7.0, 1.0, 0.3, f"{num} / {total}", t["body"], 9, t["faint"], align="r").name = "ftr"


def headline(s, d, txt, sub=None, y=MT, w=CW):
    t = d.t
    text(s, ML, y, w, 1.0, txt, t["head"], HEAD, t["ink"], spacing=1.02)
    if sub:
        two = isinstance(txt, list) or len(txt) >= 70
        text(s, ML, y + (1.08 if two else 0.62), w, 0.6, sub, t["body"], BODY, t["muted"], spacing=1.15)


CONTENT_TOP = 1.95     # every content slide starts its body here
CONTENT_BOTTOM = 6.8   # nothing may sit below this except the footer


def header(s, d, title, sub):
    """Primary section title, then the slide's claim as a secondary heading."""
    t = d.t
    text(s, ML, 0.55, CW, 0.5, title, t["head"], 28, t["ink"]).name = "hdr"
    text(s, ML, 1.08, CW, 0.35, sub, t["body"], 18, t["muted"]).name = "hdr"
    d.headed.add(s.slide_id)


SECTIONS = ["Problem", "Solution", "Tools", "Impact", "Roadmap"]
SECTION_OF = {2: 0, 3: 0, 4: 1, 5: 1, 6: 2, 7: 1, 8: 1, 9: 3, 10: 4}


def tracker(s, d):
    """Five-part bar, top right; the current section is filled in accent."""
    t = d.t
    cur = SECTION_OF.get(d.count)
    if cur is None:
        return
    sw, gap = 0.74, 0.08
    x0 = W - MR - (5 * sw + 4 * gap)
    for i, name in enumerate(SECTIONS):
        x = x0 + i * (sw + gap)
        on = i == cur
        rect(s, x, 0.66, sw, 0.05, fill=t["accent"] if on else t["rule"])
        text(s, x, 0.76, sw, 0.22, name.upper(), t["mono_b"] if on else t["mono"], 8,
             t["accent"] if on else t["faint"], tracking=0.6)


def sha(txt):
    return hashlib.sha256(txt.encode()).hexdigest()


SAMPLE = "CampusSign | Internship NOC | Req PLC-2026-0412 | Approved: Guide, T&P Officer, HoD"
SAMPLE_EDIT = SAMPLE.replace("0412", "0413")
H_OK, H_BAD = sha(SAMPLE), sha(SAMPLE_EDIT)


def short(h):
    return f"{h[:8]}…{h[-8:]}"

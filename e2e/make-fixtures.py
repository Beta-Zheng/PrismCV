# make-fixtures.py —— 生成 e2e/feature-cases-round2.js 所需的测试文件（e2e-tmp/）
# 用法：python e2e/make-fixtures.py
# 用途：HOME-03 文本型 PDF（手工构造，xref 偏移精确计算，pdfjs-dist 可解析）、
#       HOME-04 最小 DOCX（zip: [Content_Types].xml + rels + document.xml，mammoth 可提取）、
#       EDIT-17 头像用 1x1 PNG
import zipfile, os, struct, zlib

out = os.path.join(os.path.dirname(__file__), "e2e-tmp")
os.makedirs(out, exist_ok=True)

# ---- 最小文本 PDF ----
text_lines = ["Zhao Yun", "Senior Backend Engineer", "zhaoyun@example.com", "",
              "Work Experience", "Cloud Mountain Tech | Senior Backend Engineer 2019.06 - Present",
              "- Led microservices refactor of the order system"]
stream_lines = []
y = 760
for ln in text_lines:
    esc = ln.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    stream_lines.append(f"BT /F1 12 Tf 50 {y} Td ({esc}) Tj ET")
    y -= 20
stream = ("\n".join(stream_lines)).encode("latin-1", "replace")
objs = [
    b"<< /Type /Catalog /Pages 2 0 R >>",
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
]
buf = b"%PDF-1.4\n"
offsets = []
for i, o in enumerate(objs, 1):
    offsets.append(len(buf))
    buf += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
xref_pos = len(buf)
buf += f"xref\n0 {len(objs)+1}\n".encode() + b"0000000000 65535 f \n"
for off in offsets:
    buf += f"{off:010d} 00000 n \n".encode()
buf += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF".encode()
open(os.path.join(out, "text-resume.pdf"), "wb").write(buf)

# ---- 最小 DOCX ----
ct = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>'''
rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''
def p(t): return f"<w:p><w:r><w:t>{t}</w:t></w:r></w:p>"
paras = "".join(p(x) for x in ["Qian Five", "Data Product Manager", "qianwu@example.com",
                               "Work Experience", "Dock Delta | Data Product Manager 2020.01 - Present",
                               "- Built a metrics middle platform serving 200 product staff"])
doc = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{paras}</w:body></w:document>'''
with zipfile.ZipFile(os.path.join(out, "text-resume.docx"), "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", ct)
    z.writestr("_rels/.rels", rels)
    z.writestr("word/document.xml", doc)

# ---- 1x1 PNG ----
def chunk(typ, data):
    c = struct.pack(">I", len(data)) + typ + data
    return c + struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)
ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"\x00\x10\x20\x30")) + chunk(b"IEND", b"")
open(os.path.join(out, "avatar.png"), "wb").write(png)

print("fixtures written to", out)

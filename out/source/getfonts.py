import re, urllib.request, sys, os
out = sys.argv[1]
fams = ["Public+Sans:wght@400;500;600;700","IBM+Plex+Sans:wght@400;500;600;700","IBM+Plex+Mono:wght@400;500;600","Source+Sans+3:wght@400;600;700","Source+Code+Pro:wght@400;500;600"]
for f in fams:
    req = urllib.request.Request("https://fonts.googleapis.com/css2?family="+f, headers={"User-Agent":"curl/8.0"})
    css = urllib.request.urlopen(req).read().decode()
    for block in css.split("@font-face")[1:]:
        fam = re.search(r"font-family: '([^']+)'", block).group(1).replace(" ","")
        w = re.search(r"font-weight: (\d+)", block).group(1)
        url = re.search(r"url\((\S+?)\)", block).group(1)
        p = os.path.join(out, f"{fam}-{w}.ttf")
        urllib.request.urlretrieve(url, p); print(p, os.path.getsize(p))

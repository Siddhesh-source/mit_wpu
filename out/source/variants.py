import sys
from kit import Deck
from slides_common import TITLES, slide_trust

out = sys.argv[1]
for k in "ABC":
    d = Deck(k)
    TITLES[k](d, 10)
    slide_trust(d, 7, 10)
    d.save(f"{out}/variant-{k}.pptx")
    print("built", k)

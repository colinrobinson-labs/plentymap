# Adds diet and allergen tags (al) and sodium (na, mg per 100 g) to every ingredient in data/food.json.
# Re-run after adding ingredients. Sodium: USDA FoodData Central, typical regular (not low-sodium) products,
# rounded. Ramen counts half the seasoning packet, as the recipe says.
# Tag letters: G contains gluten · g usually has gluten, gluten-free kind sold (soy sauce -> tamari, bouillon)
#   D dairy · E egg · P peanut · S soy · s often has soy, check the label · F fish or shellfish
#   M meat (needs halal or kosher meat) · K often not kosher (shellfish in kimchi) · O oats: buy certified gluten-free
import json, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAGS = {"pasta":"G","flour":"G","bread":"G","ftort":"G","ramen":"GSs","soy":"gS","bouil":"gs","oats":"O",
  "eggs":"E","mayo":"E","milk":"D","cheddar":"D","yogurt":"D","butter":"D","pb":"P","tofu":"S",
  "tuna":"F","kimchi":"FK","chleg":"M","chbr":"M","beef":"M"}
NA = {"rice":5,"pasta":6,"flour":2,"oats":6,"lentils":6,"dbeans":12,"peas_d":15,"cbeans":200,"chick":240,"ctom":130,
  "tpaste":60,"tsauce":400,"tuna":250,"coco":15,"corn":200,"eggs":142,"milk":43,"cheddar":650,"yogurt":70,"butter":640,
  "oil":0,"pb":430,"mayo":635,"chleg":90,"chbr":70,"beef":70,"tofu":10,"bread":480,"ftort":650,"ctort":45,"ramen":1200,
  "potato":6,"sweetp":55,"onion":4,"carrot":69,"cabbage":18,"garlic":17,"celery":80,"pepper":4,"gonion":16,"cilantro":46,
  "lime":2,"banana":1,"fmix":50,"fpeas":110,"fspin":75,"fbroc":20,"salsa":700,"soy":5500,"vinegar":2,"sugar":1,
  "bpowder":10600,"bouil":24000,"cumin":168,"chili":1600,"curry":52,"paprika":68,"italian":50,"garpow":60,"cinn":10,
  "mungb":15,"buckwheat":1,"beets":200,"kimchi":500,"ginger":13}
p = f"{ROOT}/data/food.json"; d = json.load(open(p))
miss = [k for k in d["ing"] if k not in NA]
if miss: sys.exit("no sodium figure for: " + ", ".join(miss))
for k, v in d["ing"].items(): v["al"] = TAGS.get(k, ""); v["na"] = NA[k]
d["note"] = d["note"].split(" Sodium")[0] + " Sodium per 100 g from USDA FoodData Central, typical regular products, rounded."
json.dump(d, open(p, "w"), ensure_ascii=False, separators=(",", ":"))
for r in d["recipes"]:
    na = sum(d["ing"][i]["g"] * q * d["ing"][i]["na"] / 100 for i, q in r["ing"]) / r["serves"]
    tg = "".join(sorted(set("".join(d["ing"][i]["al"] for i, _ in r["ing"]))))
    print(f"{r['id']:11} {round(na):5} mg  {tg}")

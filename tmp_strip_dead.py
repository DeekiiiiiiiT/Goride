from pathlib import Path
import re

path = Path(r"C:\Users\deeki\OneDrive\Documents\App and Web design\Roam\Goride\apps\fleet\src\components\drivers\DriverDetail.tsx")
text = path.read_text(encoding="utf-8")
original = text

text = text.replace("import { FuelWalletView } from './FuelWalletView';\n", "")

pat1 = re.compile(
    r"\s*\{/\*\s*___OLD_FINANCIAL_SUBTABS_BLOCK_1___.+?___OLD_FINANCIAL_SUBTABS_BLOCK_1_END___\s*\*/\}\s*",
    re.DOTALL,
)
text, n1 = pat1.subn("\n", text)

pat2 = re.compile(
    r"\s*\{/\*\s*___OLD_FINANCIAL_SUBTABS_BLOCK_2___.+?___OLD_FINANCIAL_SUBTABS_BLOCK_2_END___\s*\*/\}\s*",
    re.DOTALL,
)
text, n2 = pat2.subn("\n", text)

pat3 = re.compile(
    r"\s*\{/\*\s*__DEAD_EXPENSES_WRAP_START__.*?DEAD_BLOCK_END\s*\*/\}\s*",
    re.DOTALL,
)
text, n3 = pat3.subn("\n", text)

path.write_text(text, encoding="utf-8")
print(f"changed={original!=text} n1={n1} n2={n2} n3={n3}")
for needle in ["___OLD_FINANCIAL", "DEAD_EXPENSES", "DEAD_BLOCK", "FuelWalletView"]:
    if needle in text:
        print("still has", needle, text.count(needle))

"""Imágenes grandes o engañosas para la fase E: deben terminar sin colgar el navegador ni gastar memoria de más.

Uso: python3 generar_estres_faseE.py <carpeta_salida> <carpeta_corpus_auditoria>
"""
import sys, os, json, random
from PIL import Image, ImageDraw

OUT, CORPUS = sys.argv[1:3]
C = os.path.join(OUT, "corpus")
os.makedirs(C, exist_ok=True)
V = []
FACTURA = Image.open(os.path.join(CORPUS, "png01_factura.png")).convert("RGB")


def reg(i, archivo, nota):
    V.append({"id": i, "archivo": archivo, "cajetilla": "otros", "verdad": "estres", "checks": [], "mime": "", "nota": nota,
              "esperado": {"termina": True}})


# 1) Foto de casi 12 Mpx (3990×2990) con la factura ampliada y girada 90°: decodificar, medir, girar y quitar cuadrícula.
grande = FACTURA.resize((3990, round(3990 * FACTURA.height / FACTURA.width)), Image.LANCZOS)
lienzo = Image.new("RGB", (3990, 2990), (255, 255, 255))
lienzo.paste(grande, (0, 0))
lienzo.rotate(90, expand=True).save(os.path.join(C, "s1_12mpx_girada.jpg"), quality=85)
reg("s1", "s1_12mpx_girada.jpg", "Foto de 11,9 Mpx con la factura girada 90°")

# 2) Ruido puro (la mitad de los píxeles negros): no hay texto; no debe girar, ampliar ni tardar.
random.seed(3)
ruido = Image.effect_noise((2000, 1500), 120).point(lambda v: 0 if v < 128 else 255).convert("RGB")
ruido.save(os.path.join(C, "s2_ruido.png"))
reg("s2", "s2_ruido.png", "Ruido (2000×1500): sin texto")

# 3) Rayas verticales finas en toda la imagen (como un código de barras gigante).
rayas = Image.new("RGB", (2400, 1600), (255, 255, 255))
d = ImageDraw.Draw(rayas)
for x in range(0, 2400, 6):
    d.line([(x, 0), (x, 1600)], fill=(0, 0, 0), width=2)
rayas.save(os.path.join(C, "s3_rayas.png"))
reg("s3", "s3_rayas.png", "Rayas verticales en toda la imagen (2400×1600)")

# 4) Imagen diminuta (40×20) con tinta: no hay datos para medir.
Image.new("RGB", (40, 20), (0, 0, 0)).save(os.path.join(C, "s4_diminuta.png"))
reg("s4", "s4_diminuta.png", "Imagen de 40×20 px toda negra")

json.dump(V, open(os.path.join(OUT, "verdad.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(V), "casos en", OUT)

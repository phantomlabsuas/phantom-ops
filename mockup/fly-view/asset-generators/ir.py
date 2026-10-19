import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw, ImageFilter
OW, OH = 1024, 576
W, H = 1400, 1000   # top-down scene
S = 2
def fbm(h, w, beta, seed):
    r = np.random.default_rng(seed)
    F = np.fft.fft2(r.standard_normal((h, w)))
    fy = np.fft.fftfreq(h)[:, None]; fx = np.fft.fftfreq(w)[None, :]
    f = np.sqrt(fx**2 + fy**2); f[0, 0] = 1
    F = F / f**(beta/2); F[0, 0] = 0
    o = np.real(np.fft.ifft2(F)); return (o-o.mean())/o.std()
base = 78 + 8*fbm(H*S, W*S, 3.4, 1) + 3.5*fbm(H*S, W*S, 2.2, 2) + 2*fbm(H*S, W*S, 1.4, 3)
im = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), 'L')
d = ImageDraw.Draw(im)
def P(pts): return [(x*S, y*S) for x, y in pts]
r = np.random.default_rng(4)
# highway, warm, with shoulders and lane marks
hw = [(-60, 420), (1460, -20)]
d.line(P(hw), fill=118, width=64*S)
d.line(P(hw), fill=150, width=54*S)
d.line(P([(-60, 434), (1460, -6)]), fill=142, width=2*S)
for t in np.linspace(0.0, 1.0, 26):
    x = -60 + t*1520; y = 420 - t*440
    d.line(P([(x, y), (x+20, y-6)]), fill=132, width=2*S)
# track to compound, tyre-rutted
trk = [(330, 328), (380, 430), (440, 560), (520, 700), (600, 860), (640, 1020)]
d.line(P(trk), fill=96, width=22*S, joint='curve')
for off in (-6, 6):
    d.line(P([(x+off, y) for x, y in trk]), fill=106, width=3*S, joint='curve')
# scrub clusters (cool)
for _ in range(60):
    cx, cy = r.uniform(0, W), r.uniform(0, H)
    if 520 < cx < 1120 and 380 < cy < 820: continue
    for _ in range(r.integers(4, 12)):
        x, y, s = cx + r.normal(0, 10), cy + r.normal(0, 10), r.uniform(1.5, 4.5)
        d.ellipse(P([(x-s, y-s), (x+s, y+s)]), fill=int(r.uniform(60, 70)))
for (x, y, s) in [(470, 760, 24), (500, 800, 18), (1180, 420, 26), (1210, 460, 20), (1150, 880, 28), (560, 900, 16)]:
    d.ellipse(P([(x-s, y-s), (x+s, y+s)]), fill=60)
    d.ellipse(P([(x-s*0.6, y-s*0.7), (x+s*0.2, y-s*0.1)]), fill=72)
# compound
x0, y0, x1, y1 = 560, 400, 1100, 800
d.rectangle(P([(x0-4, y0-4), (x1+4, y1+4)]), fill=72)
d.rectangle(P([(x0, y0), (x1, y1)]), fill=92)
d.rectangle(P([(x0, y0), (x1, y1)]), outline=168, width=7*S)
d.rectangle(P([(554, 640), (568, 700)]), fill=100)   # gate
blds = [(610, 440, 200, 140, 124), (850, 436, 200, 100, 146), (860, 570, 190, 170, 112), (620, 640, 130, 100, 138)]
im_roofs = []
for (x, y, w, h, t) in blds:
    d.rectangle(P([(x+10, y+10), (x+w+14, y+h+34)]), fill=72)
    d.rectangle(P([(x, y+h), (x+w, y+h+26)]), fill=min(255, t+22))
    for k in range(int(w//30)):
        d.rectangle(P([(x+10+k*30, y+h+8), (x+20+k*30, y+h+18)]), fill=min(255, t+70))
    d.rectangle(P([(x, y), (x+w, y+h)]), fill=t)
    for k in range(0, int(h), 7):
        d.line(P([(x+2, y+k), (x+w-2, y+k)]), fill=max(0, t-6), width=1*S)
    d.rectangle(P([(x, y), (x+w, y+h)]), outline=min(255, t+34), width=4*S)
    d.rectangle(P([(x+w-30, y+12), (x+w-14, y+26)]), fill=222)
    d.line(P([(x+w*0.5, y), (x+w*0.5, y+h)]), fill=max(0, t-10), width=2*S)
# vehicles: parked truck (hot engine), cooling car
d.rounded_rectangle(P([(820, 760), (900, 790)]), radius=5*S, fill=116)
d.rounded_rectangle(P([(886, 760), (918, 790)]), radius=5*S, fill=236)
d.rounded_rectangle(P([(960, 752), (1012, 778)]), radius=6*S, fill=128)
for (x, y) in [(830, 612), (842, 620), (790, 700)]:
    d.ellipse(P([(x-5, y-5), (x+5, y+5)]), fill=228)
im = im.filter(ImageFilter.GaussianBlur(1.1*S))
# roof thermal gradients
a = np.asarray(im).astype(np.float32)
a += 5*fbm(H*S, W*S, 2.6, 30)
im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'L')
# oblique perspective: far edge (top) covers more ground
def coeffs(dst, src):
    A = []; B = []
    for (x, y), (X, Y) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -X*x, -X*y]); B.append(X)
        A.append([0, 0, 0, x, y, 1, -Y*x, -Y*y]); B.append(Y)
    return np.linalg.solve(np.array(A, float), np.array(B, float))
src = [(80*S, 140*S), (1320*S, 140*S), (1060*S, 980*S), (340*S, 980*S)]
dst = [(0, 0), (OW*S, 0), (OW*S, OH*S), (0, OH*S)]
im = im.transform((OW*S, OH*S), Image.PERSPECTIVE, tuple(coeffs(dst, src)), Image.BICUBIC)
im = im.resize((OW, OH), Image.LANCZOS)
a = np.asarray(im).astype(np.float32)
hot = np.clip(a - 175, 0, None)
a += ndimage.gaussian_filter(hot, 5)*0.8
rr = np.random.default_rng(9)
a += rr.normal(0, 4.0, a.shape)
a += np.tile(rr.normal(0, 1.4, (1, OW)), (OH, 1))
yy, xx = np.mgrid[0:OH, 0:OW]
a *= 1 - 0.22*(((xx-OW/2)/(OW/2))**2 + ((yy-OH/2)/(OH/2))**2)
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'L').convert('RGB').save('ir.jpg', quality=85, optimize=True)
# report where the track maps to (for the moving-vehicle animation)
inv = coeffs(src, dst)
def fwd(X, Y):
    a_, b_, c_, d_, e_, f_, g_, h_ = inv
    den = g_*X*S + h_*Y*S + 1
    return ((a_*X*S + b_*Y*S + c_)/den/S, (d_*X*S + e_*Y*S + f_)/den/S)
for p in [(380, 430), (440, 560), (520, 700), (558, 670), (600, 860), (1100, 400), (560,400),(560,800),(1100,800)]:
    print(p, [round(v,1) for v in fwd(*p)])

import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw, ImageFilter
rng = np.random.default_rng(7)
S = 2
W, H = 1920*S, 1080*S

def fbm(h, w, beta, seed, fmin=0):
    r = np.random.default_rng(seed)
    F = np.fft.fft2(r.standard_normal((h, w)))
    fy = np.fft.fftfreq(h)[:, None]; fx = np.fft.fftfreq(w)[None, :]
    f = np.sqrt(fx**2 + fy**2); f[0, 0] = 1
    F = F / f**(beta/2); F[0, 0] = 0
    out = np.real(np.fft.ifft2(F))
    return (out - out.mean()) / out.std()

def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t*t*(3-2*t)

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
xn, yn = xx / W, yy / H
warpA = fbm(H, W, 3.4, 1); warpB = fbm(H, W, 3.4, 2)
low = fbm(H, W, 3.8, 3)
# --- mountains: domain-warped ridged multifractal
wx = xx + 140*S*warpA; wy = yy + 140*S*warpB
def ridged(seed, beta):
    n = fbm(H, W, beta, seed)
    n = ndimage.map_coordinates(n, [np.clip(wy, 0, H-1), np.clip(wx, 0, W-1)], order=1, mode='reflect')
    return (1 - np.abs(n))**3
R = 0.62*ridged(6, 3.6) + 0.30*ridged(8, 3.1) + 0.08*ridged(9, 2.6)
R = ndimage.gaussian_filter(R, 1.2*S)
mx = xn + 0.10*warpA - 0.20*(1-yn)
mount = sstep(0.70, 0.92, mx)
elev = 0.03*low + mount*(1.1*R + 0.4*low + 0.3)
# --- dunes (west / south-west), linear crests
dx = xn + 0.06*warpB + 0.10*yn
dunem = 1 - sstep(0.18, 0.34, dx)
th = np.deg2rad(32)
lam = 34*S*(1 + 0.25*low)
u = (xx*np.cos(th) + yy*np.sin(th)) / lam
ph = u*2*np.pi + 9.0*warpA + 2.0*fbm(H, W, 3.0, 41)
saw = (ph/(2*np.pi)) % 1.0
prof = np.where(saw < 0.75, saw/0.75, (1-saw)/0.25)   # gentle stoss, steep lee
prof = ndimage.gaussian_filter(prof, 1.5*S)
amp = 0.6 + 0.4*sstep(-1, 1, fbm(H, W, 3.2, 42))
elev += dunem*0.05*prof*amp
# --- low-relief plain texture (very gentle)
elev += 0.006*fbm(H, W, 2.8, 4)
# hillshade
gy, gx = np.gradient(ndimage.gaussian_filter(elev, 0.8*S))
k = 260.0*S
gx *= k; gy *= k
az, alt = np.deg2rad(315), np.deg2rad(38)
slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
shade = np.clip(np.sin(alt)*np.cos(slope) + np.cos(alt)*np.sin(slope)*np.cos(az - aspect), 0, 1)
flat = np.sin(alt)
rel = shade / flat  # 1 on flat ground

def c(*v): return np.array(v, np.float32)
albedo = fbm(H, W, 3.3, 21); speck = fbm(H, W, 1.2, 22)
plainA, plainB = c(184, 160, 126), c(150, 128, 102)
col = plainA + (plainB - plainA)*sstep(-0.6, 1.2, albedo)[..., None]
col += speck[..., None]*3.0
sand = c(206, 170, 126) + c(-10, -14, -14)*prof[..., None]
dm = dunem[..., None]
col = col*(1-dm) + sand*dm
rk = sstep(0.12, 0.55, mount)[..., None]
rockcol = c(98, 84, 74) + (c(132, 114, 96) - c(98, 84, 74))*sstep(0.2, 0.9, R)[..., None]
col = col*(1-rk) + rockcol*rk
img = col * np.clip(0.30 + 0.70*rel, 0.2, 1.35)[..., None]
img = np.clip(img, 0, 255).astype(np.uint8)
im = Image.fromarray(img).convert('RGBA')
ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
dr = ImageDraw.Draw(ov)
def P(pts): return [(x*S, y*S) for x, y in pts]
def meander(p0, p1, n=60, amp=18, seed=0):
    r = np.random.default_rng(seed)
    t = np.linspace(0, 1, n)
    x = p0[0] + (p1[0]-p0[0])*t; y = p0[1] + (p1[1]-p0[1])*t
    nx, ny = -(p1[1]-p0[1]), (p1[0]-p0[0]); L = np.hypot(nx, ny); nx/=L; ny/=L
    off = np.cumsum(r.normal(0, 1, n)); off = ndimage.gaussian_filter1d(off, 3); off -= np.linspace(off[0], off[-1], n)
    off = off/ (np.abs(off).max()+1e-6) * amp
    return list(zip(x + nx*off, y + ny*off))
# --- wadis from mountains flowing west/south-west
wadis = [((1420, 470), (1000, 760), 26, 31), ((1380, 700), (1060, 930), 22, 32), ((1330, 900), (1120, 1090), 18, 33), ((1360, 250), (930, 330), 20, 34)]
veg_pts = []
for (a, b, amp, sd) in wadis:
    path = meander(a, b, 80, amp, sd)
    dr.line(P(path), fill=(204, 190, 160, 95), width=8*S, joint='curve')
    dr.line(P(path), fill=(214, 202, 176, 120), width=3*S, joint='curve')
    r = np.random.default_rng(sd+100)
    for (x, y) in path[::1]:
        for _ in range(3):
            if r.random() < 0.55:
                veg_pts.append((x + r.normal(0, 5), y + r.normal(0, 5), r.uniform(0.8, 1.6)))
for (x, y, s) in veg_pts:
    dr.ellipse(P([(x-s, y-s), (x+s, y+s)]), fill=(64, 70, 50, 210))
# --- highway (dual carriageway) SW -> NE
hw = [(-20, 1040), (260, 880), (520, 735), (760, 600), (1040, 452), (1340, 300), (1600, 160), (1960, -40)]
dr.line(P(hw), fill=(196, 186, 164, 255), width=9*S, joint='curve')
dr.line(P(hw), fill=(64, 64, 66, 255), width=6*S, joint='curve')
dr.line(P(hw), fill=(150, 146, 136, 255), width=1*S, joint='curve')
# --- desert tracks (subtle)
tracks = [
    [(760, 600), (820, 690), (880, 800), (920, 960), (930, 1100)],
    [(1040, 452), (1015, 478), (990, 540), (930, 610), (840, 680)],
    [(1040, 452), (1110, 515), (1240, 560), (1420, 640), (1520, 720)],
    [(260, 880), (230, 700), (170, 520), (110, 300), (60, -10)],
    [(1340, 300), (1300, 200), (1310, 60), (1290, -10)],
]
for i, t in enumerate(tracks):
    pts = []
    for a, b in zip(t[:-1], t[1:]):
        pts += meander(a, b, 20, 4, 200+i)
    dr.line(P(pts), fill=(222, 208, 178, 175), width=int(1.6*S), joint='curve')
# --- center-pivot farms south of highway
pr = np.random.default_rng(5)
greens = [(70, 100, 50), (86, 116, 56), (60, 88, 46), (110, 124, 66), (156, 140, 100), (96, 110, 60)]
for gi in range(4):
    for gj in range(3):
        if (gi, gj) in [(0, 2), (3, 2)]: continue
        cx = 700 + gi*42 + gj*12; cy = 780 + gj*42 - gi*6; r = pr.uniform(16, 19)
        g = greens[pr.integers(0, len(greens))]
        dr.ellipse(P([(cx-r, cy-r), (cx+r, cy+r)]), fill=g + (255,))
        if pr.random() < 0.45:
            a0 = pr.uniform(0, 360)
            dr.pieslice(P([(cx-r, cy-r), (cx+r, cy+r)]), a0, a0 + pr.uniform(50, 160), fill=(162, 144, 108, 255))
        dr.ellipse(P([(cx-1, cy-1), (cx+1, cy+1)]), fill=(210, 206, 196, 255))
dr.line(P([(680, 900), (690, 760), (700, 634)]), fill=(222, 208, 178, 200), width=int(1.6*S))
# --- town: irregular, north of highway
tr = np.random.default_rng(9)
blob = lambda x, y: ((x-640)/95)**2 + ((y-600)/52)**2 + 0.35*np.sin(x/23.0)*np.cos(y/17.0)
for sx in range(540, 745, 5):
    for sy in range(530, 665, 5):
        if blob(sx, sy) > 1 or (sy - (735 - (sx-520)*0.555)) > -10: continue
        if tr.random() < 0.15: continue
        w = tr.uniform(2.6, 4.2); h = tr.uniform(2.4, 4.0)
        if (sx//5)%7==0 or (sy//5)%6==0: continue
        tone = int(tr.uniform(200, 246))
        dr.rectangle(P([(sx, sy), (sx+w, sy+h)]), fill=(tone, tone-6, tone-16, 255))
        if tr.random() < 0.12:
            dr.ellipse(P([(sx+w+0.5, sy), (sx+w+2.5, sy+2)]), fill=(66, 84, 52, 230))
# --- walled compound at the junction (target)
cx0, cy0 = 1003, 488
dr.rectangle(P([(cx0-10, cy0-7), (cx0+10, cy0+8)]), outline=(226, 214, 190, 255), width=S)
for (bx, by, w, h) in [(-7, -4, 6, 4), (1, -4, 7, 3), (-6, 2, 5, 3.5), (3, 1.5, 4, 4)]:
    dr.rectangle(P([(cx0+bx, cy0+by), (cx0+bx+w, cy0+by+h)]), fill=(234, 226, 208, 255))
ov = ov.filter(ImageFilter.GaussianBlur(0.6*S))
im = Image.alpha_composite(im, ov).convert('RGB')
im = im.resize((1920, 1080), Image.LANCZOS)
a = np.asarray(im).astype(np.float32)
a += np.random.default_rng(3).normal(0, 2.2, a.shape[:2])[..., None]
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save('map.jpg', quality=82, optimize=True, progressive=True)
print('ok')

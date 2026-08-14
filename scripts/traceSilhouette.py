"""Trace a black-on-white silhouette JPEG into an SVG path.

No potrace here, so: threshold, walk the boundary of every ink blob (and every
enclosed hole) with Moore-neighbour tracing, then simplify. The staircase a
pixel walk produces is smoothed by Chaikin and cut down by Ramer-Douglas-Peucker
until the path is short enough to paste into a component and still lands within
a pixel of the original.
"""

import sys
from collections import deque
from PIL import Image

THRESH = 128
MIN_BLOB = 40          # px; below this it is JPEG dirt, not the animal
MIN_HOLE = 25


def load(path):
    im = Image.open(path).convert("L")
    w, h = im.size
    px = im.load()
    return [[1 if px[x, y] < THRESH else 0 for x in range(w)] for y in range(h)], w, h


def components(grid, w, h, want, connectivity):
    """Label 4- or 8-connected runs of `want`, returning [(pixels, touches_border)]."""
    seen = [[False] * w for _ in range(h)]
    nbrs = (
        [(1, 0), (-1, 0), (0, 1), (0, -1)]
        if connectivity == 4
        else [(dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy]
    )
    out = []
    for sy in range(h):
        for sx in range(w):
            if seen[sy][sx] or grid[sy][sx] != want:
                continue
            q, pix, border = deque([(sx, sy)]), [], False
            seen[sy][sx] = True
            while q:
                x, y = q.popleft()
                pix.append((x, y))
                if x in (0, w - 1) or y in (0, h - 1):
                    border = True
                for dx, dy in nbrs:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and grid[ny][nx] == want:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            out.append((pix, border))
    return out


# Moore neighbourhood, clockwise from the west.
MOORE = [(-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1)]


def trace(mask, w, h):
    """Boundary of a single blob given as a set of pixels."""
    start = min(mask, key=lambda p: (p[1], p[0]))
    contour = [start]
    inside = lambda p: p in mask

    # Enter from the west of the topmost-leftmost pixel.
    cur, backtrack = start, (start[0] - 1, start[1])
    while True:
        idx = MOORE.index((backtrack[0] - cur[0], backtrack[1] - cur[1]))
        found = None
        for k in range(1, 9):
            cand_d = MOORE[(idx + k) % 8]
            cand = (cur[0] + cand_d[0], cur[1] + cand_d[1])
            if inside(cand):
                found = (cand, prev)
                break
            prev = cand
        if found is None:
            break
        nxt, backtrack = found
        if nxt == start and len(contour) > 2:
            break
        contour.append(nxt)
        cur = nxt
        if len(contour) > 4 * (w + h) * 4:
            break
    return contour


def rdp(points, eps):
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = (dx * dx + dy * dy) ** 0.5 or 1.0
    worst, wi = 0.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm
        if d > worst:
            worst, wi = d, i
    if worst <= eps:
        return [points[0], points[-1]]
    return rdp(points[: wi + 1], eps)[:-1] + rdp(points[wi:], eps)


def chaikin(points, rounds=2):
    for _ in range(rounds):
        out = []
        n = len(points)
        for i in range(n):
            (x1, y1), (x2, y2) = points[i], points[(i + 1) % n]
            out.append((x1 * 0.75 + x2 * 0.25, y1 * 0.75 + y2 * 0.25))
            out.append((x1 * 0.25 + x2 * 0.75, y1 * 0.25 + y2 * 0.75))
        points = out
    return points


def to_path(contours, ox, oy, scale, digits=1):
    parts = []
    for c in contours:
        pts = [((x - ox) * scale, (y - oy) * scale) for x, y in c]
        d = f"M{pts[0][0]:.{digits}f} {pts[0][1]:.{digits}f}"
        for x, y in pts[1:]:
            d += f"L{x:.{digits}f} {y:.{digits}f}"
        parts.append(d + "Z")
    return "".join(parts)


def main(path, target_w, eps, out, smooth=2):
    grid, w, h = load(path)

    blobs = [(set(p), b) for p, b in components(grid, w, h, 1, 8) if len(p) >= MIN_BLOB]
    ink = set()
    for p, _ in blobs:
        ink |= p
    xs = [x for x, _ in ink]
    ys = [y for _, y in ink]
    ox, oy = min(xs), min(ys)
    src_w, src_h = max(xs) - ox + 1, max(ys) - oy + 1
    scale = target_w / src_w

    # Holes: background runs that do not reach the border.
    holes = [
        set(p)
        for p, border in components(grid, w, h, 0, 4)
        if not border and len(p) >= MIN_HOLE
    ]

    contours = []
    for mask, _ in blobs + [(m, False) for m in holes]:
        c = trace(mask, w, h)
        if len(c) < 8:
            continue
        c = rdp(chaikin(c, smooth) if smooth else c, eps)
        contours.append(c)

    d = to_path(contours, ox, oy, scale)
    vb_h = round(src_h * scale, 1)
    print(f"blobs={len(blobs)} holes={len(holes)} chars={len(d)} viewBox=0 0 {target_w} {vb_h}")
    open(out, "w").write(f'<svg viewBox="0 0 {target_w} {vb_h}" fill="currentColor" '
                         f'fill-rule="evenodd"><path d="{d}"/></svg>')


if __name__ == "__main__":
    main(sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4],
         int(sys.argv[5]) if len(sys.argv) > 5 else 2)

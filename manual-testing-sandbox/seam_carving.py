import numpy as np
from PIL import Image


def compute_energy(img):
    gray = np.asarray(img.convert('L'), dtype=np.float64)
    dy = np.abs(np.roll(gray, -1, axis=0) - np.roll(gray, 1, axis=0))
    dx = np.abs(np.roll(gray, -1, axis=1) - np.roll(gray, 1, axis=1))
    energy = dx + dy
    return energy


def compute_cumulative_energy(energy):
    h, w = energy.shape
    m = energy.copy()
    backtrack = np.zeros_like(m, dtype=np.int32)
    for i in range(1, h):
        for j in range(w):
            if j == 0:
                idx = np.argmin(m[i-1, j:j+2])
                backtrack[i, j] = idx + j
                min_energy = m[i-1, idx + j]
            else:
                idx = np.argmin(m[i-1, max(j-1,0):min(j+2,w)])
                backtrack[i, j] = idx + j - 1
                min_energy = m[i-1, idx + j - 1]
            m[i, j] += min_energy
    return m, backtrack


def find_seam(m, backtrack):
    h, w = m.shape
    seam = []
    j = np.argmin(m[-1])
    for i in reversed(range(h)):
        seam.append((i, j))
        j = backtrack[i, j]
    seam.reverse()
    return seam


def remove_seam(img, seam):
    arr = np.array(img)
    mask = np.ones((arr.shape[0], arr.shape[1]), dtype=np.bool_)
    for i, j in seam:
        mask[i, j] = False
    if arr.ndim == 3:
        arr_reduced = arr[mask].reshape((arr.shape[0], arr.shape[1]-1, arr.shape[2]))
    else:
        arr_reduced = arr[mask].reshape((arr.shape[0], arr.shape[1]-1))
    return Image.fromarray(arr_reduced.astype(np.uint8))


def seam_carve(img, num_remove):
    for _ in range(num_remove):
        energy = compute_energy(img)
        m, backtrack = compute_cumulative_energy(energy)
        seam = find_seam(m, backtrack)
        img = remove_seam(img, seam)
    return img


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Seam Carving Algorithm using Dynamic Programming')
    parser.add_argument('input_image', help='Path to input image')
    parser.add_argument('output_image', help='Path to save resized image')
    parser.add_argument('--reduce_width', type=int, default=50, help='Number of vertical seams to remove')
    args = parser.parse_args()

    img = Image.open(args.input_image)
    result = seam_carve(img, args.reduce_width)
    result.save(args.output_image)


if __name__ == "__main__":
    main()

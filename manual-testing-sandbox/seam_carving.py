import sys
import os
import argparse
import numpy as np
from PIL import Image
import matplotlib.pyplot as plt

class SeamCarver:
    def __init__(self, img: np.ndarray):
        if img.ndim == 2:
            # grayscale
            self.img = np.stack([img]*3, axis=-1).astype(np.float64)
        else:
            self.img = img.astype(np.float64)
        self.h, self.w, self.c = self.img.shape

    def energy_map(self):
        from scipy.ndimage import sobel
        # Calculate energy as the gradient magnitude
        gray = np.dot(self.img[..., :3], [0.299, 0.587, 0.114])
        dx = sobel(gray, axis=1)
        dy = sobel(gray, axis=0)
        energy = np.hypot(dx, dy)
        return energy

    def find_seam(self, energy=None):
        if energy is None:
            energy = self.energy_map()
        h, w = energy.shape
        seam = np.zeros(h, dtype=np.int32)
        cost = energy.copy()
        backtrack = np.zeros_like(cost, dtype=np.int32)

        for i in range(1, h):
            for j in range(0, w):
                if j == 0:
                    idx = np.argmin(cost[i-1, j:j+2])
                    backtrack[i, j] = idx + j
                    min_pre = cost[i-1, idx + j]
                else:
                    idx = np.argmin(cost[i-1, max(j-1,0):min(j+2,w)])
                    off = max(j-1,0)
                    backtrack[i, j] = idx + off
                    min_pre = cost[i-1, idx + off]
                cost[i, j] += min_pre

        seam[-1] = np.argmin(cost[-1])
        for i in range(h-2, -1, -1):
            seam[i] = backtrack[i+1, seam[i+1]]

        return seam

    def remove_seam(self, seam):
        h, w, c = self.img.shape
        output = np.zeros((h, w-1, c))
        for i in range(h):
            output[i, :, :] = np.delete(self.img[i, :, :], seam[i], axis=0)
        self.img = output
        self.h, self.w, self.c = self.img.shape

    def seam_carve(self, new_width, vis_callback=None):
        assert new_width <= self.w
        for i in range(self.w - new_width):
            energy = self.energy_map()
            seam = self.find_seam(energy)
            if vis_callback:
                vis_callback(self.img.astype(np.uint8), seam)
            self.remove_seam(seam)
        return self.img.astype(np.uint8)

    def show_with_seam(self, seam):
        import matplotlib.pyplot as plt
        img = self.img.astype(np.uint8).copy()
        for i, s in enumerate(seam):
            img[i, s, :] = [255, 0, 0]
        plt.imshow(img)
        plt.axis('off')
        plt.show()


def load_image(path):
    try:
        img = Image.open(path)
        img = img.convert('RGB')
        return np.array(img)
    except Exception as e:
        print(f"Error loading image: {e}")
        sys.exit(1)

def save_image(arr, path):
    img = Image.fromarray(arr.astype(np.uint8))
    img.save(path)

def visualize_result(orig, result):
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    axes[0].imshow(orig.astype(np.uint8))
    axes[0].set_title('Original')
    axes[0].axis('off')
    axes[1].imshow(result.astype(np.uint8))
    axes[1].set_title('Seam Carved')
    axes[1].axis('off')
    plt.show()

def parse_args():
    parser = argparse.ArgumentParser(description='Seam Carving for content-aware image resizing')
    parser.add_argument('input', type=str, help='Input image path')
    parser.add_argument('--out', type=str, default=None, help='Output image path (optional)')
    parser.add_argument('--width', type=int, default=None, help='Target width after seam carving')
    parser.add_argument('--vis', action='store_true', help='Show original and resized image')
    return parser.parse_args()

def main():
    args = parse_args()
    img_arr = load_image(args.input)
    orig_img = img_arr.copy()

    if args.width is None:
        print('Target width must be specified with --width.')
        sys.exit(1)
    if args.width > img_arr.shape[1]:
        print('Only shrinking (width decrease) is supported in this version.')
        sys.exit(1)

    carver = SeamCarver(img_arr)
    result = carver.seam_carve(args.width)

    if args.out is not None:
        save_image(result, args.out)
        print(f'Seam carved image saved to {args.out}')

    if args.vis:
        visualize_result(orig_img, result)

def test_seam_carver():
    # Simple test: shrink a synthetic image
    img = np.ones((10, 10, 3), dtype=np.uint8) * 255
    img[:, 5, :] = 0  # vertical black line, should be protected last
    carver = SeamCarver(img.copy())
    result = carver.seam_carve(5)
    assert result.shape[1] == 5
    # After removal, black line is likely still visible in at least one column
    assert np.any(np.all(result == 0, axis=-1)), f"Black seam was lost prematurely: {result}"

if __name__ == '__main__':
    main()

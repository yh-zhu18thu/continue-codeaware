import numpy as np
import cv2
from matplotlib import pyplot as plt


def compute_energy(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    # Use Sobel filter to compute gradient magnitude as energy
    sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    energy = np.abs(sobelx) + np.abs(sobely)
    return energy


def cumulative_map_vertical(energy):
    h, w = energy.shape
    M = np.zeros_like(energy)
    backtrack = np.zeros_like(energy, dtype=np.int)
    M[0] = energy[0]
    for i in range(1, h):
        for j in range(0, w):
            left = M[i-1, j-1] if j-1 >= 0 else float('inf')
            up = M[i-1, j]
            right = M[i-1, j+1] if j+1 < w else float('inf')
            min_idx = np.argmin([left, up, right])
            M[i, j] = energy[i, j] + [left, up, right][min_idx]
            backtrack[i, j] = j + (min_idx - 1)
    return M, backtrack


def find_seam(M, backtrack):
    h, w = M.shape
    seam = np.zeros(h, dtype=np.int)
    seam[-1] = np.argmin(M[-1])
    for i in range(h-2, -1, -1):
        seam[i] = backtrack[i+1, seam[i+1]]
    return seam


def remove_seam(image, seam):
    h, w, c = image.shape
    output = np.zeros((h, w-1, c), dtype=image.dtype)
    for i in range(h):
        col = seam[i]
        output[i, :, :] = np.delete(image[i, :, :], col, axis=0)
    return output


def seam_carve(image, scale_width=0.8, out_path=None):
    out = image.copy()
    new_width = int(image.shape[1] * scale_width)
    num_seams = image.shape[1] - new_width
    for _ in range(num_seams):
        energy = compute_energy(out)
        M, backtrack = cumulative_map_vertical(energy)
        seam = find_seam(M, backtrack)
        out = remove_seam(out, seam)
    if out_path is not None:
        cv2.imwrite(out_path, out)
    return out


def show_images(before, after):
    plt.figure(figsize=(12, 6))
    plt.subplot(1, 2, 1)
    plt.title('Original')
    plt.imshow(cv2.cvtColor(before, cv2.COLOR_BGR2RGB))
    plt.axis('off')
    plt.subplot(1, 2, 2)
    plt.title('Seam Carved')
    plt.imshow(cv2.cvtColor(after, cv2.COLOR_BGR2RGB))
    plt.axis('off')
    plt.show()


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Seam Carving缩放演示')
    parser.add_argument('input_image', type=str, help='输入图片路径')
    parser.add_argument('--output', type=str, default='seam_carved_output.jpg', help='输出图片路径')
    parser.add_argument('--scale', type=float, default=0.8, help='缩放宽度比例 (0~1)')
    args = parser.parse_args()

    image = cv2.imread(args.input_image)
    if image is None:
        print('图片加载失败:', args.input_image)
        return
    result = seam_carve(image, scale_width=args.scale, out_path=args.output)
    print(f'输出已保存到: {args.output}')
    show_images(image, result)

if __name__ == '__main__':
    main()

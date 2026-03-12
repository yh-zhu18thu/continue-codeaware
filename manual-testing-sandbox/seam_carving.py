import numpy as np
import matplotlib.pyplot as plt
from PIL import Image


def load_and_show_image(image_path):
    image = Image.open(image_path)
    img_arr = np.array(image)
    plt.figure(figsize=(8, 8))
    plt.axis('off')
    plt.title('Original Image')
    plt.imshow(img_arr)
    plt.show()
    return img_arr


def compute_energy(img_arr):
    # 灰度化
    if img_arr.ndim == 3:
        gray = np.dot(img_arr[..., :3], [0.299, 0.587, 0.114])
    else:
        gray = img_arr.astype('float')
    # 使用Sobel算子计算梯度
    from scipy.ndimage import sobel
    dx = sobel(gray, axis=1)
    dy = sobel(gray, axis=0)
    energy = np.hypot(dx, dy)
    return energy


def find_seam(energy):
    h, w = energy.shape
    seam_cost = energy.copy()
    backtrack = np.zeros_like(seam_cost, dtype=np.int)

    for i in range(1, h):
        for j in range(0, w):
            # 边界条件
            if j == 0:
                idx = np.argmin(seam_cost[i - 1, j:j + 2])
                backtrack[i, j] = idx + j
                min_pre = seam_cost[i - 1, idx + j]
            else:
                idx = np.argmin(seam_cost[i - 1, j - 1:j + 2])
                backtrack[i, j] = idx + j - 1
                min_pre = seam_cost[i - 1, idx + j - 1]
            seam_cost[i, j] += min_pre

    # 回溯寻找最小路径
    seam = np.zeros(h, dtype=np.int)
    seam[-1] = np.argmin(seam_cost[-1])
    for i in range(h - 2, -1, -1):
        seam[i] = backtrack[i + 1, seam[i + 1]]
    return seam


def remove_seam(img_arr, seam):
    h, w = img_arr.shape[:2]
    if img_arr.ndim == 3:
        output = np.zeros((h, w - 1, 3), dtype=img_arr.dtype)
        for i in range(h):
            output[i, :, 0] = np.delete(img_arr[i, :, 0], seam[i])
            output[i, :, 1] = np.delete(img_arr[i, :, 1], seam[i])
            output[i, :, 2] = np.delete(img_arr[i, :, 2], seam[i])
    else:
        output = np.zeros((h, w - 1), dtype=img_arr.dtype)
        for i in range(h):
            output[i, :] = np.delete(img_arr[i, :], seam[i])
    return output


def seam_carve(img_arr, num_seams):
    carved = img_arr.copy()
    for _ in range(num_seams):
        energy = compute_energy(carved)
        seam = find_seam(energy)
        carved = remove_seam(carved, seam)
    return carved


def show_comparison(original, carved):
    plt.figure(figsize=(16, 8))
    plt.subplot(1, 2, 1)
    plt.axis('off')
    plt.title('Original Image')
    plt.imshow(original)
    plt.subplot(1, 2, 2)
    plt.axis('off')
    plt.title('Seam Carved Image')
    plt.imshow(carved)
    plt.show()


def save_image(img_arr, out_path):
    img = Image.fromarray(img_arr.astype(np.uint8))
    img.save(out_path)


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Seam Carving Demo')
    parser.add_argument('image_path', type=str, help='Path to image file')
    parser.add_argument('--out', type=str, default='carved_result.png', help='Output file path')
    parser.add_argument('--target_width', type=int, required=True, help='Desired output width (must be < original)')
    args = parser.parse_args()

    original = load_and_show_image(args.image_path)
    h, w = original.shape[:2]
    assert args.target_width < w, '目标宽度必须小于原始宽度'
    num_seams = w - args.target_width
    carved = seam_carve(original, num_seams)
    save_image(carved, args.out)
    show_comparison(original, carved)
    print(f'Seam carved image saved as: {args.out}')

if __name__ == '__main__':
    main()

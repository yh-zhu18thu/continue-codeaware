import argparse
import sys
import os
import numpy as np
import cv2
from matplotlib import pyplot as plt

def load_image(image_path):
    if not os.path.isfile(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError("Failed to load image. Unsupported format or corrupted file.")
    image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    return image

def save_image(image, file_path):
    image_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    cv2.imwrite(file_path, image_bgr)

def show_comparison(original, carved):
    plt.figure(figsize=(10,5))
    plt.subplot(1,2,1)
    plt.title("Original")
    plt.axis('off')
    plt.imshow(original)
    plt.subplot(1,2,2)
    plt.title("Seam Carved")
    plt.axis('off')
    plt.imshow(carved)
    plt.show()

def compute_energy(image):
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    energy = np.hypot(sobelx, sobely)
    energy = energy / np.max(energy)
    return energy

def find_seam(energy):
    h, w = energy.shape
    seam = np.zeros((h,), dtype=np.int32)
    cost = energy.copy()
    backtrack = np.zeros_like(cost, dtype=np.int32)
    for i in range(1, h):
        for j in range(0, w):
            min_pre = cost[i-1, j]
            idx = j
            if j > 0 and cost[i-1, j-1] < min_pre:
                min_pre = cost[i-1, j-1]
                idx = j-1
            if j < w-1 and cost[i-1, j+1] < min_pre:
                min_pre = cost[i-1, j+1]
                idx = j+1
            cost[i, j] += min_pre
            backtrack[i, j] = idx
    seam[-1] = np.argmin(cost[-1])
    for i in range(h-2, -1, -1):
        seam[i] = backtrack[i+1, seam[i+1]]
    return seam

def remove_seam(image, seam):
    h, w, c = image.shape
    output = np.zeros((h, w-1, c), dtype=image.dtype)
    for i in range(h):
        output[i,:, :] = np.delete(image[i, :, :], seam[i], axis=0)
    return output

def carve_column(image, num_remove):
    carved = image.copy()
    for _ in range(num_remove):
        energy = compute_energy(carved)
        seam = find_seam(energy)
        carved = remove_seam(carved, seam)
    return carved

def transpose_image(image):
    return np.transpose(image, (1,0,2))

def carve_row(image, num_remove):
    """Remove horizontal seams (rows) by transposing image, removing columns, then transposing back."""
    transposed = transpose_image(image)
    carved = carve_column(transposed, num_remove)
    return transpose_image(carved)

def carve_image(image, new_width, new_height):
    h, w, _ = image.shape
    assert new_width <= w and new_height <= h
    carved = image
    if new_width < w:
        num = w - new_width
        carved = carve_column(carved, num)
    if new_height < h:
        num = h - new_height
        carved = carve_row(carved, num)
    return carved

def valid_image_path(path):
    ext = os.path.splitext(path)[1].lower()
    if ext not in ['.jpg', '.jpeg', '.png', '.bmp']:
        raise argparse.ArgumentTypeError('Unsupported image format.')
    return path

def main():
    parser = argparse.ArgumentParser(description="Seam Carving (内容感知缩放) 工具")
    parser.add_argument("-i", "--input", type=valid_image_path, required=True, help="输入图片路径")
    parser.add_argument("-o", "--output", type=str, required=True, help="输出图片保存路径")
    parser.add_argument("-W", "--width", type=int, help="目标宽度（像素）")
    parser.add_argument("-H", "--height", type=int, help="目标高度（像素）")
    parser.add_argument("-d", "--display", action="store_true", help="是否显示图片对比图")
    args = parser.parse_args()
    try:
        image = load_image(args.input)
    except Exception as e:
        print(f"加载图像失败: {e}")
        sys.exit(1)
    h, w, _ = image.shape
    new_width = args.width if args.width else w
    new_height = args.height if args.height else h
    if new_width > w or new_height > h or new_width <= 0 or new_height <= 0:
        print("目标尺寸无效，需小于等于原始尺寸且大于0.")
        sys.exit(1)
    try:
        carved = carve_image(image, new_width, new_height)
    except Exception as e:
        print(f"缩放处理失败: {e}")
        sys.exit(1)
    try:
        save_image(carved, args.output)
    except Exception as e:
        print(f"保存图片失败: {e}")
        sys.exit(1)
    if args.display:
        show_comparison(image, carved)
    print(f"处理完成，输出图片保存在: {args.output}")

if __name__ == "__main__":
    main()

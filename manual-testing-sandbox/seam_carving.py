import numpy as np
import cv2
import sys
from typing import Tuple
import argparse


def load_and_preprocess_image(image_path: str) -> np.ndarray:
    """
    Step 1: 加载并预处理输入图像。
    读取原始图像并转换为float32数组。
    """
    img = cv2.imread(image_path)
    if img is None:
        print(f"无法加载图片: {image_path}")
        sys.exit(1)
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = img.astype(np.float32)
    return img


def check_and_adjust_target_shape(img: np.ndarray, target_width: int, target_height: int) -> Tuple[int, int, int, int]:
    """
    Step 2: 检查与调整图像尺寸参数，确保目标宽高合法。
    返回原始尺寸和目标需调整的seam数量
    """
    h, w, _ = img.shape
    if target_width >= w or target_height >= h:
        print("目标尺寸须小于原始尺寸（仅支持缩小）")
        sys.exit(1)
    remove_w = w - target_width
    remove_h = h - target_height
    return w, h, remove_w, remove_h


def compute_energy(img: np.ndarray) -> np.ndarray:
    """
    Step 3: 生成图像能量图，利用Sobel算子。
    """
    gray = cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_RGB2GRAY)
    grad_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    energy = np.abs(grad_x) + np.abs(grad_y)
    return energy


def cumulative_energy_map(energy: np.ndarray) -> np.ndarray:
    """
    Step 4: 累积计算最小能量路径的累加能量表
    """
    h, w = energy.shape
    M = np.copy(energy)
    for i in range(1, h):
        for j in range(w):
            if j == 0:
                M[i, j] += min(M[i-1, j], M[i-1, j+1])
            elif j == w-1:
                M[i, j] += min(M[i-1, j-1], M[i-1, j])
            else:
                M[i, j] += min(M[i-1, j-1], M[i-1, j], M[i-1, j+1])
    return M


def find_seam(M: np.ndarray) -> np.ndarray:
    """
    Step 5: 回溯查找最优 seam 路径（从下至上）
    返回 seam 路径的列索引数组
    """
    h, w = M.shape
    seam = np.zeros(h, dtype=np.int32)
    seam[-1] = np.argmin(M[-1])
    for i in range(h-2, -1, -1):
        prev_x = seam[i+1]
        if prev_x == 0:
            idx = np.argmin(M[i, :2])
            seam[i] = idx
        elif prev_x == w-1:
            idx = np.argmin(M[i, w-2:w]) + (w-2)
            seam[i] = idx
        else:
            idx = np.argmin(M[i, prev_x-1:prev_x+2]) + (prev_x-1)
            seam[i] = idx
    return seam


def remove_seam(img: np.ndarray, seam: np.ndarray) -> np.ndarray:
    """
    Step 6: 从图像中删除 seam 路径
    沿着seam移除列像素
    """
    h, w, c = img.shape
    mask = np.ones((h, w), dtype=bool)
    mask[np.arange(h), seam] = False
    out = img[mask].reshape((h, w-1, c))
    return out


def display_progress(img: np.ndarray, step: int, axis: str):
    """
    Step 8: 更新图像显示与进度反馈
    """
    import matplotlib.pyplot as plt
    plt.clf()
    plt.title(f"Step {step} Removing {axis} seam")
    plt.imshow(img.astype(np.uint8))
    plt.pause(0.001)


def seam_carving(img: np.ndarray, target_width: int, target_height: int, show_progress=True) -> np.ndarray:
    """
    串联执行多次seam移除（步骤7, 循环步骤3-6）
    """
    import matplotlib.pyplot as plt
    current = img.copy()
    orig_h, orig_w, _ = img.shape
    num_seams_vertical = orig_w - target_width
    num_seams_horizontal = orig_h - target_height
    if show_progress:
        plt.ion()
        plt.figure(figsize=(8, 8))
    for i in range(num_seams_vertical):
        energy = compute_energy(current)
        M = cumulative_energy_map(energy)
        seam = find_seam(M)
        current = remove_seam(current, seam)
        if show_progress and (i % max(1, num_seams_vertical // 30) == 0):
            display_progress(current, i+1, 'vertical')
    # 对高度收缩，需要对图像转置，移除seam后再转回
    current = np.rot90(current, 1, (0, 1))
    for i in range(num_seams_horizontal):
        energy = compute_energy(current)
        M = cumulative_energy_map(energy)
        seam = find_seam(M)
        current = remove_seam(current, seam)
        if show_progress and (i % max(1, num_seams_horizontal // 30) == 0):
            display_progress(np.rot90(current, -1, (0, 1)), i+1, 'horizontal')
    current = np.rot90(current, -1, (0, 1))
    if show_progress:
        plt.ioff()
        plt.show()
    return current


def save_image(img: np.ndarray, path: str):
    """
    Step 9: 保存处理后的图像结果
    """
    out = cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_RGB2BGR)
    cv2.imwrite(path, out)
    print(f"保存结果: {path}")


def parse_args():
    parser = argparse.ArgumentParser(description='Seam Carving demo')
    parser.add_argument('input', help='Input image path')
    parser.add_argument('output', help='Output image path')
    parser.add_argument('--width', type=int, required=True, help='Target width')
    parser.add_argument('--height', type=int, required=True, help='Target height')
    parser.add_argument('--no-progress', action='store_true', help='Disable live progress display')
    return parser.parse_args()


def main():
    args = parse_args()
    img = load_and_preprocess_image(args.input)
    w, h, remove_w, remove_h = check_and_adjust_target_shape(img, args.width, args.height)
    print(f"原始尺寸: {w}x{h}, 目标尺寸: {args.width}x{args.height}")
    result = seam_carving(img, args.width, args.height, show_progress=not args.no_progress)
    save_image(result, args.output)


if __name__ == '__main__':
    main()

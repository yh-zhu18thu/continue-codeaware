import numpy as np
from PIL import Image, ImageDraw


def compute_energy(image):
    '''
    计算每个像素能量值（步骤1）
    能量=周边像素灰度的梯度和
    '''
    gray = np.asarray(image.convert("L"), dtype=np.float32)
    h, w = gray.shape
    energy = np.zeros((h, w), dtype=np.float32)
    dx = np.zeros_like(gray)
    dy = np.zeros_like(gray)
    dx[:, 1:-1] = gray[:, :-2] - gray[:, 2:]
    dy[1:-1, :] = gray[:-2, :] - gray[2:, :]
    energy = np.abs(dx) + np.abs(dy)
    energy[0, :] = energy[1, :]
    energy[-1, :] = energy[-2, :]
    energy[:, 0] = energy[:, 1]
    energy[:, -1] = energy[:, -2]
    return energy


def compute_cumulative_energy(energy):
    '''
    生成全图能量矩阵（步骤2）
    通过动态规划找最小路径（步骤3）
    '''
    h, w = energy.shape
    M = energy.copy()
    backtrack = np.zeros_like(M, dtype=np.int32)
    for i in range(1, h):
        for j in range(w):
            idx = j
            min_energy = M[i - 1, j]
            if j > 0 and M[i - 1, j - 1] < min_energy:
                min_energy = M[i - 1, j - 1]
                idx = j - 1
            if j < w - 1 and M[i - 1, j + 1] < min_energy:
                min_energy = M[i - 1, j + 1]
                idx = j + 1
            M[i, j] += min_energy
            backtrack[i, j] = idx
    return M, backtrack


def find_seam(M, backtrack):
    '''
    用动态规划寻找最小能量缝隙，记录路径（步骤3,4）
    '''
    h, w = M.shape
    seam = np.zeros(h, dtype=np.int32)
    seam[h - 1] = np.argmin(M[h - 1])
    for i in range(h - 2, -1, -1):
        seam[i] = backtrack[i + 1, seam[i + 1]]
    return seam


def show_seam(image, seam, color=(255, 0, 0)):
    '''
    展示最优缝隙路径（步骤4）
    '''
    imout = image.copy()
    draw = ImageDraw.Draw(imout)
    for i, col in enumerate(seam):
        draw.point((col, i), fill=color)
    return imout


def remove_seam(image, seam):
    '''
    移除缝隙后的像素重排（步骤5）
    '''
    arr = np.asarray(image)
    h, w = arr.shape[0], arr.shape[1]
    mask = np.ones((h, w), dtype=bool)
    mask[np.arange(h), seam] = False
    arr_reduced = arr[mask].reshape((h, w-1, arr.shape[2])) if arr.ndim==3 else arr[mask].reshape((h, w-1))
    if arr.ndim == 3:
        out = Image.fromarray(arr_reduced.astype(np.uint8))
    else:
        out = Image.fromarray(arr_reduced.astype(np.uint8), 'L')
    return out


def seam_carve(image, target_width, visualize_seam=False):
    '''
    自动循环缩小步骤直到达标(步骤6,7)，并输出最终图片（步骤8）
    '''
    img = image.copy()
    while img.width > target_width:
        energy = compute_energy(img)
        M, backtrack = compute_cumulative_energy(energy)
        seam = find_seam(M, backtrack)
        if visualize_seam:
            img_with_seam = show_seam(img, seam)
            # 展示每轮路径
            img_with_seam.show()
        img = remove_seam(img, seam)
    return img


def main():
    import argparse
    parser = argparse.ArgumentParser(description='动态规划 Seam Carving 缩小图像')
    parser.add_argument('input', help='输入图片路径')
    parser.add_argument('output', help='输出图片路径')
    parser.add_argument('--width', type=int, help='目标宽度', required=True)
    parser.add_argument('--show_seam', action='store_true', help='是否展示缝隙路径')
    args = parser.parse_args()

    image = Image.open(args.input).convert('RGB')
    out = seam_carve(image, args.width, visualize_seam=args.show_seam)
    out.save(args.output)
    print(f"图片已保存至 {args.output}")

if __name__ == '__main__':
    main()

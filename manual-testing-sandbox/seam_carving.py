import numpy as np
from PIL import Image


def load_image(path):
    """加载输入图像，返回PIL图像对象和原始数据的np数组"""
    img = Image.open(path).convert('RGB')
    arr = np.array(img)
    return img, arr


def preprocess_image(img):
    """将PIL图像转换为float类型的np数组"""
    return np.array(img).astype(np.float64)


def energy_map(img_arr):
    """能量图计算: 使用Sobel算子计算每个像素的能量"""
    from scipy.ndimage import sobel
    gray = np.dot(img_arr[..., :3], [0.299, 0.587, 0.114])
    dx = sobel(gray, axis=1)
    dy = sobel(gray, axis=0)
    energy = np.hypot(dx, dy)
    return energy


def find_seam(energy):
    """查找能量最小的竖直缝隙路径"""
    h, w = energy.shape
    cost = np.copy(energy)
    backtrack = np.zeros_like(cost, dtype=np.int32)
    for i in range(1, h):
        for j in range(0, w):
            if j == 0:
                idx = np.argmin(cost[i-1, j:j+2])
                backtrack[i, j] = idx + j
                min_energy = cost[i-1, idx + j]
            else:
                idx = np.argmin(cost[i-1, max(j-1,0):min(j+2,w)])
                backtrack[i, j] = idx + j - 1 if j > 0 else idx + j
                min_energy = cost[i-1, max(j-1, 0) + idx]
            cost[i, j] += min_energy
    seam = []
    j = np.argmin(cost[-1])
    seam.append(j)
    for i in range(h-1, 0, -1):
        j = backtrack[i, j]
        seam.append(j)
    seam.reverse()
    return seam


def remove_seam(img_arr, seam):
    """移除指定竖直缝隙"""
    h, w, c = img_arr.shape
    mask = np.ones((h, w), dtype=np.bool_)
    for i in range(h):
        mask[i, seam[i]] = False
    new_img = img_arr[mask].reshape((h, w-1, c))
    return new_img


def seam_carve(img_arr, num_seams):
    """循环多次移除竖直缝隙"""
    current_img = img_arr.copy()
    for _ in range(num_seams):
        energy = energy_map(current_img)
        seam = find_seam(energy)
        current_img = remove_seam(current_img, seam)
    return current_img


def save_image(img_arr, path):
    """保存输出结果"""
    img = Image.fromarray(np.clip(img_arr, 0, 255).astype(np.uint8))
    img.save(path)


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Seam Carving 图像缩放')
    parser.add_argument('input', type=str, help='输入图片文件路径')
    parser.add_argument('output', type=str, help='输出图片文件路径')
    parser.add_argument('--seams', type=int, default=50, help='移除的竖直缝隙数(默认50)')
    args = parser.parse_args()

    # 步骤1,2 加载和预处理
    img, arr = load_image(args.input)
    img_arr = preprocess_image(img)

    # 步骤3~7 能量计算+缝隙查找+多步裁剪
    out_arr = seam_carve(img_arr, args.seams)

    # 步骤8 保存
    save_image(out_arr, args.output)
    print(f"完成: 缩放后图片保存为 {args.output}")

if __name__ == '__main__':
    main()

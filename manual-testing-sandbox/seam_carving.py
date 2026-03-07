import numpy as np
import cv2
import matplotlib.pyplot as plt


def load_image(filename):
    """
    加载输入图像文件
    """
    image = cv2.imread(filename)
    if image is None:
        raise FileNotFoundError(f"File {filename} not found")
    image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    return image


def preprocess_image(image, target_shape=None):
    """
    预处理图像数据
    """
    if target_shape:
        image = cv2.resize(image, (target_shape[1], target_shape[0]), interpolation=cv2.INTER_LINEAR)
    return image


def compute_energy(image):
    """
    计算每个像素的能量值
    """
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    # 使用Sobel算子
    dx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    dy = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    energy = np.abs(dx) + np.abs(dy)
    return energy


def compute_cumulative_energy_map(energy):
    """
    计算累计能量图（用于寻找最优seam路径）
    """
    rows, cols = energy.shape
    M = energy.copy()
    backtrack = np.zeros_like(M, dtype=np.int)

    for i in range(1, rows):
        for j in range(0, cols):
            # 处理边界
            left = M[i-1, j-1] if j-1 >= 0 else float('inf')
            up = M[i-1, j]
            right = M[i-1, j+1] if j+1 < cols else float('inf')

            min_energy = min(left, up, right)
            if min_energy == left:
                backtrack[i, j] = j-1
            elif min_energy == up:
                backtrack[i, j] = j
            else:
                backtrack[i, j] = j+1
            M[i, j] += min_energy
    return M, backtrack


def find_vertical_seam(M, backtrack):
    """
    找到能量最小的垂直seam路径
    """
    rows, cols = M.shape
    seam = []
    # 从最后一行最小值开始
    j = np.argmin(M[-1])
    for i in range(rows-1, -1, -1):
        seam.append((i, j))
        j = backtrack[i, j]
    seam.reverse()
    return seam


def remove_vertical_seam(image, seam):
    """
    从图像和能量图中移除对应seam，实现内容感知缩放
    """
    rows, cols, _ = image.shape
    output = np.zeros((rows, cols-1, 3), dtype=image.dtype)
    for i, j in seam:
        output[i, :, :] = np.delete(image[i, :, :], j, axis=0)
    return output


def seam_carve(image, num_seams, direction='vertical'):
    """
    支持多次seam移除 + 支持垂直和水平Seam
    """
    out = image.copy()
    for _ in range(num_seams):
        if direction == 'vertical':
            energy = compute_energy(out)
            M, backtrack = compute_cumulative_energy_map(energy)
            seam = find_vertical_seam(M, backtrack)
            out = remove_vertical_seam(out, seam)
        elif direction == 'horizontal':
            # 转置实现横向缩放
            out = np.rot90(out, 1, (0,1))
            energy = compute_energy(out)
            M, backtrack = compute_cumulative_energy_map(energy)
            seam = find_vertical_seam(M, backtrack)
            out = remove_vertical_seam(out, seam)
            out = np.rot90(out, -1, (0,1))
        else:
            raise ValueError('direction must be vertical or horizontal')
    return out


def save_and_show_images(original, carved, out_path):
    """
    保存并展示处理后图像
    """
    carved_bgr = cv2.cvtColor(carved, cv2.COLOR_RGB2BGR)
    cv2.imwrite(out_path, carved_bgr)
    plt.figure(figsize=(12,6))
    plt.subplot(1,2,1)
    plt.title('Original')
    plt.imshow(original)
    plt.axis('off')
    plt.subplot(1,2,2)
    plt.title('Seam Carved')
    plt.imshow(carved)
    plt.axis('off')
    plt.tight_layout()
    plt.show()


def main():
    input_image_path = 'input.jpg'  # 输入文件
    output_image_path = 'output_seam_carved.jpg'
    num_seams = 50  # 设置要移除多少个垂直 seam
    num_horz_seams = 0  # 设置要移除多少个水平 seam

    img = load_image(input_image_path)
    img = preprocess_image(img)
    result = img.copy()
    if num_seams > 0:
        result = seam_carve(result, num_seams, direction='vertical')
    if num_horz_seams > 0:
        result = seam_carve(result, num_horz_seams, direction='horizontal')

    save_and_show_images(img, result, output_image_path)

if __name__ == '__main__':
    main()

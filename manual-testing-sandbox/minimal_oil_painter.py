import cv2
import numpy as np
import time


class MinimalOilPainter:
    """极简油画滤镜：通过局部亮度统计实现色块化"""

    def __init__(self, radius: int = 5, levels: int = 8):
        # 1) 滤镜参数接口：半径/等级数
        self.radius = int(radius)
        self.levels = int(levels)
        if self.radius < 1:
            raise ValueError("radius must be >= 1")
        if self.levels < 1:
            raise ValueError("levels must be >= 1")

    def paint(self, input_path: str, output_path: str):
        # 2) 读取图像并校验输入
        img = cv2.imread(input_path)
        if img is None:
            raise FileNotFoundError(f"无法读取文件: {input_path}")

        h, w = img.shape[:2]

        # 3) 生成灰度图用于量化
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        output = np.zeros_like(img)

        start_time = time.time()

        r = self.radius
        levels = self.levels

        # 5) 滑动窗口遍历有效像素（跳过边缘）
        for y in range(r, h - r):
            for x in range(r, w - r):
                roi_gray = gray[y - r : y + r + 1, x - r : x + r + 1]
                roi_color = img[y - r : y + r + 1, x - r : x + r + 1]

                # 4) 构建亮度等级映射：0-255 -> 0..levels-1
                intensity_map = (roi_gray.astype(np.uint32) * levels) // 256

                # 6) 统计邻域亮度频率与颜色和
                counts = np.zeros(levels, dtype=np.uint32)
                sum_bgr = np.zeros((levels, 3), dtype=np.uint32)

                flat_intensity = intensity_map.reshape(-1)
                flat_color = roi_color.reshape(-1, 3).astype(np.uint32)

                for i in range(flat_intensity.size):
                    lvl = int(flat_intensity[i])
                    counts[lvl] += 1
                    sum_bgr[lvl] += flat_color[i]

                # 7) 选择主导亮度等级
                max_lvl = int(np.argmax(counts))

                # 8) 计算平均颜色并写入画布
                c = int(counts[max_lvl])
                if c > 0:
                    output[y, x] = (sum_bgr[max_lvl] // c).astype(np.uint8)
                else:
                    output[y, x] = img[y, x]

        # 9) 保存结果并提供运行入口
        cv2.imwrite(output_path, output, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
        elapsed = time.time() - start_time
        print(f"转换完成！耗时: {elapsed:.2f}秒，已保存至: {output_path}")
        return output


if __name__ == "__main__":
    painter = MinimalOilPainter(radius=5, levels=8)
    painter.paint("input.jpg", "output.jpg")
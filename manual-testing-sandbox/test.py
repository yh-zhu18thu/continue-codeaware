import cv2
import numpy as np
import time

class MinimalOilPainter:
    """
    手动油画滤镜：仅通过局部亮度统计实现色块化
    """
    def __init__(self, radius=5, levels=8):
        # 笔触半径：越大，色块面积越大，画面越抽象
        self.radius = radius    
        # 亮度等级：值越小（如4或5），色块越粗犷，色彩越少
        self.levels = levels    

    def paint(self, input_path, output_path):
        """读取JPEG，应用纯粹的油画色块效果，保存为JPEG"""
        # 1. 简单的读取（JPEG）
        img = cv2.imread(input_path)
        if img is None:
            print(f"错误：无法读取文件 {input_path}")
            return

        h, w = img.shape[:2]
        # 计算用于量化统计的灰度图（这是唯一的、必须的预处理）
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # 创建一个全黑的画布，准备填色
        output = np.zeros_like(img)

        print(f"开始极简油画转换 {input_path} (等级: {self.levels}, 半径: {self.radius})...")
        start_time = time.time()

        # 2. 核心算法逻辑：手动局部强度统计双重循环
        # 这个嵌套循环遍历除了边缘外的每一个像素
        for y in range(self.radius, h - self.radius):
            for x in range(self.radius, w - self.radius):
                
                # A. 截取当前像素周围的局部窗口 (ROI)
                roi_gray = gray[y - self.radius : y + self.radius + 1, 
                                x - self.radius : x + self.radius + 1]
                roi_color = img[y - self.radius : y + self.radius + 1, 
                                x - self.radius : x + self.radius + 1]

                # B. 将 0-255 的连续灰度映射到有限的等级桶
                # 公式：Level = (GrayValue * levels) // 256
                # 这是实现“色块化”的关键步骤
                intensity_map = (roi_gray.astype(np.uint32) * self.levels // 256)
                
                # C. 手动统计邻域内不同等级出现的频率（counts）和颜色总和（sum_rgb）
                counts = np.zeros(self.levels + 1, dtype=np.uint32)
                sum_rgb = np.zeros((self.levels + 1, 3), dtype=np.uint32)
                
                # 将区域扁平化以便高效遍历
                flat_intensity = intensity_map.flatten()
                flat_color = roi_color.reshape(-1, 3)
                
                for i in range(len(flat_intensity)):
                    lvl = flat_intensity[i]
                    counts[lvl] += 1
                    sum_rgb[lvl] += flat_color[i]

                # D. 多数决原则：找到该邻域内出现次数最多的亮度等级
                max_lvl = np.argmax(counts)
                
                # E. 填色：使用该主导等级下所有像素的平均BGR颜色
                output[y, x] = sum_rgb[max_lvl] // counts[max_lvl]

        # 3. 将结果保存为JPEG
        cv2.imwrite(output_path, output, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
        print(f"转换完成！耗时: {time.time() - start_time:.2f}秒，已保存至: {output_path}")
        return output

if __name__ == "__main__":
    # 使用示例
    # 尝试调小 levels（例如 5）可以让色块效果更明显
    painter = MinimalOilPainter(radius=5, levels=8)
    painter.paint("input.jpg", "output_minimal.jpg")
import cv2
import numpy as np
import time

class MinimalOilPainter:
    """
    极简版手动油画滤镜：仅通过局部亮度统计实现色块化
    """
    def __init__(self, radius=5, levels=8):
        # 步骤2: 准备输出画布与参数设置
        self.radius = radius
        self.levels = levels

    def paint(self, input_path, output_path):
        # 步骤1: 加载输入图像文件
        img = cv2.imread(input_path)
        if img is None:
            print(f"错误：无法读取文件 {input_path}")
            return
        h, w = img.shape[:2]
        # 步骤2 (延续): 创建全黑画布
        output = np.zeros_like(img)
        # 灰度图以便进行亮度统计
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        print(f"开始极简油画转换 {input_path} (等级: {self.levels}, 半径: {self.radius})...")
        start_time = time.time()

        # 步骤3 & 4: 构建局部窗口统计模型，并实现邻域主色提取与应用
        for y in range(self.radius, h - self.radius):
            for x in range(self.radius, w - self.radius):
                # 局部窗口
                roi_gray = gray[y - self.radius:y + self.radius + 1,
                                x - self.radius:x + self.radius + 1]
                roi_color = img[y - self.radius:y + self.radius + 1,
                                x - self.radius:x + self.radius + 1]
                # 亮度量化分类
                intensity_map = (roi_gray.astype(np.uint32) * self.levels // 256)
                # 分类统计
                counts = np.zeros(self.levels + 1, dtype=np.uint32)
                sum_rgb = np.zeros((self.levels + 1, 3), dtype=np.uint32)
                flat_intensity = intensity_map.flatten()
                flat_color = roi_color.reshape(-1, 3)
                for i in range(len(flat_intensity)):
                    lvl = flat_intensity[i]
                    counts[lvl] += 1
                    sum_rgb[lvl] += flat_color[i]
                # 多数决策
                max_lvl = np.argmax(counts)
                # 平均主色上色
                output[y, x] = sum_rgb[max_lvl] // counts[max_lvl]

        # 步骤5: 合成最终油画风格图像（已在output中完成）
        # 步骤6: 保存处理后图像文件
        cv2.imwrite(output_path, output, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
        print(f"转换完成！耗时: {time.time() - start_time:.2f}秒，已保存至: {output_path}")
        return output

if __name__ == "__main__":
    # 用法示例
    painter = MinimalOilPainter(radius=5, levels=8) # 可修改参数体验不同效果
    painter.paint("input.jpg", "output_minimal.jpg")
